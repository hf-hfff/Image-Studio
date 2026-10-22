import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon, Settings2 } from "lucide-react";
import { useStudioStore } from "../../state/studioStore";
import { usePlatform } from "../../platform/context";
import { buildPromptHistoryEntries } from "../../lib/promptTemplates";
import { usePromptTemplateImageSources } from "../../lib/promptTemplateImages";
import { historyPreviewSrc, useBlobURL } from "../../lib/images";
import { normalizeHistoryPrompt } from "../history/historyPromptGroups";
import { ImageLightbox, type LightboxImage } from "../common/ImageLightbox";
import { Modal } from "../common/Modal";
import type { HistoryItem } from "../../types/domain";

// 两个列表默认都只铺 3/5 条,弹窗高度固定,其余走「展开」或内部滚动。
const HISTORY_PREVIEW_COUNT = 5;
const TEMPLATE_PREVIEW_COUNT = 3;
const BUILTIN_PREVIEW_COUNT = 3;

const PROMPT_TEMPLATES: { label: string; text: string }[] = [
  { label: "写实摄影", text: "photorealistic, professional photography, 35mm, natural lighting, sharp focus, high detail" },
  { label: "电影感", text: "cinematic, dramatic lighting, shallow depth of field, film grain, anamorphic, 2.39:1" },
  { label: "二次元", text: "anime style, vibrant colors, cel shading, detailed illustration" },
  { label: "油画", text: "oil painting, thick brush strokes, classical art style, warm tones" },
  { label: "水彩", text: "watercolor painting, soft edges, pastel colors, paper texture" },
  { label: "扁平插画", text: "flat illustration, minimalist, geometric shapes, vector style" },
  { label: "3D 渲染", text: "3D render, octane render, ray tracing, glossy, studio lighting" },
  { label: "像素风", text: "pixel art, 16-bit, retro game style, limited palette" },
];

