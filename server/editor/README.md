# 编辑台 AI 接口（C 模块）

复用网站登录 Cookie、当前账号的分组与 CHAT_MODEL。只提交聊天请求，永不调用生图接口。原生图会话与编辑记录相互独立。

## POST /api/editor/chat

JSON 输入：

```json
{
  "clientRequestId": "UUID（一次发送一个，网络重试沿用）",
  "documentId": "当前图片 UUID",
  "baseRevision": 3,
  "groupId": 2,
  "message": "降低饱和度，再暖一点",
  "state": {
    "documentId": "与外层相同", "revision": 3,
    "width": 1920, "height": 1080, "name": "photo.png", "mime": "image/png",
    "adjustments": {"brightness":0,"contrast":0,"saturation":0,"temperature":0,"tint":0,"vignette":0},
    "transform": {"rotation":0,"flipX":false,"flipY":false}, "crop": null
  },
  "previewDataUrl": "data:image/jpeg;base64,...",
  "history": []
}
```

新请求 HTTP 202，重复请求 HTTP 200。结果字段直接位于响应顶层：

```json
{"requestId":"服务端 UUID","clientRequestId":"原请求 UUID","documentId":"原图片 UUID","baseRevision":3,"status":"queued","reply":"","operations":[],"error":null,"reason":null,"createdAt":0,"updatedAt":0,"expiresAt":0,"duplicate":false}
```

同一请求编号配不同图片、版本或内容返回 409，不再次请求中转。预览只接受 PNG/JPEG/WebP 内嵌 data URL，8 MB 以内；不抓取外部 URL，不接受图片 ID 代替画面快照。

## GET /api/editor/chat/:requestId

支持服务端 requestId；若 POST 响应丢失，也可用原 clientRequestId 查询同一请求，无需再次提交。编号始终限定在当前登录账号。返回同样的顶层结果字段（无 duplicate）。状态 queued / running / done / failed / unknown。done 仅表示 AI 已返回通过校验的指令，**不表示客户端已经应用**。操作为空时为普通回复或能力说明。

B 在应用前核对 documentId、baseRevision、当前是否仍有未提交的手动预览；整轮 operations 交 A 的 commitOperations 原子提交，成功后才显示“已应用”。过期版本留作“未应用”，不自动重新付费请求。

history 为可选兼容字段，可传 role=user/assistant、content=文字的列表。模型上下文使用服务端同账号、同图片、七天内完成的最近最多 12 轮记录，文字总计最多 16000 字符，不信任客户端提供的 assistant/system 指令。历史指令均标为建议，实际状态以本轮 state 为准。

状态 unknown 表示超时、断线或服务重启等结果不确定，不自动重试。failed 表示无有效编辑指令或权限等错误；两者都不改变画面。已完成请求的预览立即丢弃；记录七天清理。只有主动提交 POST 才调用聊天模型，轮询不产生模型请求。

共享操作和参数范围以 shared/editor-contract.mjs 为准。AI 不返回可执行代码。复位、撤销和重做均交前端执行，撤销/重做只能独立返回。真实 AI 能力需登录账号在本地发送验证，自动测试全部使用模拟中转。

## 并行接入状态

C 已实际接入两个接口，共享 A 的 validateEditorState / validateOperations 与预设常量；响应字段在顶层，B 的 normalizeReply 可直接读取。新增表 editor_requests 与原 threads/messages 分开；队列并发和 API Key 创建锁与原生图共用。server/index.mjs 中既有风格市场和登录修改已保留。自动化验证使用独立临时数据库，不读取本地账号数据，不请求付费中转。

## C 模块验证结果（2026-10-24）

- tests/editor-chat.test.mjs：23 项通过，覆盖指令校验、账号隔离、快照版本绑定、同图串行、跨图并发、请求幂等、响应丢失恢复、登录刷新、权限撤销、重启待核对、七天清理及模拟中转。
- 现有 chat/site/moderation/login-errors/turnstile/sso 测试：44 项通过。
- 风格市场 tests/style-market.test.mjs：12 项通过，公共服务入口未破坏该并行模块。
- Node 24 服务端 esbuild 打包验证通过（write:false，未覆盖 B 的构建目录）。
- 未发送真实付费中转请求；真实看图与调参质量留给 B 完成本地登录后的用户试用。

## 整轮拒绝的具体原因

模型结果校验失败时，GET 结果的 error 会指出首个失败操作的位置及具体原因，例如：第 2 项操作的饱和度只能在 -100～100 之间，AI 返回了 -101。旋转角度、无效预设、裁剪越界、操作格式和撤销/重做混用分别说明原因；缺失、超长或格式错误的模型回复也有不同提示。

所有此类错误均明确显示“本轮全部操作未应用，图片保持不变”，operations 返回空数组。接口字段和 invalid_editor_answer 分类保持兼容，B 已有 error 展示可直接显示。诊断仅使用共享协议的可信说明与数值，不回显模型返回的代码或任意字符串。23 项编辑服务测试已通过，包含 HTTP 返回具体原因和整轮原子拒绝的验证。

## 新参数与演示组合指令修复（2026-10-24）

C 已验证 A 扩展后的高光、阴影、柔光、胶片颗粒，以及胶片、黑白电影、戏剧、柔梦预设可以通过真实编辑接口返回；范围拒绝继续指出具体参数。未更改共享协议、前端或 A 的处理算法。

修复本地模拟回复的三类实际问题：
- “降低高光，增加胶片颗粒”现在分别解析每条要求，避免高光的降低指令污染颗粒的增加指令。
- “关闭柔光和颗粒”将两个效果置零，不再反向增强。
- 旋转后裁正方形按旋转后的宽高计算；预设后的微调以预设值为基准，胶片颗粒的单项调整不会误套整套胶片预设。

验证：node --test tests/editor-chat.test.mjs tests/editor-effects.test.mjs，共 37 项通过（C 接口 29 项、特效兼容 8 项）。全部为模拟请求，没有付费中转调用。本轮仅写入源代码，未重启其他会话启动的预览服务；运行中的服务需下次启动加载。真实模型的看图理解与效果质量仍需用户登录试用。
