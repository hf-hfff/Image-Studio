import { useEffect, useState } from "react";
import {
  ImportImagePathToImports,
  OpenImageDialog,
  ReadImageAsBase64,
  RegisterImportedImageAsset,
} from "../platform/runtime/host";
import { dataURLFromBase64 } from "./images.ts";
import {
  MAX_PROMPT_TEMPLATE_IMAGES,
  MAX_PROMPT_TEMPLATE_IMAGE_BYTES,
  normalizePromptTemplateImages,
} from "./promptTemplates.ts";
import type { PromptTemplateImage } from "../types/domain.ts";

// 桌面媒体注册表是内存态(见 backend/media.go 的 mediaAssets),重启后清空,
// 而 /media/preview/<id> 依赖注册结果。因此同一个会话内按 path 缓存一次注册结果,
// 既避免反复生成 AVIF 预览,也让重启后的首次渲染自动重建。
const sourceCache = new Map<string, Promise<string>>();

function makeImageId(): string {
  return `tplimg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function promptTemplateImageLimitLabel(): string {
  return `${MAX_PROMPT_TEMPLATE_IMAGE_BYTES / (1024 * 1024)}MB`;
}

export function describePromptTemplateImageRejection(size: number, existingCount: number): string | null {
  if (existingCount >= MAX_PROMPT_TEMPLATE_IMAGES) return `最多添加 ${MAX_PROMPT_TEMPLATE_IMAGES} 张示例图`;
  if (size < 0) return "图片文件为空";
  // size === 0 表示宿主没给出体积(浏览器预览的虚拟文件),交给后端在落盘时兜底校验。
  if (size > MAX_PROMPT_TEMPLATE_IMAGE_BYTES) return `单张图片不能超过 ${promptTemplateImageLimitLabel()}`;
  return null;
}

/**
 * 解析一张示例图的可渲染地址。
 * 优先走托管媒体注册(/media/preview/<id>),非桌面宿主没有媒体路由时回退到
 * ReadImageAsBase64 的 dataURL,最后失败返回空串由 UI 显示占位。
 */
export function resolvePromptTemplateImageSrc(image: PromptTemplateImage): Promise<string> {
  const cached = sourceCache.get(image.path);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const ref = await RegisterImportedImageAsset(image.path);
      const src = ref?.previewUrl || (ref?.imageId ? `/media/preview/${ref.imageId}` : "");
      if (src) return src;
    } catch {
      // 路径不在托管目录 / 文件已被清理,走下面的 base64 兜底。
    }
    try {
      const raw = await ReadImageAsBase64(image.path);
      if (raw) return raw.startsWith("data:") ? raw : dataURLFromBase64(raw);
    } catch {
      // 读不到就交给 UI 占位。
    }
    return "";
  })();

  sourceCache.set(image.path, pending);
  void pending.then((src) => {
    if (!src) sourceCache.delete(image.path);
  });
  return pending;
}

/** 选图 + 大小校验 + 复制进托管目录 + 注册媒体。返回 null 表示用户取消。 */
export async function pickPromptTemplateImage(
  existingCount: number,
): Promise<{ image: PromptTemplateImage; src: string } | { error: string } | null> {
  if (existingCount >= MAX_PROMPT_TEMPLATE_IMAGES) {
    return { error: `最多添加 ${MAX_PROMPT_TEMPLATE_IMAGES} 张示例图` };
  }
  const picked = await OpenImageDialog();
  if (!picked?.path) return null;

  const rejection = describePromptTemplateImageRejection(picked.size ?? 0, existingCount);
  if (rejection) return { error: rejection };

  const name = picked.path.split(/[\\/]/).pop() ?? "template-image.png";
  const ref = await ImportImagePathToImports(picked.path, name);
  const savedPath = ref?.savedPath || picked.path;
  const image: PromptTemplateImage = { id: makeImageId(), path: savedPath };
  if (ref?.imageId) image.imageId = ref.imageId;
  const width = ref?.previewWidth || picked.previewWidth;
  const height = ref?.previewHeight || picked.previewHeight;
  if (width) image.width = width;
  if (height) image.height = height;

  const src = ref?.previewUrl || (ref?.imageId ? `/media/preview/${ref.imageId}` : "");
  if (src) sourceCache.set(savedPath, Promise.resolve(src));
  return { image, src: src || await resolvePromptTemplateImageSrc(image) };
}

/** 批量把模板示例图解析成可渲染地址;返回 { path: src } 字典。 */
export function usePromptTemplateImageSources(images: PromptTemplateImage[]): Record<string, string> {
  const [sources, setSources] = useState<Record<string, string>>({});
  const cacheKey = images.map((image) => image.path).join("|");

  useEffect(() => {
    let cancelled = false;
    if (images.length === 0) {
      setSources({});
      return;
    }
    const pending = Promise.all(
      images.map(async (image) => [image.path, await resolvePromptTemplateImageSrc(image)] as const),
    );
    void pending.then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [path, src] of entries) {
        if (src) next[path] = src;
      }
      setSources(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return sources;
}

/** 草稿里图片增删的纯逻辑,保证最多 2 张且路径去重。 */
export function appendPromptTemplateImage(
  current: PromptTemplateImage[],
  incoming: PromptTemplateImage,
): PromptTemplateImage[] {
  const next = normalizePromptTemplateImages([...current, incoming]);
  return next.filter((image, index) => next.findIndex((item) => item.path === image.path) === index);
}

export function removePromptTemplateImage(
  current: PromptTemplateImage[],
  imageId: string,
): PromptTemplateImage[] {
  return current.filter((image) => image.id !== imageId);
}
