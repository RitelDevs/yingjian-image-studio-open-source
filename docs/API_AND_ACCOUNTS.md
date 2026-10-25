# API 与账号接入（1.5）

## 接入边界

前端只访问本站 `/api/*`。服务端 `server/gateway.mjs` 负责连接 Sub2API；`GATEWAY_BASE_URL` 必须是可信上游的根地址。不要把管理密钥、用户 access/refresh token 或统一收费密钥写入浏览器。

用户使用 Sub2API 现有账号；本站没有独立注册和充值流程，也不维护另一套用户池。登录后从上游读取账户状态、余额和可用分组，按用户本人和分组获取/建立 API Key。新增上游用户无需另建本站账号。价格、余额扣除和充值都由上游负责。

### 配置入口

| 配置 | 含义 |
| --- | --- |
| `GATEWAY_BASE_URL` | Sub2API 根地址；账号 API 和 `/v1` 推理都经此适配器 |
| `IMAGE_MODEL` | 图片模型别名，默认 `gpt-image-2.5` |
| `CHAT_MODEL` | 对话/编辑/专业优化模型别名，默认 `gpt-6-luna` |
| `PUBLIC_ORIGINS` | 可选，逗号分隔的本站可信 HTTPS 域名；配置后按 Host 严格匹配 |
| `PUBLIC_ORIGIN` | 本站准确 HTTPS Origin，用于安全 Cookie 和来源校验 |
| `JOB_CONCURRENCY` | 服务端任务并发，范围 1–10；多余任务排队 |
| `DATA_DIR` | SQLite、会话及媒体所在私有目录 |
| `DEMO_MODE` | `1` 仅供本地演示，正式环境必须为 `0` |
| `SSO_ENABLED` / `SSO_SOURCES` | 可选自动登录及可信站点白名单 |

未配置上游时，代码默认指向本机 `http://127.0.0.1:8080`，不会自动使用作者的公开中转。部署必须显式配置你的上游和模型。若要更换管理员联系文案，修改 `src/App.jsx`、`server/index.mjs`、`server/gateway.mjs` 中现有联系文案。

## 上游适配器

当前实现依赖以下 Sub2API 路由。接其他账号系统时，应调整 `createGateway()` 返回的方法，保持本站 HTTP API 不变。

| 方法 | 当前上游路径 | 用途 |
| --- | --- | --- |
| `loginConfig` | GET `/api/v1/settings/public` | 人机验证公开配置 |
| `login` | POST `/api/v1/auth/login` | 邮箱、密码及验证证明 |
| `login2FA` | POST `/api/v1/auth/login/2fa` | 二次验证 |
| `refresh` | POST `/api/v1/auth/refresh` | 服务端刷新登录 |
| `profile` | GET `/api/v1/auth/me` | 当前用户状态与余额 |
| `groups` | GET `/api/v1/groups/available` | 可用计费分组 |
| `createKey/getKey/deleteKey` | `/api/v1/keys`、`/api/v1/keys/:id` | 当前用户的分组 Key |
| `logout` | POST `/api/v1/auth/logout` | 退出上游会话 |
| `converse` | POST `/v1/chat/completions` | 方案对话、编辑建议、风格优化 |
| 图片生成/编辑 | POST `/v1/images/generations`、`/v1/images/edits` | 无参考图/有参考图 |

这是针对当前 Sub2API 接口形状的适配，不意味着任意 OpenAI 兼容站点都提供上述账户接口。余额、分组及 Key 响应的字段映射位于 `gateway.mjs` 与 `index.mjs` 的 `groupList()`。

## 本站 HTTP 接口

除健康/公开配置和登录流程外，接口需要本站 HttpOnly 会话 Cookie。写请求需来自 `PUBLIC_ORIGIN` 对应站点；会话、媒体、任务始终再次按当前账号鉴权。

