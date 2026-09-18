/**
 * Byte-budget guard for image-heavy requests on providers that accept images natively.
 *
 * Codex histories accumulate full-resolution screenshots as base64 data URLs and resend the whole
 * set every turn. Upstreams cap the REQUEST BODY, not the token window: DeepSeek answers
 * `413 Failed to buffer the request body: length limit exceeded` (app tier) or openresty
 * `413 Request Entity Too Large` (edge), and xAI's edge does the same. Measured 2026-09-18:
 * DeepSeek accepts 47.9 MiB and rejects 48 MiB, so a healthy 1M-token thread dies on bytes long
 * before it dies on context.
 *
 * The Anthropic adapter already solves this with a resize ladder
 * (adapters/anthropic-image-normalize.ts); this module applies the same proven machinery to the
 * wire-neutral parsed request, so every routed vision provider is protected without changing what
 * the model is asked to do.
 *
 * Contract:
 * - No-op unless data-URL images exist AND their combined base64 exceeds the budget.
 * - Images stay visible. Newest keep the highest fidelity; older ones become smaller JPEGs.
 * - Only when every image is terminal-floored and the total still exceeds the budget are the OLDEST
 *   replaced with a one-line note.
 * - Never throws into the request path: any failure keeps the original payload.
 */

import type { OcxContentPart, OcxImageContent, OcxParsedRequest, OcxTextContent } from "../types";
import { normalizeImageTargets, type NormalizeTarget } from "../adapters/anthropic-image-normalize";

/** Image share of the body. Mirrors the Anthropic total-image budget; DeepSeek's wall is ~48 MiB. */
export const DEFAULT_IMAGE_BASE64_BUDGET = 20 * 1024 * 1024;

const DROPPED_IMAGE_TEXT =
  "[image omitted: request byte budget exceeded; oldest screenshot replaced to keep the request inside the provider's body limit]";

/**
 * Hard ceiling on how many images are re-encoded in a single pass. Decoding + re-encoding is
 * CPU-bound (~90 ms per full-res screenshot on an M-series core), so an unbounded pass over a
 * pathological thread would stall the turn for minutes. Anything past this count is the OLDEST
 * surplus and is replaced with a note instead of re-encoded. Real Codex threads observed in
 * practice run 8-60 images, so this ceiling is far above normal use.
 */
export const MAX_REENCODED_IMAGES = 150;

const SURPLUS_IMAGE_TEXT =
  "[image omitted: too many screenshots in one request; the oldest ones were dropped to keep the request inside the provider's body limit]";

function envBudgetBytes(): number | null {
  const off = process.env.OCX_IMAGE_BUDGET;
  if (off !== undefined && ["off", "0", "false", "no"].includes(off.trim().toLowerCase())) return null;
  const raw = process.env.OCX_IMAGE_BUDGET_MB;
  if (raw === undefined || raw.trim() === "") return DEFAULT_IMAGE_BASE64_BUDGET;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_IMAGE_BASE64_BUDGET;
  return Math.floor(mb * 1024 * 1024);
}

interface DataUrlImage {
  mediaType: string;
  base64: string;
}

function parseDataUrlImage(url: string | undefined): DataUrlImage | null {
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const header = url.slice(5, comma);
  if (!header.includes("base64")) return null;
  const mediaType = (header.split(";")[0] || "image/png").trim().toLowerCase();
  if (!mediaType.startsWith("image/")) return null;
  const base64 = url.slice(comma + 1);
  return base64.length > 0 ? { mediaType, base64 } : null;
}

function toDataUrl(data: string, mediaType: string): string {
  return `data:${mediaType};base64,${data}`;
}

/** Roles whose content parts may carry images (mirrors vision/index.ts carriesImages). */
function carriesImages(role: string): boolean {
  return role === "user" || role === "developer" || role === "toolResult";
}

interface Slot {
  parse(): DataUrlImage | null;
  replace(url: string): void;
  drop(note?: string): void;
}

/**
 * Rewrite data-URL images anywhere in the raw (passthrough) body by value. The translated path
 * reads parsed.context.messages, but a provider on the passthrough wire forwards this verbatim, so
 * both views must agree. Matching by URL value keeps the two in sync even when their item counts
 * differ.
 */
