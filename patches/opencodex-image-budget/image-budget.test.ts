const root = process.env.OPENCODEX_ROOT || "/opt/homebrew/lib/node_modules/@bitkyc08/opencodex";
const {
  enforceImageByteBudget,
  STALE_IMAGE_TEXT,
  resetImageFreezeCache,
} = await import(root + "/src/vision/image-budget.ts");

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const URL = "data:image/png;base64," + PNG;

function img() {
  return { type: "image", imageUrl: URL };
}
function text(t: string) {
  return { type: "text", text: t };
}
function req(messages: any[], raw?: unknown) {
  return {
    modelId: "deepseek-flash",
    stream: true,
    options: {},
    context: { messages },
    ...(raw ? { _rawBody: raw } : {}),
  } as any;
}

function fail(msg: string): never {
  console.error("FAIL", msg);
  process.exit(1);
}
function ok(msg: string) {
  console.log("ok", msg);
}

resetImageFreezeCache();
delete process.env.OCX_IMAGE_BUDGET;
delete process.env.OCX_IMAGE_HISTORY;
delete process.env.OCX_IMAGE_BUDGET_MB;

// 1. old user images stubbed, current user images kept
{
  const parsed = req([
    { role: "user", content: [text("first"), img()], timestamp: 1 },
    { role: "assistant", content: [text("ok")], timestamp: 2 },
    { role: "user", content: [text("second"), img(), img()], timestamp: 3 },
  ]);
  const changed = await enforceImageByteBudget(parsed);
  if (!changed) fail("expected change on mixed history");
  const first = parsed.context.messages[0].content;
  if (first[1].type !== "text" || first[1].text !== STALE_IMAGE_TEXT) fail("old image not stubbed");
  const cur = parsed.context.messages[2].content;
  if (cur[1].type !== "image" || cur[2].type !== "image") fail("current images dropped");
  ok("stubs old, keeps current");
}

// 2. tool images after last user stay
{
  const parsed = req([
    { role: "user", content: [text("old"), img()], timestamp: 1 },
    { role: "assistant", content: [text("ok")], timestamp: 2 },
    { role: "user", content: [text("now")], timestamp: 3 },
    { role: "toolResult", toolCallId: "1", toolName: "view_image", content: [img()], isError: false, timestamp: 4 },
  ]);
  await enforceImageByteBudget(parsed);
  if (parsed.context.messages[0].content[1].type !== "text") fail("old not stubbed");
  if (parsed.context.messages[3].content[0].type !== "image") fail("current tool image dropped");
  ok("keeps current-turn tool images");
}

// 3. off switch
{
  process.env.OCX_IMAGE_BUDGET = "off";
  const parsed = req([
    { role: "user", content: [img()], timestamp: 1 },
    { role: "assistant", content: [text("ok")], timestamp: 2 },
    { role: "user", content: [text("x")], timestamp: 3 },
  ]);
  const changed = await enforceImageByteBudget(parsed);
  if (changed) fail("off should no-op");
  if (parsed.context.messages[0].content[0].type !== "image") fail("off mutated history");
  delete process.env.OCX_IMAGE_BUDGET;
  ok("OCX_IMAGE_BUDGET=off");
}

// 4. keep-history does not stub
{
  process.env.OCX_IMAGE_HISTORY = "keep";
  const parsed = req([
    { role: "user", content: [img()], timestamp: 1 },
    { role: "assistant", content: [text("ok")], timestamp: 2 },
    { role: "user", content: [text("x"), img()], timestamp: 3 },
  ]);
  await enforceImageByteBudget(parsed);
  if (parsed.context.messages[0].content[0].type !== "image") fail("keep stubbed history");
  delete process.env.OCX_IMAGE_HISTORY;
  ok("OCX_IMAGE_HISTORY=keep");
}

// 5. raw body stubs input_image
{
  const url = URL;
  const raw = {
    input: [
      { type: "message", role: "user", content: [{ type: "input_image", image_url: url }] },
      { type: "message", role: "user", content: [{ type: "input_text", text: "now" }, { type: "input_image", image_url: url }] },
    ],
  };
  const parsed = req(
    [
      { role: "user", content: [img()], timestamp: 1 },
      { role: "user", content: [text("now"), img()], timestamp: 2 },
    ],
    raw,
  );
  await enforceImageByteBudget(parsed);
  const first = raw.input[0].content[0];
  if (first.type !== "input_text" || first.text !== STALE_IMAGE_TEXT) fail("raw body not stubbed");
  ok("syncs responses raw body");
}

// 6. freeze is deterministic
{
  resetImageFreezeCache();
  const parsed1 = req([{ role: "user", content: [img()], timestamp: 1 }]);
  const parsed2 = req([{ role: "user", content: [img()], timestamp: 1 }]);
  await enforceImageByteBudget(parsed1);
  await enforceImageByteBudget(parsed2);
  const a = parsed1.context.messages[0].content[0].imageUrl;
  const b = parsed2.context.messages[0].content[0].imageUrl;
  if (a !== b) fail("freeze not deterministic");
  ok("freeze deterministic");
}

console.log("all tests passed");