| 接口 | 用途 |
| --- | --- |
| GET `/api/health` | 健康、版本、任务队列状态 |
| GET `/api/config` | 模型、演示状态、功能开关与 SSO 来源 |
| GET `/api/login-config` | 验证开关和公开 site key（不返回 secret） |
| POST `/api/login` | `{email,password,turnstileToken?}`；可能要求 2FA |
| POST `/api/login/2fa` | `{tempToken,code}` |
| GET `/api/me` / POST `/api/logout` | 当前用户/退出 |
| GET、POST `/api/threads` | 自己的会话列表/新建 |
| GET `/api/threads/:id` | 自己的会话与消息 |
| PATCH `/api/threads/:id` | `{title}`，1–60 个字符，无控制字符 |
| DELETE `/api/threads/:id` | 删除自己的会话 |
| GET `/api/media/:id` | 当前用户可访问的图片 |
| POST `/api/chat` | 带上下文的方案讨论，返回任务；不直接生图 |
| POST `/api/jobs` | 直接图片任务，后台接口保留 |
| GET `/api/jobs/:id` | 查询任务状态与图片 |
| POST `/api/style-plans` | 创建风格方案（模板/专业优化） |
| POST `/api/editor/chat` | 编辑建议任务；详见下方协议 |
| GET `/api/editor/chat/:requestId` | 编辑建议结果及应用条件 |

确认方案使用 POST `/api/plans/:id/confirm`；撤销风格使用 POST `/api/style-selections/:id/revoke`。完整校验逻辑以 `server/index.mjs` 为准。前端在方案确认时使用现有确认路由，不用文字“确认”绕过后台状态检查。

对话/图片任务携带 `clientRequestId`（UUID）；一次用户操作只生成一个，请求重试沿用同一个编号。网络超时或结果未知时不能换编号自动重发。常用字段：`threadId`、`prompt`、`groupId`、`size`、`count`、`aspectRatio`、`useContext` 与参考图片。请求与响应的完整示例可参阅 `tests/site.test.mjs`、`tests/chat.test.mjs` 和 `tests/style-market.test.mjs`。

编辑建议协议见 [../server/editor/README.md](../server/editor/README.md) 与 `shared/editor-contract.mjs`。建议按账号、文档 ID、基础 revision 绑定，整轮校验后才应用；失效或非法操作不会部分覆盖图片。

## 编辑台回传参考图

1. 导入会话图片时保存来源 `threadId`；本地来源信息按账号和文档 ID 保存。
2. 点击工具栏回传按钮，将当前确认后的编辑结果编码为 WebP。
3. 会话来源先 GET `/api/threads/:id` 验证仍可访问，再追加到该会话的参考图草稿。
4. 本地上传来源先 POST `/api/threads` 新建，再放入参考图草稿。
5. 不自动调用 `/api/chat` 或生图接口。用户继续输入/确认后才会产生上游模型请求。

本地来源记录不是权限凭证。会话不存在、无权限、超出 4 张/单张 8MB/总量 24MB 时明确失败，并保留编辑结果。未发送的参考图草稿仍属于当前浏览器，跨设备同步发生在提交并由服务器保存之后。

## SSO 与验证

密码登录始终保留。要自动复用某个 Sub2API 站点的现有登录状态：

```dotenv
SSO_ENABLED=1
PUBLIC_ORIGIN=https://images.example.com
SSO_SOURCES=[{"id":"main","name":"我的中转","origin":"https://gateway.example.com"}]
```

来源仅接受唯一的规范 HTTPS Origin（无路径、用户信息或尾斜杠），最多 10 个。兼容旧部署时未指定白名单仍保留原内置来源；新部署请显式设置。

在对应中转域名的 Nginx 中配置 `deploy/sso-bridge.inc`，让 `/studio-sso/*` 转发到本站桥接接口。桥接后端校验来源、浏览器绑定的一次性挑战以及上游真实身份；浏览器不共享 refresh token。中转不在同一台机器时，应使用受控的服务端网络地址，并限制桥接头只由可信代理设置。

Turnstile 配置仍取自 Sub2API；本站转交单次验证证明，并区分密码错误、账号状态错误和验证失败。真实域名需按上游/验证服务的允许域名配置，不能用演示模式代替生产验证。

## 多域名迁移

同时维护新旧生图域名时，设置 `PUBLIC_ORIGINS=https://images.example.com,https://legacy.example.com`，并在每个 `SSO_SOURCES` 条目加入 `studioOrigin` 指明该中转登录后返回哪个生图域名。`PUBLIC_ORIGIN` 必须包含在允许列表中。未填写 `studioOrigin` 的条目归属主域名。

配置按请求 Host 选择来源列表；挑战和一次性票据绑定生图 Origin，不能拿旧域名的票据登录新域名。桥接页面也只允许所属生图 Origin 作为父页面。
