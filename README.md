# 映间 · 在线生图工作台 1.5

映间是可自行部署的图片创作网站：在同一处完成想法讨论、确认生图、风格选择、会话管理和图片编辑。前端为 React，服务端为 Node.js 24 和 SQLite。

## 1.5 的工作流

- 通过现有 Sub2API 账号登录，使用用户本人、所选分组的 API Key；余额与价格以中转为准。
- 先对话整理方案，再确认生图。支持参考图、会话上下文、1K/2K/4K、自定义比例和排队。
- 风格市场提供 24 种配方，支持带参考图/不带参考图、题材与搜索；可选模板或专业优化。
- 会话中的图片可放入编辑台，也可从编辑台选取自己会话里的图片。
- 编辑台支持参数直接输入、预设、裁剪、撤销重做、AI 调整；原图与编辑结果左右对比，各自缩放和平移。
- 玻璃工具栏提供移动、框选裁剪、编辑会话、适应画面和参考图回传。来源会话可用时回到原会话，本地上传图片新建会话。回传不会自动发起生成或模型调用。
- 会话与媒体由服务端按账号隔离并按七天保留策略清理；未提交的输入草稿和图片编辑草稿保存在当前浏览器。

完整更新见 [CHANGELOG.md](CHANGELOG.md)。

## 本地演示

需要 Node.js 24+（使用内置 `node:sqlite`）。

```sh
npm ci
npm run build
npm run demo
```

打开 `http://127.0.0.1:8788`，使用本地演示入口。演示数据、模型回复和图片均为模拟，不连接中转扣费。

开发前端：一个终端运行 `npm run demo`，另一个运行 `npm run dev`。Vite 默认把 `/api` 转发到 `8788`。

## 接入自己的中转

复制 `.env.example` 为私有 `.env`，至少填写：

```dotenv
GATEWAY_BASE_URL=https://gateway.example.com
PUBLIC_ORIGIN=https://images.example.com
IMAGE_MODEL=gpt-image-2.5
CHAT_MODEL=gpt-6-luna
JOB_CONCURRENCY=10
DEMO_MODE=0
```

`GATEWAY_BASE_URL` 为 Sub2API 的站点/API 根地址，不带 `/v1`。模型名是中转侧别名，需按实际线路配置。启动 `npm run server` 即读取 `.env`。

**接入位置集中在 `server/gateway.mjs`。** 这里既包含 OpenAI 兼容的图片/对话接口，也包含 Sub2API 的账号、分组和密钥管理适配。仅替换兼容 `/v1` 的推理 URL，不能替代账号接口。接入其他账户系统时须实现对应适配器。

账号连接、SSO、人机验证与接口清单见 [docs/API_AND_ACCOUNTS.md](docs/API_AND_ACCOUNTS.md)。密钥、Cookie、refresh token 不应放入前端或公开仓库。

## 构建与部署

```sh
npm ci
npm run check
npm run build:published
npm run release:package
```

构建全部在本地完成。`release/v1.5.2/` 生成允许公开的源码目录、部署目录、两个压缩包与 SHA-256 清单。服务器只接收编译产物，运行 Node.js 或通用 Compose 模板。

- 部署入口：[deploy/README.md](deploy/README.md)
- 1.5 验收与上线步骤：[docs/RELEASE_1.5.md](docs/RELEASE_1.5.md)
- 从当前工作目录打包时，专用服务器运维脚本、`.env`、数据库、日志、测试产物、历史 Git 目录均不进入公开包。
- `build:published` 保留原已发布首页；`build` 可用于查看源代码里的首页实验。两者工作台功能相同。

## 验证

`npm run check` 运行服务端、编辑核心、协议和权限测试。

可选浏览器验证：

```sh
npx playwright install chromium
npm run check:editor-ui
```

Windows 默认使用已安装的 Edge；可通过 `PLAYWRIGHT_CHANNEL` 指定已安装的浏览器通道。Linux/macOS 默认使用 Playwright Chromium。浏览器检查使用模拟账号和模拟接口，不调用收费模型。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `src/` | 登录、创作会话、风格市场和界面 |
| `src/editor-ui/` | 编辑台、分屏视口、工具栏、会话图片选择 |
| `src/editor-core/` | 图片渲染、Worker、本地草稿、历史栈 |
| `server/gateway.mjs` | 上游账户与模型适配器 |
| `server/index.mjs` | HTTP API、会话认证、任务提交 |
| `server/editor/` | AI 编辑任务、版本校验与结果应用协议 |
| `server/store.mjs` | 账号隔离的 SQLite 数据与媒体 |
| `shared/` | 前后端共同协议、风格目录、尺寸与版本 |
| `docs/style-sources/` | 配方来源与许可证快照（不会作为程序执行） |
| `deploy/` | 通用部署和 SSO 桥接模板 |

## 许可证

项目自身代码采用 [MIT](LICENSE)。第三方字体、引用规则及依赖保留原许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
