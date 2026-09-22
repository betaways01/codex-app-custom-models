/**
 * Current-turn image policy for vision-capable routed models.
 *
 * Codex resends every screenshot as a base64 data URL on every turn. Two failures follow:
 *   1. Upstreams cap the REQUEST BODY, not the token window. DeepSeek accepts 47.9 MiB and
 *      413s at 48 MiB; xAI's edge does the same for Grok.
 *   2. DeepSeek cache-miss costs 50x a cache-hit. Any rewrite of an early screenshot invalidates
 *      the entire cached prefix, which is how the previous age-tier ladder made long frontend
 *      threads expensive.
 *
 * Default policy matches a frontend sprint: view, understand, work, test, forget.
 *   - Images in the latest user/developer message, and anything after it (current-turn tool
 *     screenshots), are kept.
 *   - Images in earlier messages become a fixed one-line stub. The stub string never changes, so
 *     once a turn ages out the prefix is append-only again.
 *   - Kept images are encoded at most once (max edge 1280 px JPEG), content-addressed in process
 *     so retries of the same turn send identical bytes. New screenshots sit at the END of the
 *     prefix and cannot bust cache.
 *   - Emergency body cap ~40 MiB on the kept set (DeepSeek's wall is ~48 MiB).
 *
 * This function is only called for vision-capable models. Text-only models use the sidecar/strip
 * path in vision/index.ts and are untouched. Fail open: any internal error keeps the original
 * payload.
 *
 * Kill switches:
 *   OCX_IMAGE_BUDGET=off          disable everything
 *   OCX_IMAGE_HISTORY=keep        do not stub history; freeze-encode all images (escape hatch)
 *   OCX_IMAGE_BUDGET_MB           emergency cap, default 40
 *   OCX_IMAGE_MAX_EDGE            kept-image longest side, default 1280
 */

import { createHash } from "node:crypto";
import type { OcxContentPart, OcxImageContent, OcxParsedRequest, OcxTextContent } from "../types";

/** Emergency cap on the kept (current-turn) image share. DeepSeek's wall is ~48 MiB. */
export const DEFAULT_IMAGE_BASE64_BUDGET = 40 * 1024 * 1024;
export const DEFAULT_MAX_EDGE = 1280;
export const DEFAULT_JPEG_QUALITY = 70;
export const MAX_REENCODED_IMAGES = 80;

/** Stable stub. Must stay byte-identical across turns so the prefix can cache. */
export const STALE_IMAGE_TEXT = "[earlier screenshot omitted]";

const OVERFLOW_IMAGE_TEXT = "[screenshot omitted: current-turn image budget exceeded]";

const PASS_THROUGH_BASE64 = 400 * 1024;

function envOff(): boolean {
  const off = process.env.OCX_IMAGE_BUDGET;
  return off !== undefined && ["off", "0", "false", "no"].includes(off.trim().toLowerCase());
}

function envKeepHistory(): boolean {
  const raw = process.env.OCX_IMAGE_HISTORY;
  return raw !== undefined && ["keep", "all", "full"].includes(raw.trim().toLowerCase());
}

function envBudgetBytes(): number {
  const raw = process.env.OCX_IMAGE_BUDGET_MB;
  if (raw === undefined || raw.trim() === "") return DEFAULT_IMAGE_BASE64_BUDGET;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_IMAGE_BASE64_BUDGET;
  return Math.floor(mb * 1024 * 1024);
}

function envMaxEdge(): number {
  const raw = process.env.OCX_IMAGE_MAX_EDGE;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_EDGE;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 320 ? Math.floor(n) : DEFAULT_MAX_EDGE;
}

function envJpegQuality(): number {
  const raw = process.env.OCX_IMAGE_JPEG_QUALITY;
  if (raw === undefined || raw.trim() === "") return DEFAULT_JPEG_QUALITY;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30 && n <= 90 ? Math.floor(n) : DEFAULT_JPEG_QUALITY;
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
  return "data:" + mediaType + ";base64," + data;
}

