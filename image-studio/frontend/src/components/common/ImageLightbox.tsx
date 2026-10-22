import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type LightboxImage = {
  src: string;
  alt?: string;
};

// 一级媒体查看层:覆盖在弹窗(9100)与浮层(9050)之上。
export function ImageLightbox({
  open,
  images,
  index,
  onClose,
  onIndexChange,
}: {
  open: boolean;
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}) {
  const total = images.length;
  const current = total > 0 ? Math.min(Math.max(index, 0), total - 1) : 0;
  const canPage = total > 1 && typeof onIndexChange === "function";

  const step = useCallback((delta: number) => {
    if (!canPage) return;
    onIndexChange?.((current + delta + total) % total);
  }, [canPage, current, onIndexChange, total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, step]);

  if (!open || total === 0) return null;

  const image = images[current];
  if (!image?.src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9300] flex flex-col items-center justify-center bg-black/82 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="示例图预览"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mb-3 flex w-full max-w-[92vw] items-center justify-between text-[12px] text-white/70">
        <span className="truncate">{image.alt || "示例图"}</span>
        <div className="flex items-center gap-3">
          {total > 1 && <span className="font-mono tabular-nums">{current + 1} / {total}</span>}
          <button
            type="button"
            onClick={onClose}
            title="关闭 (Esc)"
            className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        {canPage && (
          <button
            type="button"
            onClick={() => step(-1)}
            title="上一张"
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <img
          src={image.src}
          alt={image.alt || "示例图"}
          className="max-h-[82vh] max-w-[86vw] select-none object-contain shadow-[0_30px_80px_rgb(0_0_0_/_0.45)]"
          onClick={(event) => event.stopPropagation()}
        />
        {canPage && (
          <button
            type="button"
            onClick={() => step(1)}
            title="下一张"
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="mt-3 text-[11px] text-white/50">点击空白处或按 Esc 关闭</div>
    </div>,
    document.body,
  );
}