export function PromptPopover({
  onClose,
  onManageTemplates,
  onPick,
}: {
  onClose: () => void;
  onManageTemplates: () => void;
  onPick: (text: string) => void;
}) {
  const history = useStudioStore((s) => s.promptHistory);
  const historyEntries = buildPromptHistoryEntries(history);
  const promptTemplates = useStudioStore((s) => s.promptTemplates);
  const [tab, setTab] = useState<"templates" | "history">("templates");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [builtinExpanded, setBuiltinExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const { isMac, usesFluentUI } = usePlatform();

  const templateImages = useMemo(
    () => promptTemplates.flatMap((item) => item.images ?? []),
    [promptTemplates],
  );
  const templateSources = usePromptTemplateImageSources(templateImages);

  // 历史 prompt 只是字符串,和生成结果靠 prompt 文本关联:按归一化后的 prompt 建索引,
  // 同一个 prompt 多次生成的图会聚在一条下面(取最新一张做封面)。
  const imageHistory = useStudioStore((s) => s.history);
  const promptImageMap = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of imageHistory) {
      const key = normalizeHistoryPrompt(item.prompt);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [imageHistory]);

  const visibleHistory = historyExpanded ? historyEntries : historyEntries.slice(0, HISTORY_PREVIEW_COUNT);
  const hiddenHistoryCount = historyEntries.length - visibleHistory.length;

  const visibleTemplates = templateExpanded ? promptTemplates : promptTemplates.slice(0, TEMPLATE_PREVIEW_COUNT);
  const hiddenTemplateCount = promptTemplates.length - visibleTemplates.length;

  const visibleBuiltin = builtinExpanded ? PROMPT_TEMPLATES : PROMPT_TEMPLATES.slice(0, BUILTIN_PREVIEW_COUNT);
  const hiddenBuiltinCount = PROMPT_TEMPLATES.length - visibleBuiltin.length;

  const openTemplateLightbox = (images: { id: string; path: string }[], path: string) => {
    const resolved = images
      .map((image) => ({ src: templateSources[image.path] || "", alt: "示例图" }))
      .filter((item) => item.src);
    if (resolved.length === 0) return;
    const pathIndex = images.findIndex((image) => image.path === path);
    setLightbox({ images: resolved, index: Math.max(0, Math.min(pathIndex, resolved.length - 1)) });
  };

  const openHistoryImages = (items: HistoryItem[]) => {
    const images = items
      .map((item) => historyPreviewSrc(item, null))
      .filter((src) => src)
      .map((src) => ({ src, alt: "生成结果" }));
    if (images.length === 0) return;
    setLightbox({ images, index: 0 });
  };

  const radius = usesFluentUI ? "rounded-[8px]" : "rounded-[12px]";
  const rowRadius = usesFluentUI ? "rounded-[8px]" : "rounded-[14px]";

  const expandButton = (expanded: boolean, hidden: number, total: number, onToggle: () => void) => (
    <button
      type="button"
      onClick={onToggle}
      className={`mt-1 inline-flex items-center justify-center gap-1 self-center px-3 py-1.5 text-[11px] text-zinc-500 transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] dark:text-zinc-400 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
    >
      {expanded ? (
        <>
          收起 <ChevronUp className="h-3 w-3" />
        </>
      ) : (
        <>
          展开剩余 {hidden} 条（共 {total} 条）<ChevronDown className="h-3 w-3" />
        </>
      )}
    </button>
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="提示词模板与历史"
        width={isMac ? 780 : 740}
        bodyClassName="p-0!"
      >
        <div className={`flex flex-col ${isMac ? "h-[min(64vh,580px)]" : "h-[min(64vh,560px)]"}`}>
          <div className="flex items-center gap-4 border-b border-black/[0.06] px-4 dark:border-white/[0.05]">
            {([
              { key: "templates" as const, label: "模板" },
              { key: "history" as const, label: `历史 (${history.length})` },
            ]).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`relative -mb-px px-0.5 pb-2 pt-3 text-[12.5px] transition-colors ${
                  tab === item.key
                    ? "font-semibold text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {item.label}
                {tab === item.key && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--accent)]" />
                )}
              </button>
            ))}
            {tab === "templates" && (
              <button
                type="button"
                onClick={() => { onClose(); onManageTemplates(); }}
                className={`ml-auto my-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] ${radius}`}
              >
                <Settings2 className="h-3 w-3" /> 管理模板
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {tab === "templates" && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">自定义模板</span>
                  <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{promptTemplates.length}</span>
                </div>

                {promptTemplates.length === 0 ? (
                  <div className={`border border-dashed border-black/[0.08] px-4 py-6 text-center text-[12px] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-300 ${usesFluentUI ? "rounded-[12px]" : "rounded-[18px]"}`}>
                    还没有自定义模板
                  </div>
                ) : (
                  visibleTemplates.map((item) => {
                    const images = item.images ?? [];
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onPick(item.text); onClose(); }}
                        className={`flex h-20 w-full items-center gap-3 overflow-hidden px-2.5 py-2 text-left transition-colors hover:bg-[var(--accent-soft)] ${rowRadius}`}
                      >
                        {/* 单条高度锁死为示例图高(64px):标题单行截断,正文最多两行,超出裁掉 */}
                        <span className="flex h-16 min-w-0 flex-1 flex-col justify-center overflow-hidden">
                          <span className="block truncate text-[13px] font-semibold leading-5 text-zinc-900 dark:text-zinc-100">{item.label}</span>
                          <span className="mt-1 line-clamp-2 overflow-hidden text-[11.5px] leading-5 text-zinc-500 dark:text-zinc-300">{item.text}</span>
                        </span>
                        {images.length > 0 && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            {images.map((image, index) => {
                              const src = templateSources[image.path];
                              return (
                                <span
                                  key={image.id}
                                  role="button"
                                  tabIndex={-1}
                                  title="查看示例图"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openTemplateLightbox(images, image.path);
                                  }}
                                  className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.06] ${usesFluentUI ? "rounded-[6px]" : "rounded-[10px]"}`}
                                >
                                  {src ? (
                                    <img src={src} alt={`${item.label} 示例图 ${index + 1}`} className="h-full w-full object-cover" />
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
                {promptTemplates.length > TEMPLATE_PREVIEW_COUNT &&
                  expandButton(templateExpanded, hiddenTemplateCount, promptTemplates.length, () => setTemplateExpanded((value) => !value))}

                <div className="mt-3 flex items-center gap-2 border-t border-black/[0.06] px-1 pb-1 pt-3 dark:border-white/[0.06]">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">内置模板</span>
                  <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{PROMPT_TEMPLATES.length}</span>
                </div>

                {visibleBuiltin.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => { onPick(t.text); onClose(); }}
                    className={`w-full px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--accent-soft)] ${rowRadius}`}
                  >
                    <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{t.label}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-zinc-500 dark:text-zinc-300">{t.text}</div>
                  </button>
                ))}
                {PROMPT_TEMPLATES.length > BUILTIN_PREVIEW_COUNT &&
                  expandButton(builtinExpanded, hiddenBuiltinCount, PROMPT_TEMPLATES.length, () => setBuiltinExpanded((value) => !value))}
              </div>
            )}

            {tab === "history" && (
              historyEntries.length === 0 ? (
                <div className={`border border-dashed border-black/[0.08] px-4 py-10 text-center text-[12px] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-300 ${usesFluentUI ? "rounded-[12px]" : "rounded-[18px]"}`}>
                  还没有提交过 prompt
                </div>
              ) : (
                <div className="flex flex-col">
                  <ol className="m-0 list-none border-y border-black/[0.07] p-0 dark:border-white/[0.07]">
                    {visibleHistory.map((entry) => {
                      const generated = promptImageMap.get(normalizeHistoryPrompt(entry.text)) ?? [];
                      const cover = generated[0];
                      return (
                      <li
                        key={`${entry.position}:${entry.text}`}
                        className="border-b border-black/[0.07] last:border-b-0 dark:border-white/[0.07]"
                      >
                        <button
                          onClick={() => { onPick(entry.text); onClose(); }}
                          title={`使用第 ${entry.position} 条历史 prompt\n${entry.text}`}
                          className="prompt-history-entry flex min-h-[44px] w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--accent-soft)]"
                        >
                          <span
                            aria-hidden="true"
                            className="w-7 shrink-0 border-r border-black/[0.08] pr-2 text-right font-mono text-[10px] font-semibold tabular-nums leading-5 text-zinc-400 dark:border-white/[0.08] dark:text-zinc-500"
                          >
                            {String(entry.position).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] leading-6 text-zinc-700 dark:text-zinc-200">
                            {entry.text}
                          </span>
                          {cover && (
                            <HistoryImageThumb
                              item={cover}
                              count={generated.length}
                              onOpen={() => openHistoryImages(generated)}
                            />
                          )}
                        </button>
                      </li>
                      );
                    })}
                  </ol>
                  {historyEntries.length > HISTORY_PREVIEW_COUNT &&
                    expandButton(historyExpanded, hiddenHistoryCount, historyEntries.length, () => setHistoryExpanded((value) => !value))}
                </div>
              )
            )}
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

/** 历史条目右侧的生成结果缩略图:点开看该 prompt 生成的全部图片。 */
function HistoryImageThumb({
  item,
  count,
  onOpen,
}: {
  item: HistoryItem;
  count: number;
  onOpen: () => void;
}) {
  const previewURL = useBlobURL(item.previewBlob ?? item.imageBlob ?? null, item.imageB64 ?? null);
  const src = historyPreviewSrc(item, previewURL);

  return (
    <span
      role="button"
      tabIndex={-1}
      title={count > 1 ? `查看该提示词生成的 ${count} 张图` : "查看生成的图片"}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.06]"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
      )}
      {count > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl-[6px] bg-black/55 px-1 text-[9px] font-semibold leading-4 text-white">
          {count}
        </span>
      )}
    </span>
  );
}
