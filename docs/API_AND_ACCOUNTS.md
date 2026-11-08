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


## 对话模型选择

`CHAT_MODEL` 设置默认值；`CHAT_MODELS` 可用逗号配置站点对话模型白名单。默认提供 `gpt-6-luna` 和 `gpt-6.1-sol`，默认模型始终保留。它是站点允许提交的模型列表，实际可用性及价格由用户所选中转分组决定，不自动探测或发起收费请求。

`/api/config`、`/api/me` 返回 `chatModels`。`POST /api/chat` 和 `POST /api/style-plans` 可传 `chatModel`，缺省沿用默认值，非白名单值在创建任务和调用模型前拒绝。普通对话任务model与专业优化snapshot.model均固定保存本次选择，修改选择不改变已提交任务和待确认方案；生图仍使用IMAGE_MODEL。直接套用不调用对话模型。

输入区选择按用户和会话保存在当前浏览器sessionStorage。此入口用于创作对话和风格专业优化；编辑台的参数调整助手仍使用服务器默认模型。模型错误直接显示，不自动切换或重试其他模型。


## 生图模型选择

默认 `IMAGE_MODEL=gpt-image-2.5-sunburst`。`IMAGE_MODELS` 为逗号分隔的站点白名单，默认包含所配置默认模型和Flare/Sunburst。`/api/config`、`/api/me` 返回带id/label的imageModels。Flare的ID为gpt-image-2.5-flare（界面“Flare · 快速”），Sunburst为gpt-image-2.5-sunburst（“Sunburst · 牛逼”）。实际权限、供给和价格由所选中转分组决定。

`/api/chat`、`/api/style-plans`、`/api/jobs`接受imageModel。对话本身仍用chatModel，生图模型保存在本轮上下文/待确认方案settings.imageModel中，确认后写入生图job.model；队列与网关以该记录发送JSON或multipart的model。确认请求不能替换已锁定的生图模型。旧版无imageModel的方案沿用原gpt-image-2.5，不静默切换为新模型；若上游不再支持则如实报错，不自动降级或重试。重新生成会带回原模型选择（仍可用时），需要重新确认。

选择按用户/会话保存；新会话默认Sunburst，对话默认GPT-6-luna。编辑台为本地参数调整，不额外调用这两个生图模型。


## 1.5.5 创作模式与尺寸

会话模式POST /api/chat，生成方案后仍通过/confirm显式确认；直出POST /api/jobs，点击生成即提交付费图片请求。直出支持styleId/styleVersion/styleSubject/title/styleSelectionId，服务端按固定配方编译并核对撤销，不调用对话或专业优化。前端直出不继承未明确附加的历史参考图。

size支持A2/A3/A4：以ISO纸张毫米420×594、297×420、210×297按约150DPI作为像素目标，可横竖切换。size=custom时须传pixelSize={width,height}整数512–4096px、比例1:3–3:1。所有目标均按16像素对齐并适配模型范围：单边≤3840，总像素655360–8294400，比例1:3–3:1；不足最小像素时放大，超过边长/总像素时缩小，显示并保存实际目标。A2约为2416×3408；4K横向16:9为3840×2160，4K方图为2880×2880。这些是生成像素目标，不承诺模型返回精确尺寸，不添加文件DPI元数据。确认请求不能改变已保存尺寸。

浏览器到网站API仍用size=1K/2K/4K等档位；网站到上游的/v1/images/generations和/v1/images/edits均转为WIDTHxHEIGHT，不能发送档位名称。aspectRatio=auto优先跟随首张可读PNG/JPEG/WebP参考图的编码宽高，比例限制在1:3–3:1；没有可读参考图时使用方图。不会解码、裁剪或重写上传图像。约束依据：[OpenAI官方图像参数文档](https://developers.openai.com/api/docs/guides/image-prompting)。

长回复折叠只影响展示，完整提示词始终保留，确认按钮在折叠区域外；提交/计费逻辑不依赖展开状态。
## 生图 Key 连接恢复（1.5.8）

图片站保留“用户 × 分组”的个人 Key 连接；首次使用的创建流程不变。已有连接在每次生图、会话、专业优化或编辑对话前，通过当前登录会话读取原 Key，核对归属、内容、状态、有效期及分组。登录/查询服务失败不视为 Key 删除。

- `GET /api/key-connection?groupId=N`：只读检查当前用户的可用分组，返回 `state/groupId/keyId`，不返回凭证、不创建 Key。删除、停用、过期、分组变更、连接不一致与查询不可用分别处理。
- `POST /api/key-connection`：需沿用当前账号/来源/CSRF 校验，提交 `{groupId, expectedKeyId, confirmed:true}`。这是用户明确选择新建连接的动作；有效连接直接复用，并发恢复只创建一次。原 Key 的启用状态、分组及额度不被改写。
- 新 Key 只替换当前用户当前分组的本地连接；这一步不会调用模型，也不会重发历史任务。用户重新启用原 Key 后，检查成功即可继续复用。
- 创建前写入 `key_creation_pending`；网络中断、5xx 或无法确认的创建响应保留待核对状态，重启后仍阻止重复创建。管理员须先用用户 Key 管理 API 核对创建结果，再决定绑定已创建 Key 或清除已证实未创建的 intent；不要凭超时直接重发。

`key_creation_pending` 为新增表，应用回退可保留该表。回退不得回灌旧业务数据库或丢弃新连接；若回到缺乏此保护的旧版本，未知创建必须先独立核对，不能继续提交任务。

## 背景设置（1.6.1）

/api/jobs、/api/chat 和 /api/style-plans 支持 background=auto|transparent|opaque，省略为auto。背景是明确的用户设置，保存在会话/风格方案中，确认时锁定；确认请求试图替换背景返回409。旧方案缺省按auto兼容。

透明请求无论文生图还是参考图编辑，均发送 background=transparent、output_format=png；auto沿用之前请求格式。网站保留上游原字节，核验真实PNG Alpha；上游返回全不透明或无法核验的结果时保留图片、任务标为partial并说明，不自动重试，不把棋盘格当透明，也不对已有文件进行伪抠图。
