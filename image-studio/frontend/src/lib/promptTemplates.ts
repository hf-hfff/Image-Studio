import type { PromptTemplate, PromptTemplateImage } from "../types/domain";

export const PROMPT_TEMPLATES_LS_KEY = "gptcodex.promptTemplates";
export const NEW_PROMPT_TEMPLATE_ID = "__new_prompt_template__";
export const MAX_PROMPT_TEMPLATE_IMAGES = 2;
export const MAX_PROMPT_TEMPLATE_IMAGE_BYTES = 5 * 1024 * 1024;

export type PromptHistoryEntry = {
  position: number;
  text: string;
};

export function buildPromptHistoryEntries(history: readonly string[]): PromptHistoryEntry[] {
  return history.map((text, index) => ({ position: index + 1, text }));
}

export type PromptTemplateManagerSelection =
  | {
    mode: "new";
    selectedId: typeof NEW_PROMPT_TEMPLATE_ID;
    initializeDraft: boolean;
  }
  | {
    mode: "selected";
    selectedId: string;
    template: PromptTemplate;
    initializeDraft: true;
  };

export function parsePromptTemplateImage(raw: unknown, index: number): PromptTemplateImage | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const path = typeof source.path === "string" ? source.path.trim() : "";
  if (!path) return null;
  const rawId = typeof source.id === "string" ? source.id.trim() : "";
  const image: PromptTemplateImage = {
    id: rawId || `img-${index + 1}-${path.length}`,
    path,
  };
  if (typeof source.imageId === "string" && source.imageId.trim()) image.imageId = source.imageId.trim();
  if (typeof source.width === "number" && Number.isFinite(source.width) && source.width > 0) image.width = source.width;
  if (typeof source.height === "number" && Number.isFinite(source.height) && source.height > 0) image.height = source.height;
  return image;
}

export function normalizePromptTemplateImages(raw: unknown): PromptTemplateImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => parsePromptTemplateImage(item, index))
    .filter((item): item is PromptTemplateImage => item !== null)
    .slice(0, MAX_PROMPT_TEMPLATE_IMAGES);
}

export function parsePromptTemplate(raw: unknown): PromptTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const label = typeof source.label === "string" ? source.label.trim() : "";
  const text = typeof source.text === "string" ? source.text.trim() : "";
  if (!id || !label || !text) return null;
  const createdAt = typeof source.createdAt === "number" ? source.createdAt : Date.now();
  const updatedAt = typeof source.updatedAt === "number" ? source.updatedAt : createdAt;
  const template: PromptTemplate = {
    id,
    label: label.slice(0, 40),
    text,
    createdAt,
    updatedAt,
  };
  const images = normalizePromptTemplateImages(source.images);
  if (images.length > 0) template.images = images;
  return template;
}

export function normalizePromptTemplates(raw: unknown): PromptTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => parsePromptTemplate(item)).filter((item): item is PromptTemplate => item !== null);
}

export function nextDefaultPromptTemplateLabel(templates: PromptTemplate[]): string {
  const used = new Set<number>();
  for (const item of templates) {
    const match = item.label.match(/^模板\s*(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return `模板${i}`;
}

export function resolvePromptTemplateManagerSelection(
  templates: PromptTemplate[],
  selectedId: string,
): PromptTemplateManagerSelection {
  if (selectedId === NEW_PROMPT_TEMPLATE_ID) {
    return {
      mode: "new",
      selectedId: NEW_PROMPT_TEMPLATE_ID,
      initializeDraft: false,
    };
  }
  const selectedTemplate = templates.find((item) => item.id === selectedId);
  if (selectedTemplate) {
    return {
      mode: "selected",
      selectedId,
      template: selectedTemplate,
      initializeDraft: true,
    };
  }
  if (templates.length > 0) {
    return {
      mode: "selected",
      selectedId: templates[0].id,
      template: templates[0],
      initializeDraft: true,
    };
  }
  return {
    mode: "new",
    selectedId: NEW_PROMPT_TEMPLATE_ID,
    initializeDraft: true,
  };
}

export function readStoredPromptTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(PROMPT_TEMPLATES_LS_KEY);
    if (!raw) return [];
    return normalizePromptTemplates(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistPromptTemplates(templates: PromptTemplate[]): void {
  try {
    localStorage.setItem(PROMPT_TEMPLATES_LS_KEY, JSON.stringify(templates));
  } catch {
    // localStorage can be unavailable in tests/previews.
  }
}
