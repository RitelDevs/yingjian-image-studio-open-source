# 本地构建与服务器运行

先阅读 [../docs/RELEASE_1.5.md](../docs/RELEASE_1.5.md) 和 [../docs/API_AND_ACCOUNTS.md](../docs/API_AND_ACCOUNTS.md)。构建只在本地执行，服务器只运行编译产物。

```sh
npm ci
npm run check
npm run build:published
npm run release:package
```

## 通用 Compose 部署

把部署包解压为一个独立版本目录，其中含 `dist`、`dist-server` 和 `deploy`。参考 `production.env.example` 在 `deploy/.env` 写入私有配置。为该目录准备独立、可持久化的 `data`（容器 UID/GID 为 1000:1000）。

```sh
cd deploy
docker compose --env-file .env -f compose.example.yaml config --quiet
docker compose --env-file .env -f compose.example.yaml up -d
```

模板使用 Linux host 网络，仅监听 `127.0.0.1`，由 Nginx 提供 HTTPS。`GATEWAY_BASE_URL` 和 `PUBLIC_ORIGIN` 必填；不要直接使用示例域名。生产可按自身流程固定 Node 镜像的摘要并调整资源限制。

不使用容器时，准备 Node.js 24+ 与私有环境变量，然后在部署包根目录运行：

```sh
node --env-file=.env dist-server/index.mjs
```

服务端已打包，不需要在服务器执行 `npm ci` 或编译。

## 反向代理与 SSO

`nginx.example.conf` 使用示例域名和本机端口，按实际域名配置 TLS。`sso-bridge.inc` 安装在可信 Sub2API 域名的虚拟主机中；只在需要复用登录态时启用 `SSO_ENABLED=1` 并设置 `SSO_SOURCES`。

`images-http.conf`、`images-https.conf`、原 `compose.yaml` 和专用转移/部署脚本属于原实例的操作材料，不属于公开发布包；不要用它们覆盖其他部署。

健康检查、账号验收、切换与回滚步骤均在发布文档中。运行目录及私有配置必须在 Web 静态目录之外。