function carriesImages(role: string): boolean {
  return role === "user" || role === "developer" || role === "toolResult";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface FreezeEntry {
  data: string;
  mediaType: string;
}

const freezeCache = new Map<string, FreezeEntry>();
const FREEZE_CACHE_MAX = 128;

function freezeGet(key: string): FreezeEntry | undefined {
  const hit = freezeCache.get(key);
  if (!hit) return undefined;
  freezeCache.delete(key);
  freezeCache.set(key, hit);
  return hit;
}

function freezeSet(key: string, value: FreezeEntry): void {
  if (freezeCache.has(key)) freezeCache.delete(key);
  freezeCache.set(key, value);
  while (freezeCache.size > FREEZE_CACHE_MAX) {
    const oldest = freezeCache.keys().next().value;
    if (oldest === undefined) break;
    freezeCache.delete(oldest);
  }
}

/** Test seam: drop the in-process freeze cache. */
export function resetImageFreezeCache(): void {
  freezeCache.clear();
}

async function encodeFrozen(
  decoded: DataUrlImage,
  maxEdge: number,
  quality: number,
): Promise<FreezeEntry> {
  const key = sha256(decoded.mediaType + "\0" + decoded.base64);
  const cached = freezeGet(key);
  if (cached) return cached;

  let result: FreezeEntry = { data: decoded.base64, mediaType: decoded.mediaType };
  try {
    const input = Buffer.from(decoded.base64, "base64");
    const image = new Bun.Image(input);
    const meta = await image.metadata();
    const w = typeof meta.width === "number" ? meta.width : 0;
    const h = typeof meta.height === "number" ? meta.height : 0;
    const oversized = w > maxEdge || h > maxEdge;
    const bulky = decoded.base64.length > PASS_THROUGH_BASE64;
    const passthroughType = decoded.mediaType === "image/jpeg"
      || decoded.mediaType === "image/png"
      || decoded.mediaType === "image/webp";

    if (!oversized && !bulky && passthroughType) {
      freezeSet(key, result);
      return result;
    }

    let pipeline = new Bun.Image(input);
    if (oversized && w > 0 && h > 0) {
      const scale = maxEdge / Math.max(w, h);
      pipeline = pipeline.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    }
    const out = await pipeline.jpeg({ quality }).toBuffer();
    result = { data: Buffer.from(out).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    // fail open: keep the original bytes for this image
  }
  freezeSet(key, result);
  return result;
}

interface Slot {
  msgIndex: number;
  partIndex: number;
  url: string;
  decoded: DataUrlImage;
  current: boolean;
}

function collectSlots(parsed: OcxParsedRequest): Slot[] {
  const messages = parsed.context.messages;
  let lastUser = -1;
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i]?.role;
    if (role === "user" || role === "developer") lastUser = i;
  }
  const slots: Slot[] = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    if (!msg || !carriesImages(msg.role) || !Array.isArray(msg.content)) continue;
    const parts = msg.content as OcxContentPart[];
    const current = lastUser === -1 ? true : mi >= lastUser;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      if (!part || part.type !== "image") continue;
      const decoded = parseDataUrlImage((part as OcxImageContent).imageUrl);
      if (!decoded) continue;
      slots.push({
        msgIndex: mi,
        partIndex: pi,
        url: (part as OcxImageContent).imageUrl,
        decoded,
        current,
      });
    }
  }
  return slots;
}

