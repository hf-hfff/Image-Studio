# AGENTS.md

Wails 桌面（Go 内核）/ Android WebView（远程内核）/ 浏览器预览；Responses + Images 双形态；无内置上游。

内核：桌面唯一实现 `go-cli/pkg/client`；字段规范 `shared/kernel/requestModel.js`；前端门面 `platform/runtime/host.ts`；远程内核 `platform/runtime/remote-kernel`；主 store `state/studioStore.ts`；契约 `backend/types.go` ↔ `hostTypes.ts` ↔ `wailsjs`。

## 规则

- 改字段/重试，go-cli 与 remote-kernel 必须同步；先改 requestModel.js 再对齐两侧。
- 图片走磁盘路径 + `/media/*`，不跨 bridge 传 base64。
- Responses 的 VERBATIM instructions 措辞不改。
- 产物名带 jobId 前 6 位（时间戳只到秒，并发会覆盖）。
- 事件 `log|progress|preview|result|error:<jobId>`，先绑后发（requestedJobId）。
- 历史只增不裁（禁 `trimHistory`/`MAX_HISTORY_ITEMS`），键 `(createdAt,id)`。
- 失败走 `failureAlert`；取消不算失败；队列按 jobId 结算。
- `lib/` 不放平台判断；`components/` 不做平台检测、不直调宿主。
- store 数组对象换新引用；常驻 UI 单字段 selector。
- 无默认 BaseURL；`AllowInsecureConnection` 默认关。
- 不手改 `wailsjs`；版本号走 `sync-version-metadata.mjs`。
- 拖拽只走 `useNativeFileDrag`。
- Android 无 Go backend，桌面独有能力显式报「未实现」。
- Key 只进密钥链，不进 localStorage / IndexedDB / 导出。

## 改哪里

- 新参数：requestModel → client(payload/types) → remote-kernel/requestPayloads → backend/types + hostTypes → domain + studioStore → UI。
- 新上游：client/url + transport + Provider 枚举（Go/JS 两处同步）。
- 新宿主能力：backend → host.ts 分派 → 非桌面显式降级 → AndroidImageStudioBridge.invoke。

## 验证

`npm test` + `npm run build`（frontend）；`go test ./...`（image-studio / go-cli / gio-client / shared/compat-go）；`node scripts/local-smoke-check.mjs`。单测 ≠ mock ≠ 真机。
