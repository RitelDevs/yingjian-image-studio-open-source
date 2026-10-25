# 图片编辑核心（A 模块）

入口：`useImageEditor({ userId })`，来自 `src/editor-core/useImageEditor.js`，具名及默认导出均可。不需要新增依赖。调用时 `userId` 必须为当前已登录用户的账号编号。

## B / C 共用协议

`shared/editor-contract.mjs` 是唯一协议来源。导出：

- `ADJUSTMENT_DEFINITIONS`：`{key,label,min,max,step,defaultValue}[]`。
- `DEFAULT_ADJUSTMENTS`、`DEFAULT_TRANSFORM`。
- `EDITOR_PRESETS`：`{id,label,adjustments}[]`；ID 为 `original/clean/warm/cool/retro/bw/film/noir/dramatic/dreamy`，附带 `description` 效果说明。
- `validateEditorState(state)`、`validateOperations(operations, state?)`：返回经过校验的新对象，错误抛出 `EditorError`。
- `applyOperations(state, operations)`：无副作用地应用一批非历史操作，净变化时版本递增一次。撤销/重做必须通过 Hook 或 history 执行。

```js
state = {
  documentId: 'UUID', revision: 0,
  width: 4096, height: 3072, name: 'image.png', mime: 'image/png',
  adjustments: { brightness: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0, tint: 0, bloom: 0, grain: 0, vignette: 0 },
  transform: { rotation: 0, flipX: false, flipY: false },
  crop: null // 或 { x, y, width, height }，各项归一化到 0..1
}
```

`width/height` 始终是解码并校正 EXIF 方向后的原图尺寸。旋转角度仅为 `0/90/180/270`；顺时针旋转后，沿变换后的坐标轴翻转。裁剪坐标属于旋转翻转后的完整图片。改变旋转或翻转会清除旧裁剪；同一批操作可在 `setTransform` 后再 `setCrop`。预设仅替换调色参数，保留几何编辑。`reset` 恢复全部调色及几何参数，不替换原图。

```js
{ type: 'setAdjustments', values: { brightness: 10, saturation: -15 } }
{ type: 'applyPreset', presetId: 'warm' }
{ type: 'setTransform', values: { rotation: 90, flipX: true } }
{ type: 'setCrop', crop: { x: .1, y: .1, width: .8, height: .8 } }
{ type: 'setCrop', crop: null }
{ type: 'reset' }
{ type: 'undo' }
{ type: 'redo' }
```

操作值是**绝对值**。一批最多 32 项，整体校验后整体提交；未知字段、非有限数值、越界参数均拒绝。空数组表示没有编辑操作。`undo/redo` 必须单独一项。

## Hook 接口

状态：`document, previewUrl, originalUrl, history, canUndo, canRedo, busy, rendering, restoring, saving, error, notice, hasPendingPreview, previewWidth, previewHeight`。

- `document` 是当前显示状态；临时预览期间参数变化，但 `revision` 仍为已提交版本。不要直接修改返回对象。
- `originalUrl` 为完整原图，`previewUrl` 为当前变换/调色/裁剪结果。用 `previewWidth/previewHeight` 布置预览，不能将它们当作最终导出尺寸。
- `history` 的条目含 `id,label,actor,createdAt,isCurrent,undone`。第一项是导入图片；至多保留 100 次可撤销编辑。撤销后提交新操作会丢弃后续重做分支。
- `busy` 表示载入或导出中；`rendering` 表示后台预览中。不要因为 `rendering` 禁用滑块。

```js
await editor.loadImage(blobOrFile, { name: '图片名称.png' });
editor.previewOperations([{ type: 'setAdjustments', values: { brightness: value } }]);
editor.commitOperations(operations, { actor: 'manual', label: '调整明度' });
// commitOperations() 不传 operations 时提交最近一次临时预览。
editor.cancelPreview();
editor.undo(); editor.redo();
const blob = await editor.exportImage({ format: 'png' });
const jpeg = await editor.exportImage({ format: 'jpeg', quality: .92 });
const requestSnapshot = await editor.getAiSnapshot();
// => {documentId,baseRevision,state,previewDataUrl}
await editor.flush(); // 等待当前本地保存队列结束；错误以 notice 表达
editor.clearError(); editor.clearNotice();
```

