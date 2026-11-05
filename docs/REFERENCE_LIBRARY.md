# 参考图库部署（1.6.0）

素材来自 POSE-DB-01 / COSTUME-DB-01，作者 ギア（@giaaibusi），中文姿势名称 Anhao。图库素材许可独立于本项目 MIT，原许可与授权说明保留在 docs/reference-sources，部署包也保留原文。镜像维护者在 LICENSE-GRANT.md 记录了2026-10-28收到的再分发及商业使用许可；旧中文代码 LICENSE 的原说明也保留。

固定来源：

- https://github.com/aaa8221953/pose-gallery @ fc3264e1dfab58797234aa0a2e4a49669031b4d8
- https://github.com/aaa8221953/costume-gallery @ 2b9852d4e951bce1c433e4442d1f6a944d2fd3ab

在同一来源文件夹中克隆两个仓库并 checkout 上述提交，运行：

```sh
node scripts/prepare-references.mjs --source-root=/path/to/source-folder
npm run build:published
npm run release:package
```

准备脚本只复制允许索引内的图片；排除双人缠绵55组、275张视角图，保留其他233组、1164张姿势和1407套服装。references为生成资源，不进入Git；部署包包含reference-library和逐文件SHA256。源码仓库不包含用户图片或数据。

生产将部署包reference-library只读挂载到/app/reference-library，设置REFERENCE_LIBRARY_ROOT=/app/reference-library。环境变量缺省时功能关闭；配置后启动会检查全部索引文件，缺失即启动失败。无需运行上游脚本或在浏览时连接上游网站。只允许GET/HEAD和索引白名单路径。

本地演示：先准备素材，设置REFERENCE_LIBRARY_ROOT为references绝对路径，再运行node scripts/preview-references.mjs，默认仅监听127.0.0.1:8791，独立演示数据与cookie。

待选参考按当前账号与会话保存于工作区；切换筛选、板块和页面仍保留，刷新后重新选择。带回输入框不调用模型，合计最多4张。