function replacePart(parsed: OcxParsedRequest, slot: Slot, next: OcxContentPart): void {
  const msg = parsed.context.messages[slot.msgIndex];
  if (!msg || !Array.isArray(msg.content)) return;
  (msg.content as OcxContentPart[])[slot.partIndex] = next;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function syncRawBody(
  raw: unknown,
  replacements: Map<string, string>,
  stubs: Map<string, string>,
): void {
  const rewriteUrl = (url: string): { kind: "replace"; url: string } | { kind: "stub"; text: string } | null => {
    const stub = stubs.get(url);
    if (stub !== undefined) return { kind: "stub", text: stub };
    const next = replacements.get(url);
    if (next !== undefined) return { kind: "replace", url: next };
    return null;
  };

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map(entry => {
        const rewritten = visit(entry);
        if (rewritten !== entry) changed = true;
        return rewritten;
      });
      return changed ? next : value;
    }
    if (!isPlainRecord(value)) return value;
    const type = typeof value.type === "string" ? value.type : "";

    if (type === "input_image" && typeof value.image_url === "string") {
      const action = rewriteUrl(value.image_url);
      if (action?.kind === "stub") return { type: "input_text", text: action.text };
      if (action?.kind === "replace") return { ...value, image_url: action.url };
      return value;
    }
    if (type === "image_url" || type === "image" || type === "input_image") {
      const url = typeof value.image_url === "string"
        ? value.image_url
        : (isPlainRecord(value.image_url) && typeof value.image_url.url === "string"
          ? value.image_url.url
          : (typeof value.url === "string" ? value.url : undefined));
      if (typeof url === "string") {
        const action = rewriteUrl(url);
        if (action?.kind === "stub") {
          return type === "input_image"
            ? { type: "input_text", text: action.text }
            : { type: "text", text: action.text };
        }
        if (action?.kind === "replace") {
          if (typeof value.image_url === "string") return { ...value, image_url: action.url };
          if (isPlainRecord(value.image_url)) {
            return { ...value, image_url: { ...value.image_url, url: action.url } };
          }
          return { ...value, url: action.url };
        }
      }
    }
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const rewritten = visit(value[key]);
      out[key] = rewritten;
      if (rewritten !== value[key]) changed = true;
    }
    return changed ? out : value;
  };

  if (!isPlainRecord(raw)) {
    visit(raw);
    return;
  }
  const next = visit(raw);
  if (next !== raw && isPlainRecord(next)) {
    for (const key of Object.keys(raw)) delete (raw as Record<string, unknown>)[key];
    Object.assign(raw, next);
  }
}

export async function enforceImageByteBudget(parsed: OcxParsedRequest): Promise<boolean> {
  try {
    if (envOff()) return false;

    const slots = collectSlots(parsed);
    if (slots.length === 0) return false;

    const keepHistory = envKeepHistory();
    const budget = envBudgetBytes();
    const maxEdge = envMaxEdge();
    const quality = envJpegQuality();
    const replacements = new Map<string, string>();
    const stubs = new Map<string, string>();
    let changed = false;

    const stale = keepHistory ? [] : slots.filter(s => !s.current);
    const kept = keepHistory ? slots : slots.filter(s => s.current);

    for (const slot of stale) {
      replacePart(parsed, slot, { type: "text", text: STALE_IMAGE_TEXT } as OcxTextContent);
      stubs.set(slot.url, STALE_IMAGE_TEXT);
      changed = true;
    }

    const encoded: { slot: Slot; nextUrl: string; size: number }[] = [];
    for (let i = 0; i < kept.length; i++) {
      const slot = kept[i];
      if (i >= MAX_REENCODED_IMAGES) {
        replacePart(parsed, slot, { type: "text", text: OVERFLOW_IMAGE_TEXT } as OcxTextContent);
        stubs.set(slot.url, OVERFLOW_IMAGE_TEXT);
        changed = true;
        continue;
      }
      const frozen = await encodeFrozen(slot.decoded, maxEdge, quality);
      encoded.push({ slot, nextUrl: toDataUrl(frozen.data, frozen.mediaType), size: frozen.data.length });
    }

    // Drop oldest current-turn images only when the kept set still exceeds the body cap.
    let total = encoded.reduce((sum, item) => sum + item.size, 0);
    for (const item of encoded) {
      if (total > budget) {
        replacePart(parsed, item.slot, { type: "text", text: OVERFLOW_IMAGE_TEXT } as OcxTextContent);
        stubs.set(item.slot.url, OVERFLOW_IMAGE_TEXT);
        total -= item.size;
        changed = true;
        continue;
      }
      if (item.nextUrl !== item.slot.url) {
        replacePart(parsed, item.slot, { type: "image", imageUrl: item.nextUrl } as OcxImageContent);
        replacements.set(item.slot.url, item.nextUrl);
        changed = true;
      }
    }

    if (changed && parsed._rawBody !== undefined) {
      syncRawBody(parsed._rawBody, replacements, stubs);
    }
    return changed;
  } catch {
    return false;
  }
}