function syncRawBodyImages(
  raw: unknown,
  replacements: Map<string, string>,
): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    if (type === "input_image" || type === "image_url" || type === "image") {
      const url = typeof record.image_url === "string"
        ? record.image_url
        : (typeof record.image_url === "object" && record.image_url !== null
          ? (record.image_url as Record<string, unknown>).url
          : undefined);
      if (typeof url === "string") {
        const next = replacements.get(url);
        if (next !== undefined) {
          if (typeof record.image_url === "string") record.image_url = next;
          else (record.image_url as Record<string, unknown>).url = next;
        }
      }
    }
    for (const key of Object.keys(record)) {
      if (key === "image_url") continue;
      visit(record[key]);
    }
  };
  visit(raw);
}

/**
 * Shrink the image share of a routed request so the upstream body cannot exceed the provider's
 * limit. Returns true when anything was rewritten. Safe to call on every request: it measures
 * first and returns immediately when the payload is already inside the budget.
 */
export async function enforceImageByteBudget(parsed: OcxParsedRequest): Promise<boolean> {
  try {
    const budget = envBudgetBytes();
    if (budget === null) return false;

    const slots: Slot[] = [];
    let total = 0;

    for (const msg of parsed.context.messages) {
      if (!carriesImages(msg.role) || !Array.isArray(msg.content)) continue;
      const parts = msg.content as OcxContentPart[];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part || part.type !== "image") continue;
        const imagePart = part as OcxImageContent;
        const decoded = parseDataUrlImage(imagePart.imageUrl);
        if (!decoded) continue;
        total += decoded.base64.length;
        const index = i;
        const url = imagePart.imageUrl;
        slots.push({
          parse: () => parseDataUrlImage((parts[index] as OcxImageContent | undefined)?.imageUrl),
          replace: (next: string) => {
            const current = parts[index];
            if (current && current.type === "image") (current as OcxImageContent).imageUrl = next;
          },
          drop: (note?: string) => {
            const replacement: OcxContentPart = { type: "text", text: note ?? DROPPED_IMAGE_TEXT } as OcxTextContent;
            parts[index] = replacement;
          },
        });
        void url;
      }
    }

    if (slots.length === 0 || total <= budget) return false;

    // Bound the re-encode work: drop the oldest surplus before the ladder runs so the guarantee
    // (total <= budget) still holds without an unbounded CPU pass.
    const surplus = slots.length - MAX_REENCODED_IMAGES;
    if (surplus > 0) {
      for (let i = 0; i < surplus; i++) slots[i]?.drop(SURPLUS_IMAGE_TEXT);
    }

    const originals = new Map<number, string>();
    slots.forEach((slot, index) => {
      const decoded = slot.parse();
      if (decoded) originals.set(index, toDataUrl(decoded.base64, decoded.mediaType));
    });

    const targets: NormalizeTarget[] = slots.map(slot => ({
      get base64(): string | null {
        return slot.parse()?.base64 ?? null;
      },
      get mediaType(): string {
        return slot.parse()?.mediaType ?? "image/png";
      },
      replace: (data: string, mediaType: string) => slot.replace(toDataUrl(data, mediaType)),
      drop: (note: string) => slot.drop(note),
    }));

    await normalizeImageTargets(targets, {
      // No processLimit: the ladder's aggregate loop needs EVERY image counted to guarantee the
      // total. (Anthropic passes 100 because its guard textifies the surplus afterwards; there is
      // no downstream guard here, so skipped images would silently stay full-size and overflow.)
      budget,
      overflowAction: "drop",
    });

    // Keep the passthrough view consistent with the translated one.
    const replacements = new Map<string, string>();
    slots.forEach((slot, index) => {
      const before = originals.get(index);
      if (before === undefined) return;
      const decoded = slot.parse();
      if (decoded) replacements.set(before, toDataUrl(decoded.base64, decoded.mediaType));
    });
    if (replacements.size > 0 && parsed._rawBody !== undefined) {
      syncRawBodyImages(parsed._rawBody, replacements);
    }

    return true;
  } catch {
    // fail open: a broken guard must never block the request
    return false;
  }
}