滑块拖动/键盘重复变化时调用 `previewOperations`；手势结束或键盘确认时调用一次 `commitOperations`。临时预览总是基于已提交状态，若同一次手势改变多个参数，应在 `values` 中一起传入。未确认裁剪同理；取消调用 `cancelPreview`。

AI 提交必须绑定快照中的文档和版本：

```js
editor.commitOperations(response.operations, {
  actor: 'ai', label: 'AI 调整',
  documentId: response.documentId,
  baseRevision: response.baseRevision
});
```

返回提交后的完整状态。文档或版本不匹配，或者用户正在临时预览时，抛出 `error.code === 'stale_revision'`，不会改变画面或历史。AI 缺少版本上下文时为 `invalid_context`。不要自动重试付费请求。撤销/重做也会递增版本。快照生成会捕获发送时的已提交状态，不会混用异步处理期间的新参数；临时预览期间获取快照和导出均拒绝，错误码 `preview_pending`。

## 图片与草稿行为

仅 PNG/JPEG/WebP、单张不超过 8 MiB、解码后不超过 4000 万像素且单边不超过 16384。检查真实文件签名；原始 Blob 始终保留。后台 Worker 生成最长边 1600 的预览；AI 快照最长边 1024，为白底 JPEG；导出保留裁剪后的原始像素，不进行预览尺寸降采样。PNG 保留透明，JPEG 透明处填白。浏览器不支持 Worker/OffscreenCanvas 时使用兼容处理模式，并通过 `notice` 提示。

基础调色在浏览器解码后的 sRGB 通道上进行；高光/阴影使用亮度范围权重。柔光在线性光中提取与扩散后回到 sRGB，再叠加固定颗粒与暗角。不是 RAW 或专业 ICC 色彩管理工具。缩略图与原图使用同一参数算法，缩放和 JPEG 压缩可能造成少量像素差异。

IndexedDB 数据库 `yingjian-image-editor` 的 `drafts` 表，每个账号保留最近一张图片及其编辑历史；草稿仅存在当前浏览器，不跨设备同步。保存失败不会阻止继续编辑/导出，并设置 `notice`。账号切换创建新的控制器，旧预览 URL/Worker 会释放。React StrictMode 的重复 effect 建立与清理受到保护。

本模块不保存 AI 会话，不发送任何中转请求、不扣费、不新增网站入口。

## 验证记录（2026-10-24）

```powershell
node --test tests/editor-core.test.mjs
$env:EDITOR_BROWSER_TESTS = '1'
node --test tests/editor-core.test.mjs
Remove-Item Env:\EDITOR_BROWSER_TESTS
```

- 本轮 15 项通过，包含 14 项独立核心测试，以及 1 项真实 Edge 浏览器综合测试；默认命令跳过浏览器综合项。
- 已验证真实 Worker 工作、4096×2048 导出、1600×800 预览、1024×512 AI 快照、透明 PNG、白底 JPEG、旋转后裁剪、IndexedDB 刷新恢复、账号切换与 React StrictMode。
- 浏览器测试使用临时本地测试页面，端口自动分配，退出时关闭；不启动或修改正式网站，不调用中转。
- 预设视觉核验图输出到 `data/visual-check/editor-core/render-comparison.png`。
- 完整网站交互与真实 AI 验证由 B/C 联调负责；A 的“AI 操作”测试验证指令与版本控制，没有发送付费对话。
- 已额外通过独立生产打包检查：Hook 和 Worker 均能构建；构建产物位于临时目录并已清理，没有覆盖网站 dist。


## 技能知识适配

2026-10-24 新增高光、阴影、柔光、胶片颗粒和四个风格预设。旧版草稿缺少四个新字段时自动补零。界面、AI 的可用参数和摘要都从共享协议读取。完整来源、处理顺序与验证说明见 [SKILL-ADAPTATION.md](./SKILL-ADAPTATION.md)。
