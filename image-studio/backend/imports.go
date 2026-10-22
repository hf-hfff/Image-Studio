package backend

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yuanhua/image-gptcodex/pkg/client"
)

// ImportImageFromB64 persists a base64-encoded image (PNG/JPEG/WebP) into the
// imports directory and returns its absolute path. The legacy imageB64 field is
// intentionally left empty on Wails so imported files do not stay duplicated in
// frontend state.
//
// Used by:
//   - drag-and-drop / paste flows (App.tsx) — the file becomes a real edit source
//   - rotate / flip / crop derivatives (imageops.go) — they share the same destination
//
// suggestedName is sanitised; if empty, a timestamped name is generated.
func (s *Service) ImportImageFromB64(imageB64, suggestedName string) (ImportedImage, error) {
	if strings.TrimSpace(imageB64) == "" {
		return ImportedImage{}, errors.New("imageB64 is empty")
	}
	data, err := base64.StdEncoding.DecodeString(imageB64)
	if err != nil {
		return ImportedImage{}, fmt.Errorf("decode base64: %w", err)
	}
	if len(data) > client.MaxInputImageBytes {
		return ImportedImage{}, fmt.Errorf("图片超过 50MB,请换一张更小的图片")
	}

	dir, err := importsDir()
	if err != nil {
		return ImportedImage{}, err
	}
	if err := os.MkdirAll(dir, secureDirMode); err != nil {
		return ImportedImage{}, err
	}

	ext := guessExt(suggestedName, data)
	name := time.Now().Format("20060102-150405") + "-" + sanitiseName(suggestedName) + ext
	full := filepath.Join(dir, name)
	if err := os.WriteFile(full, data, secureFileMode); err != nil {
		return ImportedImage{}, fmt.Errorf("write import file: %w", err)
	}
	return ImportedImage{Path: full}, nil
}

// maxPromptTemplateImageBytes caps a single prompt-template sample image.
// 与前端 MAX_PROMPT_TEMPLATE_IMAGE_BYTES 保持一致;后端再校验一次,避免绕过 UI。
const maxPromptTemplateImageBytes int64 = 5 * 1024 * 1024

// ImportImagePathToImports 把用户已选中的图片复制进托管 imports 目录,并注册成媒体资产。
//
// 为什么不能直接引用用户原路径:RegisterImportedImageAsset 会调用
// ensureManagedReadablePath,托管目录之外的文件一律拒绝,而且托管路径才有稳定的
// /media/preview/<id> 预览。所以模板示例图必须先落盘到 imports。
func (s *Service) ImportImagePathToImports(path, suggestedName string) (MediaAssetRef, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return MediaAssetRef{}, errors.New("图片路径为空")
	}
	info, err := os.Stat(trimmed)
	if err != nil {
		return MediaAssetRef{}, err
	}
	if info.IsDir() {
		return MediaAssetRef{}, errors.New("请选择一个图片文件")
	}
	if info.Size() <= 0 {
		return MediaAssetRef{}, errors.New("图片文件为空")
	}
	if info.Size() > maxPromptTemplateImageBytes {
		return MediaAssetRef{}, fmt.Errorf("图片超过 %dMB,请换一张更小的图片", maxPromptTemplateImageBytes/(1024*1024))
	}

	dir, err := importsDir()
	if err != nil {
		return MediaAssetRef{}, err
	}
	if err := os.MkdirAll(dir, secureDirMode); err != nil {
		return MediaAssetRef{}, err
	}

	base := strings.TrimSpace(suggestedName)
	if base == "" {
		base = filepath.Base(trimmed)
	}
	ext := strings.ToLower(filepath.Ext(trimmed))
	if ext == "" {
		ext = ".png"
	}
	stem := sanitiseName(strings.TrimSuffix(filepath.Base(base), filepath.Ext(base)))
	now := time.Now()
	name := fmt.Sprintf("%s-%03d-%s%s", now.Format("20060102-150405"), now.Nanosecond()/1e6, stem, ext)
	target := filepath.Join(dir, name)

	src, err := os.Open(trimmed)
	if err != nil {
		return MediaAssetRef{}, err
	}
	defer src.Close()
	dst, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, secureFileMode)
	if err != nil {
		return MediaAssetRef{}, err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(target)
		return MediaAssetRef{}, err
	}
	if err := dst.Close(); err != nil {
		os.Remove(target)
		return MediaAssetRef{}, err
	}
	return s.RegisterImportedImageAsset(target)
}

// sanitiseName produces a filename-safe stem from a user-supplied filename.
// Keeps ASCII alnum, dash, underscore, and CJK; collapses everything else to "-".
// Truncates by rune count (not byte count) so CJK isn't split mid-character.
func sanitiseName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "import"
	}
	if dot := strings.LastIndex(s, "."); dot > 0 {
		s = s[:dot] // drop extension; guessExt will pick a real one
	}
	var b strings.Builder
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z'), (r >= 'A' && r <= 'Z'), (r >= '0' && r <= '9'), r == '-', r == '_':
			b.WriteRune(r)
		case r >= 0x4e00 && r <= 0x9fff: // CJK Unified Ideographs
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	out := b.String()
	if len(out) > 40 {
		runes := []rune(out)
		if len(runes) > 40 {
			out = string(runes[:40])
		}
	}
	if out == "" {
		return "import"
	}
	return strings.Trim(out, "-")
}

// guessExt sniffs magic bytes first, then falls back to the suggested
// filename's extension if it's one of the supported image types.
func guessExt(name string, data []byte) string {
	if len(data) >= 8 && data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G' {
		return ".png"
	}
	if len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
		return ".jpg"
	}
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return ".webp"
	}
	if dot := strings.LastIndex(name, "."); dot > 0 {
		ext := strings.ToLower(name[dot:])
		if _, ok := client.SupportedImageMime[ext]; ok {
			return ext
		}
	}
	return ".png"
}
