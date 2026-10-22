import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, FileText, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { ImageLightbox, type LightboxImage } from "../common/ImageLightbox";
import { useStudioStore } from "../../state/studioStore";
import {
  MAX_PROMPT_TEMPLATE_IMAGES,
  NEW_PROMPT_TEMPLATE_ID,
  nextDefaultPromptTemplateLabel,
  resolvePromptTemplateManagerSelection,
} from "../../lib/promptTemplates";
import {
  appendPromptTemplateImage,
  pickPromptTemplateImage,
  promptTemplateImageLimitLabel,
  removePromptTemplateImage,
  usePromptTemplateImageSources,
} from "../../lib/promptTemplateImages";
import { usePlatform } from "../../platform/context";
import { OpenExternalURL } from "../../platform/runtime/host";
import { openExternalURLForPlatform } from "../../platform/android/bridge";
import type { PromptTemplateImage } from "../../types/domain";

const PROMPT_WEBSITE_URL = "https://prompts.sorry.ink/";

export function PromptTemplateManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    prompt,
    promptTemplates,
    addPromptTemplate,
    updatePromptTemplate,
    deletePromptTemplate,
    pushToast,
  } = useStudioStore();
  const { usesFluentUI, isAndroidPhone, isAndroid } = usePlatform();
  const [selectedId, setSelectedId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftImages, setDraftImages] = useState<PromptTemplateImage[]>([]);
  const [pendingMarkdown, setPendingMarkdown] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const markdownInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDraftRef = useRef<{ label: string; text: string; images: PromptTemplateImage[] } | null>(null);

  const radius = usesFluentUI ? "rounded-[10px]" : "rounded-[14px]";
  const pill = usesFluentUI ? "rounded-[8px]" : "rounded-full";

  // 列表缩略图:一次性解析所有模板的示例图;草稿区的图单独解析。
  const listImages = useMemo(
    () => promptTemplates.flatMap((item) => item.images ?? []),
    [promptTemplates],
  );
  const listSources = usePromptTemplateImageSources(listImages);
  const draftSources = usePromptTemplateImageSources(draftImages);

  const selection = resolvePromptTemplateManagerSelection(promptTemplates, selectedId);
  const selectedTemplate = selection.mode === "selected" ? selection.template : null;

  // 只在 打开 / 切换选中项 时装载草稿;promptTemplates 变化不能覆盖正在编辑的草稿。
  const templatesRef = useRef(promptTemplates);
  templatesRef.current = promptTemplates;
  useEffect(() => {
    if (!open) return;
    const resolved = resolvePromptTemplateManagerSelection(templatesRef.current, selectedId);
    if (resolved.selectedId !== selectedId) {
      setSelectedId(resolved.selectedId);
      return;
    }
    const pending = pendingDraftRef.current;
    if (pending) {
      pendingDraftRef.current = null;
      setDraftLabel(pending.label);
      setDraftText(pending.text);
      setDraftImages(pending.images);
      return;
    }
    if (resolved.mode === "selected") {
      setDraftLabel(resolved.template.label);
      setDraftText(resolved.template.text);
      setDraftImages(resolved.template.images ?? []);
      return;
    }
    setDraftLabel(nextDefaultPromptTemplateLabel(templatesRef.current));
    setDraftText("");
    setDraftImages([]);
  }, [open, selectedId]);

  useEffect(() => {
    if (open) return;
    setPendingMarkdown(null);
    setLightbox(null);
    setPickingImage(false);
  }, [open]);

  function openPromptWebsite() {
    void openExternalURLForPlatform(PROMPT_WEBSITE_URL, OpenExternalURL).catch(() => {
      pushToast("无法打开提示词网站", "error");
    });
  }

  function startCreate(fromCurrentPrompt: boolean) {
    const draft = {
      label: nextDefaultPromptTemplateLabel(promptTemplates),
      text: fromCurrentPrompt ? prompt.trim() : "",
      images: [] as PromptTemplateImage[],
    };
    setPendingMarkdown(null);
    setDraftLabel(draft.label);
    setDraftText(draft.text);
    setDraftImages(draft.images);
    if (selectedId !== NEW_PROMPT_TEMPLATE_ID) {
      pendingDraftRef.current = draft;
      setSelectedId(NEW_PROMPT_TEMPLATE_ID);
    }
  }

  function saveTemplate() {
    if (selectedTemplate) {
      const ok = updatePromptTemplate(selectedTemplate.id, {
        label: draftLabel,
        text: draftText,
        images: draftImages,
      });
      if (!ok) {
        pushToast("模板标题和内容不能为空", "warn");
        return;
      }
      pushToast(`已更新模板「${draftLabel.trim()}」`, "success");
      return;
    }
    const id = addPromptTemplate(draftLabel, draftText, draftImages);
    if (!id) {
      pushToast("模板标题和内容不能为空", "warn");
      return;
    }
    setSelectedId(id);
    pushToast(`已保存模板「${draftLabel.trim()}」`, "success");
  }

  function deleteCurrentTemplate() {
    if (!selectedTemplate) return;
    if (!window.confirm(`确定删除模板「${selectedTemplate.label}」吗?`)) return;
    const removedId = selectedTemplate.id;
    const remaining = promptTemplates.filter((item) => item.id !== removedId);
    deletePromptTemplate(removedId);
    pushToast(`已删除模板「${selectedTemplate.label}」`, "success");
    if (remaining[0]) {
      setSelectedId(remaining[0].id);
    } else {
      startCreate(false);
    }
  }

  async function handleMarkdownFile(file: File | null | undefined) {
    if (!file) return;
    let raw = "";
    try {
      raw = await file.text();
    } catch {
      pushToast("无法读取文档内容", "error");
      return;
    }
    const text = raw.trim();
    if (!text) {
      pushToast("文档内容为空", "warn");
      return;
    }
    if (draftText.trim()) {
      setPendingMarkdown(text);
      return;
    }
    setDraftText(text);
    pushToast(`已导入「${file.name}」`, "success");
  }

  function confirmMarkdownOverwrite() {
    if (pendingMarkdown === null) return;
    setDraftText(pendingMarkdown);
    setPendingMarkdown(null);
    pushToast("已覆盖模板内容", "success");
  }

  async function addExampleImage() {
    if (isAndroid) {
      pushToast("示例图暂支持桌面端，移动端后续开放", "warn");
      return;
    }
    if (pickingImage) return;
    if (draftImages.length >= MAX_PROMPT_TEMPLATE_IMAGES) {
      pushToast(`最多添加 ${MAX_PROMPT_TEMPLATE_IMAGES} 张示例图`, "warn");
      return;
    }
    setPickingImage(true);
    try {
      const picked = await pickPromptTemplateImage(draftImages.length);
      if (!picked) return;
      if ("error" in picked) {
        pushToast(picked.error, "warn");
        return;
      }
      setDraftImages((current) => appendPromptTemplateImage(current, picked.image));
    } catch (error: any) {
      pushToast(`添加示例图失败：${error?.message ?? error}`, "error");
    } finally {
      setPickingImage(false);
    }
  }

  function openLightbox(images: PromptTemplateImage[], sources: Record<string, string>, path: string) {
    const resolved = images
      .map((image) => ({ src: sources[image.path] || "", alt: draftLabel || "示例图" }))
      .filter((item) => item.src);
    if (resolved.length === 0) return;
    const pathIndex = images.findIndex((image) => image.path === path);
    const index = Math.max(0, Math.min(pathIndex, resolved.length - 1));
    setLightbox({ images: resolved, index });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="提示词模板"
        width={isAndroidPhone ? 720 : 960}
        bodyClassName="p-0!"
      >
        <div className={`flex flex-col ${isAndroidPhone ? "h-[68vh]" : "h-[min(72vh,620px)]"}`}>
          <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-5 py-2.5 text-[12px] text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400">
            <span>去</span>
            <a
              href={PROMPT_WEBSITE_URL}
              onClick={(event) => {
                event.preventDefault();
                openPromptWebsite();
              }}
              className="font-medium text-[var(--accent)] underline decoration-[color:var(--accent)]/45 underline-offset-2 hover:opacity-80"
            >
              prompts.sorry.ink
            </a>
            <span className="truncate">找提示词，并通过网页一键导入本软件。</span>
          </div>

          <div className={`flex min-h-0 flex-1 ${isAndroidPhone ? "flex-col" : "flex-row"}`}>
            <aside
              className={`flex min-h-0 flex-col border-black/[0.06] dark:border-white/[0.06] ${
                isAndroidPhone ? "max-h-[180px] w-full border-b" : "w-[286px] shrink-0 border-r"
              }`}
            >
              <div className="flex gap-2 p-3">
                <button
                  type="button"
                  onClick={() => startCreate(false)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 border border-black/[0.08] px-3 py-2 text-[12px] text-zinc-700 transition-colors hover:border-[color:var(--accent)]/35 hover:text-[var(--accent)] dark:border-white/[0.08] dark:text-zinc-300 ${pill}`}
                >
                  <Plus className="h-3.5 w-3.5" /> 新建
                </button>
                <button
                  type="button"
                  onClick={() => startCreate(true)}
                  disabled={!prompt.trim()}
                  title="把当前提示词存成新模板"
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 border border-black/[0.08] px-3 py-2 text-[12px] text-zinc-700 transition-colors hover:border-[color:var(--accent)]/35 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-zinc-300 ${pill}`}
                >
                  <Edit3 className="h-3.5 w-3.5" /> 保存当前
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
                {promptTemplates.length === 0 ? (
                  <div className={`flex flex-1 flex-col items-center justify-center gap-1 border border-dashed border-black/[0.08] px-4 py-8 text-center text-[12px] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-300 ${radius}`}>
                    还没有自定义模板
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">点「新建」或「保存当前」开始</span>
                  </div>
                ) : (
                  promptTemplates.map((item) => {
                    const cover = item.images?.[0];
                    const coverSrc = cover ? listSources[cover.path] : "";
                    const active = selectedId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`flex w-full items-start gap-2.5 border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? "border-[color:var(--accent)]/35 bg-[var(--accent-soft)]"
                            : "border-transparent hover:border-black/[0.08] hover:bg-black/[0.02] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"
                        } ${usesFluentUI ? "rounded-[8px]" : "rounded-[12px]"}`}
                      >
                        {cover && (
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(event) => {
                              event.stopPropagation();
                              openLightbox(item.images ?? [], listSources, cover.path);
                            }}
                            className={`mt-0.5 h-10 w-10 shrink-0 overflow-hidden border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.06] ${usesFluentUI ? "rounded-[6px]" : "rounded-[8px]"}`}
                          >
                            {coverSrc ? (
                              <img src={coverSrc} alt={item.label} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-zinc-400">
                                <ImagePlus className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[12px] font-semibold ${active ? "text-[var(--accent)]" : "text-zinc-800 dark:text-zinc-100"}`}>
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{item.text}</span>
                        </span>
                        {item.images && item.images.length > 1 && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-black/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400">
                            {item.images.length}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    {selectedTemplate ? "编辑模板" : "新建模板"}
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{draftText.length}</span>
                </div>

                <input
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="模板标题"
                  className={`focus-ring w-full border border-black/[0.08] bg-[var(--surface)] px-3 py-2 text-[14px] text-zinc-900 dark:border-white/[0.08] dark:text-zinc-100 ${radius}`}
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">模板内容</span>
                  <button
                    type="button"
                    onClick={() => markdownInputRef.current?.click()}
                    className={`inline-flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] text-zinc-600 transition-colors hover:border-[color:var(--accent)]/35 hover:text-[var(--accent)] dark:border-white/[0.08] dark:text-zinc-300 ${pill}`}
                  >
                    <FileText className="h-3 w-3" /> 导入 md
                  </button>
                  <input
                    ref={markdownInputRef}
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void handleMarkdownFile(file);
                    }}
                  />
                </div>

                {pendingMarkdown !== null && (
                  <div className={`flex flex-wrap items-center gap-2 border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300 ${radius}`}>
                    <span className="flex-1">导入会覆盖当前模板内容，确定继续吗？</span>
                    <button
                      type="button"
                      onClick={confirmMarkdownOverwrite}
                      className={`bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-white ${pill}`}
                    >
                      覆盖导入
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingMarkdown(null)}
                      className={`border border-black/[0.08] px-2.5 py-1 text-[11px] text-zinc-600 dark:border-white/[0.12] dark:text-zinc-300 ${pill}`}
                    >
                      取消
                    </button>
                  </div>
                )}

                <textarea
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  placeholder="输入模板内容，或从 Markdown 文档导入"
                  className={`focus-ring min-h-[180px] w-full flex-1 resize-y border border-black/[0.08] bg-[var(--surface)] px-3 py-3 text-[14px] leading-[1.65] text-zinc-900 dark:border-white/[0.08] dark:text-zinc-100 ${radius}`}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    示例图（可选，最多 {MAX_PROMPT_TEMPLATE_IMAGES} 张，单张 ≤ {promptTemplateImageLimitLabel()}）
                  </span>
                  <div className="flex gap-2">
                    {draftImages.map((image) => (
                      <div
                        key={image.id}
                        className={`group relative h-16 w-16 overflow-hidden border border-black/[0.08] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.05] ${radius}`}
                      >
                        <button
                          type="button"
                          onClick={() => openLightbox(draftImages, draftSources, image.path)}
                          title="点击放大"
                          className="h-full w-full"
                        >
                          {draftSources[image.path] ? (
                            <img src={draftSources[image.path]} alt="示例图" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-zinc-400">
                              <ImagePlus className="h-4 w-4" />
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftImages((current) => removePromptTemplateImage(current, image.id))}
                          title="移除"
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {draftImages.length < MAX_PROMPT_TEMPLATE_IMAGES && (
                      <button
                        type="button"
                        onClick={() => void addExampleImage()}
                        disabled={pickingImage || isAndroid}
                        title={isAndroid ? "示例图暂支持桌面端" : "添加示例图"}
                        className={`flex h-16 w-16 flex-col items-center justify-center gap-1 border border-dashed border-black/[0.12] text-[10px] text-zinc-500 transition-colors hover:border-[color:var(--accent)]/40 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.12] dark:text-zinc-400 ${radius}`}
                      >
                        <ImagePlus className="h-4 w-4" />
                        {pickingImage ? "选择中" : isAndroid ? "桌面端" : "添加"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-3 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={deleteCurrentTemplate}
                  disabled={!selectedTemplate}
                  className={`inline-flex items-center justify-center gap-1.5 border border-black/[0.08] px-3 py-2 text-[12px] text-zinc-500 transition-colors hover:border-red-400/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-zinc-300 ${pill}`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`border border-black/[0.08] px-3.5 py-2 text-[12px] text-zinc-600 transition-colors hover:bg-black/[0.03] dark:border-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.06] ${pill}`}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={saveTemplate}
                    className={`inline-flex items-center justify-center gap-1.5 border border-[color:var(--accent)]/25 bg-[var(--accent-soft)] px-3.5 py-2 text-[12px] font-medium text-[var(--accent)] ${pill}`}
                  >
                    <Save className="h-3.5 w-3.5" /> 保存模板
                  </button>
                </div>
              </footer>
            </section>
          </div>
        </div>
      </Modal>

      <ImageLightbox
        open={lightbox !== null}
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        onIndexChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
      />
    </>
  );
}
