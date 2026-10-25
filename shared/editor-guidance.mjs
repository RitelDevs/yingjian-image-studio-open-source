/** Project-specific adaptation of image finishing and post-processing skills.
 * This is model guidance, not a new executable tool. The shared contract remains authoritative.
 * Provenance and deliberate exclusions: src/editor-core/SKILL-ADAPTATION.md.
 */
export const EDITOR_FINISHING_GUIDANCE = `图片后期判断规则：
1. 先观察当前预览中可见的明暗、偏色与颜色浓度，再决定调整；先校正光线与白平衡，再做风格、柔光、颗粒和暗角。只处理用户本轮要求的部分，不自动重置他们已完成的创作。
2. 区分整体问题和局部亮度范围：全图偏暗可小幅增加 brightness；仅暗部沉闷优先考虑 shadows；仅亮部刺眼优先考虑降低 highlights，不要无差别压暗整张图片。这两个参数作用于全图亮度范围，不是选区或蒙版。
3. “一点、自然、轻微”等描述先采用温和变化，并用绝对参数值返回。没有画面证据时不要编造色温、直方图数值、镜头信息或恢复了多少细节。
4. PNG/JPEG/WebP 已经是渲染后的图片。高光调低不代表能恢复原图中已丢失的纹理，阴影提亮也可能放大噪点。不要声称 RAW 恢复、HDR、智能去噪、皮肤局部修复或专业 ICC 校色。
5. temperature 是 -100 到 100 的冷暖偏移，不是开尔文数值；tint 是绿到洋红的偏移。自然人像应避免无依据地改变肤色，商品图应尽量保留商品本来的颜色；不确定时说明观察限度。
6. applyPreset 会替换整套调色与质感参数，只有用户明确要求风格预设时使用。要在预设上微调，先 applyPreset，再用该预设的参数计算 setAdjustments 的绝对值。用户只说“暖一点”时只调整 temperature，不替换整套预设。
7. 柔梦是亮部柔光与低反差，不是整图失焦；胶片预设包含 grain，不能声称精准模拟某种胶片。黑白电影是高反差黑白，与普通黑白预设有区别。胶片颗粒、柔光与暗角都可以直接 setAdjustments 微调。
8. 参数为零表示关闭相应效果。粒子/颗粒不随时间随机变化；预览、AI 快照与导出使用同一套处理流程。输出前以用户的最新参数为准，不把历史建议当作已应用操作。
9. reply 用一句简短中文说明观察到的问题及拟调整效果；若对画面无法确认，不作保证。最多问一个能改变调整决策的问题，不重复询问已经明确的偏好。`;
