# Visora 双域中央账号接入

本实现用一个图片业务进程兼容 `visora.ritel.si` 和旧 `images.ritel.si`；两个来源分别使用独立中央账号consumer，业务SQLite、队列、编辑器和用户归属保持共享。

## 配置

本功能可选，默认传统网关模式保留。中央账号模式使用部署者另行安装、审阅的consumer运行包；本仓库不包含其私有配置、密钥或状态数据库。接口契约见[服务端接入说明](../server/sub2api-account.README.md)。

```dotenv
PUBLIC_ORIGIN=https://visora.ritel.si
PUBLIC_ORIGINS=https://visora.ritel.si,https://images.ritel.si
SUB2API_ACCOUNT_CONFIG=/app/account-state/visora.config.json
LEGACY_SUB2API_ACCOUNT_CONFIG=/app/account-state/config.json
SSO_ENABLED=0
DEMO_MODE=0
RITEL_ACCOUNT_CONFIG=
```

这是当前已实现的固定双来源组合，不是任意多域注册器。只有主consumer时省略 `LEGACY_SUB2API_ACCOUNT_CONFIG` 并只配置主来源。两份JSON依据[配置模板](../server/sub2api-account.config.example.json)填写：各自origin、clientId、clientSecretFile、stateFile独立；issuer及其OIDC端点准确匹配同一个可信身份中心。端点不可含凭据、query或hash。

旧consumer配置、secret与SQLite原件在迁移期间保留，不通过重建配置或换secret来迁移登录。所有配置/secret/state置于静态目录外，目录与文件采用0700/0600或等效当前用户专有权限。不得提交到版本库。

`PUBLIC_ORIGINS`须等于已选consumer来源集合；公共主来源始终是Visora。Cookie、CSRF、OIDC交易及会话状态绑定来源；后台worker根据已保存的会话绑定选择consumer，不把旧用户默认归给新来源。

## 可信代理与旧域兼容

- 代理原样设置各域的Host、X-Forwarded-Host及X-Forwarded-Proto=https；仅信任准确列入配置的直接代理peer。
- 代理覆盖X-Ritel-Client-IP为单个已验证客户端IP；任意客户端XFF不参与信任决策。存在的Origin必须与所选来源准确一致，不能由代理改写绕过检查。
- 旧域网页GET/HEAD可301到新域同路径和query。旧`/api`、`/api/*`、`/auth`、`/auth/*`的所有方法及其他写方法继续由同一个业务应用处理；不能让网页跳转吞掉回调或POST。
- 身份中心须分别注册两个consumer的普通/静默回调，并按实际来源配置frame-ancestors及目的产品提示。
- 用 `--check-config` 检查配置时不打开图片业务DB或启动worker。共享consumer运行包需单独版本管理，不应用旧发布包覆盖较新的登录模块。

## 构建与验收

在开发机运行 `npm run build:published`，保留已发布首页。服务器仅接收经审构建产物。验证新旧来源登录、无Origin安全读取、同源写入、错误Origin/CSRF拒绝及未知结果核对；使用模拟用户的测试不代替部署者的真实账号验收。

网页导航使用根路径hash（如`/#editor`、`/#styles`），应保留这些路径。未知网页GET/HEAD返回自包含品牌404与实际404状态；API/auth等协议错误保持JSON，写方法不进入HTML错误页。
