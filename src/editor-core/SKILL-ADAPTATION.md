# 图片后期技能 → 本项目的实现

更新日期：2026-10-24。本次将三个公开 Skill 中与当前单图编辑台相关的知识转为原生功能；运行网站不需要 Python、Three.js 或外部 Skill 目录。

## 已落地

| 参考方向 | 项目实现 | 入口 |
|---|---|---|
| Still Image Retouching and Finishing：先校正再风格、亮暗部分开考虑、保护真实颜色、非破坏性编辑 | 新增高光与阴影控制；AI 按用户意图区分整体明暗和亮度范围，保护肤色与商品色，不声称恢复已经丢失的纹理 | `shared/editor-guidance.mjs`，`server/editor/planner.mjs` |
| Three.js Post-Processing：明确特效顺序、亮部柔光、线性光处理与单次输出转换 | 原生 Worker 中实现亮部提取、缩小的柔光工作缓冲区、线性光扩散与混合；最终继续使用现有 Canvas 编码 | `src/editor-core/effects.mjs`，`pixels.mjs` |
| Image Enhancement Suite / Image Filter Lab：组合式风格配方、颗粒、低反差梦幻与黑白电影效果 | 新增胶片、黑白电影、戏剧、柔梦四个预设；颗粒由固定坐标噪声生成，重复导出稳定 | `shared/editor-contract.mjs`，`effects.mjs` |

技能提供工作方法与效果参考；参数配方、前端实现和测试由本项目重新设计。没有复制第三方 Python/GLSL 实现。上游脚本使用的倍率、RGB 偏移与本项目 -100..100 单位不相同，不能直接照搬数值。

## 对用户的变化

参数由六项扩展为十项，界面按光线／色彩／质感分组。原有明度、对比度、饱和度、色温、色调、暗角继续工作。

| 新参数 | 范围 | 行为 |
|---|---|---|
| `highlights` 高光 | -100..100 | 调整亮度较高区域；负值压低亮部，不承诺恢复已丢失的细节 |
| `shadows` 阴影 | -100..100 | 调整亮度较低区域；正值提亮暗部，负值压暗 |
| `bloom` 柔光 | 0..100 | 从亮部生成柔和光晕，不是整图模糊或主体分割 |
| `grain` 胶片颗粒 | 0..100 | 固定细微单色纹理；强度为零关闭，相同状态导出效果一致 |

新增预设 ID：`film`、`noir`、`dramatic`、`dreamy`。原有六种预设的配方不变，新参数均默认为零。每个预设现在包含中文效果说明，AI 和页面读取同一份参数/预设定义，消息摘要不会暴露英文参数键。

## 兼容与处理顺序

- 旧草稿及历史缺少四个新字段时自动补零，不改原来的几何、参数值、文档 ID 或 revision。缺失原来六个必填字段仍然报错。
- 原有操作格式与 `useImageEditor` 接口不变。AI 返回新参数仍通过白名单与范围校验，整轮操作可一次撤销；版本过期处理不变。
- 基础处理：冷暖与绿/洋红偏移、整体明度 → 亮暗部范围 → 对比度与饱和度。新效果开启时，再做亮部柔光 → 固定颗粒 → 暗角。
- 柔光亮部采样与混合在线性光中计算，再回到 sRGB 通道；这是已经渲染的 8 位图片效果，不是场景 HDR 或专业 ICC 工作流。
- 柔光工作缓冲区最长边不超过 384，预览、快照与原尺寸导出共用处理函数。颗粒坐标按完整输出画幅归一化，分辨率变化时尺度保持相近；缩放和编码可能产生像素差异。
- 全部处理保留 alpha；透明像素的隐藏 RGB 不参与柔光能量。PNG 透明与 JPEG 白底导出规则不变。

## 采用范围

保留现有 Canvas / Worker 架构与纯本地像素处理，没有引入 Three.js 的三维场景、深度景深或 SSAO，没有加入图片生成调用。LUT 导入、RAW 解码、曲线、局部蒙版、专业 ICC 色彩管理不在本轮实现中。

源脚本的胶片预设调用 `grain`，实际方法名为 `film_grain`，且载入时转换为 RGB。本项目用独立的固定颗粒算法并保留 alpha，没有沿用这两处行为。

## 来源与版本

本轮检查时，当前可见的全局和项目 Skill 安装目录尚未找到三个对应目录，因此直接读取公开上游原文完成适配，没有重装或更改全局技能。

- `still-image-retouching-finishing`：https://github.com/calesthio/generative-media-skills/blob/main/skills/production/post-production/still-image-retouching-finishing/SKILL.md
  - 本轮读取的文件 blob SHA：`9dcc1e2799a46501106585b5a6bedbc5c142a5ff`。
- `threejs-postprocessing`：https://github.com/cloudai-x/threejs-skills/blob/main/skills/threejs-postprocessing/SKILL.md
  - 本轮读取的文件 blob SHA：`9e45adb56a967090d3a83a13e1e6b8b2a824cd28`。
- `image-enhancement-suite`：https://github.com/dkyazzentwatwa/chatgpt-skills/tree/main/image-enhancement-suite
  - 参考脚本：`scripts/image_filter.py`，文件 blob SHA `ada8be9dabf14aac42aca50381418a80fe3fcb59`。
  - 当前套件说明也核对于 https://skills.sh/dkyazzentwatwa/chatgpt-skills/image-enhancement-suite 。旧目录名为 `image-filter-lab`。

这些 SHA 是单文件内容对象标识，不是仓库提交 ID。技能中的外部标准和产品版本陈述未作为本项目兼容性保证。

## 验证

- `tests/editor-effects.test.mjs`：旧草稿迁移、参数范围、亮暗部分离、柔光实际扩散/透明边界、固定颗粒、整批撤销、AI 能力说明、演示的参数与预设区分。
- `tests/editor-core.test.mjs`：保持原核心测试，浏览器项增加带新特效的 4096×2048 导出及重复编码摘要一致性。
- `tests/editor-chat.test.mjs`：接口权限、请求去重、边界值、串行执行和原生图隔离回归。
- `scripts/check-editor.mjs`：完整编辑台界面、新预设/参数、AI 指令摘要、撤销以及移动端验证。可用 `--dist-dir`、`--output-dir` 指定 `data/visual-check/` 内独立产物，避免覆盖其他预览。
- 本轮 AI 验证使用模拟中转；没有发送真实付费对话。

### 本轮执行结果

- 46 项测试通过：15 项核心测试（含真实浏览器与 4K 新特效导出）、8 项技能适配测试、23 项编辑对话接口测试。
- 完整页面的 13 项检查通过，报告：`data/visual-check/editor-skills/report.json`，页面错误为零，生图调用为零。
- 10 种预设对照图：`data/visual-check/editor-core/render-comparison.png`。
- 新参数界面截图：`data/visual-check/editor-skills/05-skills-effects-desktop.png`。
- 独立构建：`data/visual-check/editor-skills-dist/`，原有 8816/8817 预览未重启或替换。
- 新版真实中转入口：`http://127.0.0.1:8821/#editor`，预览标识 `editor-skills-real`；服务健康检查返回 200，提供本轮新构建资源，聊天模型沿用 `gpt-6-luna`。需要用户自行登录并发送实际对话。
- 后台辅助启动曾被自动审批拦截（未提供具体原因），最终通过工具管理的可停止前台预览会话启动。没有执行被拦截的后台启动命令。

重新启动本预览（确认端口未占用后）：

```powershell
node scripts/check-editor.mjs --serve-real --port=8821 --preview-id=editor-skills-real --dist-dir=data/visual-check/editor-skills-dist
```
