import assert from "node:assert/strict";
import test from "node:test";

const promptTemplates = await import("../src/lib/promptTemplates.ts");

test("buildPromptHistoryEntries numbers prompts in display order", () => {
  assert.deepEqual(promptTemplates.buildPromptHistoryEntries(["newest", "older"]), [
    { position: 1, text: "newest" },
    { position: 2, text: "older" },
  ]);
});

test("normalizePromptTemplates keeps only valid templates", () => {
  const normalized = promptTemplates.normalizePromptTemplates([
    { id: "a", label: "模板1", text: "cat", createdAt: 1, updatedAt: 2 },
    { id: "", label: "bad", text: "x" },
    { id: "b", label: " ", text: "x" },
  ]);
  assert.deepEqual(normalized, [
    { id: "a", label: "模板1", text: "cat", createdAt: 1, updatedAt: 2 },
  ]);
});

test("normalizePromptTemplates drops templates without text", () => {
  const normalized = promptTemplates.normalizePromptTemplates([
    { id: "a", label: "有内容", text: "cat", createdAt: 1, updatedAt: 2 },
    { id: "b", label: "空内容", text: "   " },
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, "a");
});

test("normalizePromptTemplateImages keeps at most two valid images", () => {
  const normalized = promptTemplates.normalizePromptTemplateImages([
    { id: "i1", path: "/imports/a.png", imageId: "abc123", width: 64, height: 32 },
    { path: "   " },
    { path: "/imports/b.png" },
    { path: "/imports/c.png" },
  ]);
  assert.deepEqual(normalized.map((image) => image.path), ["/imports/a.png", "/imports/b.png"]);
  assert.equal(normalized[0].imageId, "abc123");
  assert.equal(normalized[0].width, 64);
  assert.ok(normalized[1].id.length > 0);
});

test("parsePromptTemplate keeps images but omits the field when empty", () => {
  const withImages = promptTemplates.parsePromptTemplate({
    id: "a", label: "模板", text: "cat", createdAt: 1, updatedAt: 1,
    images: [{ id: "i1", path: "/imports/a.png" }],
  });
  assert.equal(withImages.images.length, 1);

  const withoutImages = promptTemplates.parsePromptTemplate({
    id: "b", label: "模板", text: "cat", createdAt: 1, updatedAt: 1, images: [],
  });
  assert.equal(Object.hasOwn(withoutImages, "images"), false);
});

test("nextDefaultPromptTemplateLabel uses first available numeric slot", () => {
  const label = promptTemplates.nextDefaultPromptTemplateLabel([
    { id: "1", label: "模板1", text: "a", createdAt: 1, updatedAt: 1 },
    { id: "3", label: "模板3", text: "b", createdAt: 1, updatedAt: 1 },
  ]);
  assert.equal(label, "模板2");
});

test("resolvePromptTemplateManagerSelection keeps explicit new mode", () => {
  const resolved = promptTemplates.resolvePromptTemplateManagerSelection([
    { id: "1", label: "模板1", text: "a", createdAt: 1, updatedAt: 1 },
  ], promptTemplates.NEW_PROMPT_TEMPLATE_ID);
  assert.deepEqual(resolved, {
    mode: "new",
    selectedId: promptTemplates.NEW_PROMPT_TEMPLATE_ID,
    initializeDraft: false,
  });
});

test("resolvePromptTemplateManagerSelection falls back to first template", () => {
  const first = { id: "1", label: "模板1", text: "a", createdAt: 1, updatedAt: 1 };
  const resolved = promptTemplates.resolvePromptTemplateManagerSelection([first], "");
  assert.deepEqual(resolved, {
    mode: "selected",
    selectedId: "1",
    template: first,
    initializeDraft: true,
  });
});

test("resolvePromptTemplateManagerSelection initializes new mode when empty", () => {
  const resolved = promptTemplates.resolvePromptTemplateManagerSelection([], "");
  assert.deepEqual(resolved, {
    mode: "new",
    selectedId: promptTemplates.NEW_PROMPT_TEMPLATE_ID,
    initializeDraft: true,
  });
});
