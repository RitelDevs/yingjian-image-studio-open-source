# 本地参考图库预览

本地基线：组织仓库 c5210cd（1.5.8），保留账号 Key 连接恢复修复。独立分支 codex/local-reference-library；未发布服务器。

素材仓库均已完整拉取到工作区 third-party，代码不执行其脚本：

- https://github.com/aaa8221953/pose-gallery @ fc3264e1dfab58797234aa0a2e4a49669031b4d8
- https://github.com/aaa8221953/costume-gallery @ 2b9852d4e951bce1c433e4442d1f6a944d2fd3ab

原作者：ギア（@giaaibusi）；中文姿势名称：Anhao。保留上游 LICENSE、README-anhao.md、LICENSE-GRANT.md；素材许可不等同于 Visora 根目录 MIT。镜像维护者在 LICENSE-GRANT.md 记录了 2026-10-28 收到的素材使用与再分发许可；原中文代码 LICENSE 对图片的旧限制也原样保留，未经进一步核对不将这份预览作为商业素材再发布。

运行：`npm run build:published`，然后 `node scripts/preview-references.mjs`。默认 http://127.0.0.1:8791/#references，仅监听回环地址。使用独立 data/reference-preview 和专用 demo cookie，不使用生产配置、用户或密钥。图库文件通过索引白名单本地读取，不允许任意路径或代理 URL。

操作：侧栏“参考图库”或输入框图库图标 → 搜索/分类/切换视角 → 选作参考 → 带回创作。最多4张，与当前草稿已有参考图合计计算；导入不调用模型、不扣费、不自动发送文字或生图。导入文件保留上游 WebP 原字节和可识别文件名。默认显示全身标准姿势。

“姿势 / 服装”和搜索栏在图库滚动时吸附顶部。待选参考保存在当前用户工作区、按创作分别维护；切换姿势/服装、筛选或暂时离开图库后返回仍保留，成功带回输入框后移除已导入项。该待选列表不写入长期浏览器存储，刷新页面后重新选择。桌面与390px滚动吸附、跨类型/页面选择保留、原图上传和4张上限已通过浏览器核验。

生产功能保持默认关闭；只有 createApplication 显式传入 referenceLibrary 时，配置和账户接口才公布功能标志。素材不复制到 public、发布包或生产业务数据目录。
