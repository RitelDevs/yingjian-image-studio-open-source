import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { EXTRA_STYLE_RECIPES } from './style-recipes-extra.mjs';

/*!
 * Style rule translations and selections adapted from:
 * baoyu-skills — Copyright (c) 2026 Jim Liu
 * krea-ai/skills — Copyright (c) 2026 Krea AI
 * Both upstream repositories use the MIT License.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const stylesById = new Map(STYLE_CATALOG.map(style => [style.id, style]));
const MAX_SUBJECT_LENGTH = 1200;
const MAX_TITLE_LENGTH = 80;
const MAX_PROMPT_LENGTH = 4000;

// Visual rules below are sourced translations/selections. App-specific constraints
// are assembled separately in compileStyleRecipe. No external skill is executed.
const extractedRecipes = [
  {
    "id": "clay-avatar",
    "rules": [
      "所有主体采用黏土或橡皮泥质感，保留指纹、手工不完美和圆润的雕塑形体。",
      "使用柔和阴影、定格动画式布景与微缩场景的表现方式。",
      "黏土颜色明亮饱满但略有收敛，采用中性摄影棚背景和柔和渐变，以互补色与局部高光点缀。"
    ],
    "source": {
      "skill": "baoyu-infographic",
      "upstreamFile": "references/styles/claymation.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-infographic/references/styles/claymation.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Color Palette",
        "Visual Elements"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "保留现有头像入口；主体、姿势与人数来自用户，而非额外设计角色。",
        "未采用原文的立体黏土字，未填写标题时不加文字。"
      ],
      "sourceSha256": "c55e726c0d1156f2715107dd3b3d3c60af385b48db33b6121cb569494aa59644",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-claymation.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  },
  {
    "id": "product-studio",
    "rules": [
      "未指定布光时采用单一小型硬闪，偏离镜头轴线约 20～40°，约 5500K、6:1 明暗比；产品后侧形成边缘清楚的投影，光面保留真实高光。",
      "未指定场景时采用工装蓝的单色无缝纸背景；保持真实产品的比例、表面与接触关系，所有阴影方向一致。",
      "采用 50～85mm 等效视角，产品与标签保持清楚，使用无颗粒的数字摄影质感；不使用广角畸变、渐变背景或互相冲突的第二道阴影。"
    ],
    "source": {
      "skill": "krea-marketing",
      "upstreamFile": "references/product-photography.md",
      "url": "https://github.com/krea-ai/skills/blob/main/krea-marketing/references/product-photography.md",
      "author": "Krea AI",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Core direction",
        "Color / Saturated seamless field",
        "Light and drama / C — Hard flash on a colored seamless",
        "Camera, frame, and finish",
        "Product, label, and type rendering"
      ],
      "method": "从原文指定章节抽取、翻译，选定其中一个明确预设",
      "adaptations": [
        "从原文多个选项中固定选用硬闪、单色背景、清晰数字质感；用户明确设置优先。",
        "不采用原文要求虚构品牌和包装小字的段落；只保留用户提供的标识。",
        "画幅使用网站设置，未采用原文默认竖幅。"
      ],
      "verification": "已从 GitHub 公开文件页提取并逐节核对原始规则，保存内容哈希与完整许可证",
      "snapshot": "Skill原始规则-2026-10-24/krea-product-photography.md",
      "sourceSha256": "1c77fafc4a80bde34bc7873fa78e7d1f482916956eaa670e0edf0cf0919e8a95",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-krea.txt"
    }
  },
  {
    "id": "retro-poster",
    "rules": [
      "采用 1970 年代复古波普与严格的瑞士网格，以统一粗黑线分隔矩形和方形区域；主体、文字与图形都锚定在网格内。",
      "背景为暖奶油米色，色块使用复古鲑鱼粉、天蓝、芥末黄和薄荷绿；黑白区域形成强对比，部分格子留空。",
      "以二维平涂、粗黑轮廓和轻微丝网印刷纹理表现图像；标题使用清楚的粗展示字体。禁止渐变、明暗塑形、投影、三维效果或松散漂浮的布局。"
    ],
    "source": {
      "skill": "baoyu-infographic",
      "upstreamFile": "references/styles/retro-pop-grid.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-infographic/references/styles/retro-pop-grid.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Color Palette",
        "Visual Elements",
        "Typography",
        "Style Enforcement",
        "Avoid"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "不采用原文允许的额外英文装饰字，画面只使用用户标题。",
        "去除信息图专用警示符号和表情示例，主体按用户填写。"
      ],
      "sourceSha256": "d59faa1639c15a6624c51746d9725de50a40c448dbbeba8faf6eb00ac3468023",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-retro-pop-grid.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  },
  {
    "id": "picture-book",
    "rules": [
      "采用柔和的手绘水彩，使用低饱和蓝色、绿色与温暖大地色，背景为白色或奶油色水彩纸。",
      "保留可见笔触、柔和渗色与渐变，在淡彩之上加入细线，边缘和形态自然有机。",
      "把留白作为构图的一部分，用局部颜料积聚和少量飞溅表现水彩质感，形成轻柔、梦幻的氛围。"
    ],
    "source": {
      "skill": "baoyu-infographic",
      "upstreamFile": "references/styles/storybook-watercolor.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-infographic/references/styles/storybook-watercolor.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Color Palette",
        "Visual Elements"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "不自动采用手写装饰文字；叙事主体与场景由用户提供。"
      ],
      "sourceSha256": "d7067bc69f56f3fad42e3f2671c86317c36962f38fd69a181f9d606d6fd54f88",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-storybook-watercolor.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  },
  {
    "id": "paper-cut",
    "rules": [
      "使用层叠剪纸变体，以纸张纹理、撕边和层间投影形成深度；形状自然，保留轻微手工不规则。",
      "采用暖粉彩、柔和饱和色和手工纸色，背景为浅奶油色或有纹理的纸张，以彩色卡纸点缀。",
      "构图干净、留白充足，所有图像保持统一的手工插画或剪纸表现；把参考照片转换成插画等效形态，不混入写实摄影元素。"
    ],
    "source": {
      "skill": "baoyu-infographic",
      "upstreamFile": "references/styles/craft-handmade.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-infographic/references/styles/craft-handmade.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Color Palette",
        "Variants / Paper-cutout",
        "Visual Elements",
        "Style Enforcement"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "只选用 Paper-cutout 分支，不混入另一手绘分支。",
        "不自动增加关键词、卡通人物或剪纸字。"
      ],
      "sourceSha256": "91740549239ab391d18532c83317a137c68cb11ab33ea154130db68a791288c0",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-craft-handmade.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  },
  {
    "id": "film-photo",
    "rules": [
      "采用场景中真实存在的实用光源与 35mm 环境纪实视角；用户明确的天气、地点与色彩优先。",
      "选择低饱和暖色胶片调性，暗部深但不全黑，保持颜色而非统一灰化。",
      "细至中等胶片颗粒连续覆盖整个画面，包括阴影和高光，不只给局部叠加做旧；不加边框、胶片齿孔、日期戳或水印。"
    ],
    "source": {
      "skill": "krea-marketing",
      "upstreamFile": "references/product-photography.md",
      "url": "https://github.com/krea-ai/skills/blob/main/krea-marketing/references/product-photography.md",
      "author": "Krea AI",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Core direction",
        "Color / Drained warm film",
        "Light and drama / G — Found practical light",
        "Camera, frame, and finish"
      ],
      "method": "从原文指定章节抽取、翻译，选定其中一个明确预设",
      "adaptations": [
        "仅抽取光线、色彩、镜头和颗粒规则，推广到用户的生活场景；原文主要面向商品摄影。",
        "不强制添加产品、品牌、桌面道具或参考案例中的人物。"
      ],
      "verification": "已从 GitHub 公开文件页提取并逐节核对原始规则，保存内容哈希与完整许可证",
      "snapshot": "Skill原始规则-2026-10-24/krea-product-photography.md",
      "sourceSha256": "1c77fafc4a80bde34bc7873fa78e7d1f482916956eaa670e0edf0cf0919e8a95",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-krea.txt"
    }
  },
  {
    "id": "minimal-poster",
    "rules": [
      "背景保持纯白，无颗粒或图案；以大面积留白和极少元素建立版面，只保留必要的简单几何形。",
      "四周至少保留约 15% 边距，采用居中或左对齐，用尺度建立层级，必要时用细分隔线；不以装饰填满空白。",
      "文字使用轻至中等字重的几何无衬线字形与宽松字距，以近黑、灰色为主，只少量使用一种强调色；不添加页码、页脚或标志。"
    ],
    "source": {
      "skill": "baoyu-slide-deck",
      "upstreamFile": "references/styles/minimal.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-slide-deck/references/styles/minimal.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Background",
        "Typography",
        "Color Palette",
        "Visual Elements",
        "Style Rules"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "将单页演示图规则用于海报；保留用户标题上限，不采用原文每页最多 10 词的限制或截断用户标题。",
        "强调色沿用用户明确选择，否则使用蓝色。"
      ],
      "sourceSha256": "8edc54afaa281678b1f8ab17baba969782ea5c2e6344ddedaaf085f1d74aed49",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-minimal.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  },
  {
    "id": "isometric-scene",
    "rules": [
      "采用等距分支，以 30° 角的体块和清楚的填色表达三维空间，几何关系精确。",
      "使用干净的矢量式形状和一致的线宽；以蓝、青绿、灰为主，白色或浅灰网格背景，少量琥珀或青色点缀。",
      "各体块沿一致的等距方向排列，用几何与色块说明空间关系。"
    ],
    "source": {
      "skill": "baoyu-infographic",
      "upstreamFile": "references/styles/technical-schematic.md",
      "url": "https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-infographic/references/styles/technical-schematic.md",
      "author": "Jim Liu",
      "license": "MIT",
      "reviewedOn": "2026-10-24",
      "sections": [
        "Color Palette",
        "Variants / Isometric",
        "Visual Elements"
      ],
      "method": "中文翻译并选取与本风格相关的规则",
      "adaptations": [
        "只采用 Isometric 分支，不混入白线蓝底的 Blueprint 分支。",
        "不自动添加尺寸线、测量数据或技术标签；未提供的数据不能凭空编造。"
      ],
      "sourceSha256": "2b21ce445c6a2b1ef280c2d7b4cb8e87e2f6e720f85cb68a8ba40a5c2d73a12d",
      "verification": "已读取本机安装的原始规则文件，记录其内容哈希及上游对应位置",
      "snapshot": "Skill原始规则-2026-10-24/baoyu-technical-schematic.md",
      "licenseSnapshot": "Skill原始规则-2026-10-24/LICENSE-baoyu.txt"
    }
  }
];
const allRecipes = [...extractedRecipes, ...EXTRA_STYLE_RECIPES];
const recipes = new Map(allRecipes.map(entry => [entry.id, entry]));

// Audit metadata stays server-side and is not added to the public catalog or image request.
export const STYLE_RECIPE_SOURCES = Object.freeze(Object.fromEntries(allRecipes.map(entry => [entry.id, Object.freeze({
  ...entry.source, sections: Object.freeze(entry.source.sections), adaptations: Object.freeze(entry.source.adaptations)
})])));

export class StyleRecipeError extends Error {
  constructor(message, status = 400, reason = 'invalid_style_fields') {
    super(message);
    this.name = 'StyleRecipeError';
    this.status = status;
    this.reason = reason;
  }
}

function textField(value, label, maximum, required) {
  if (typeof value !== 'string') throw new StyleRecipeError(`${label}须为文字。`);
  const text = value.trim();
  // Use UTF-16 length, matching the existing form maxLength and 4000-character API limit.
  if ((required && !text) || text.length > maximum) {
    throw new StyleRecipeError(required ? `${label}长度应在 1 到 ${maximum} 字符之间。` : `${label}不能超过 ${maximum} 字符。`);
  }
  return text;
}

export function compileStyleRecipe(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new StyleRecipeError('请填写有效的风格方案。');
  }
  const { styleId, styleVersion, subject, title = '', hasReferences = false } = input;
  const style = stylesById.get(styleId);
  if (!style) throw new StyleRecipeError('找不到这个风格，请重新选择。', 404, 'style_not_found');
  if (typeof styleVersion !== 'string' || styleVersion !== style.version) {
    throw new StyleRecipeError('风格版本已变化，请重新打开风格详情。', 409, 'style_version_mismatch');
  }
  const referenceOnly = style.inputMode === 'reference';
  if (typeof hasReferences !== 'boolean') throw new StyleRecipeError('参考图设置无效。');
  if (referenceOnly && !hasReferences) throw new StyleRecipeError('这个包需要先上传参考图，无需填写提示词。', 400, 'style_reference_required');
  const cleanSubject = textField(referenceOnly && subject === undefined ? '' : subject, '主体描述', MAX_SUBJECT_LENGTH, !referenceOnly);
  const cleanTitle = textField(title, '标题', MAX_TITLE_LENGTH, false);
  if (cleanTitle && !style.supportsTitle) throw new StyleRecipeError('这个风格不支持标题，请清空标题或选择海报风格。');
  if (typeof hasReferences !== 'boolean') throw new StyleRecipeError('参考图设置无效。');

  const recipe = recipes.get(style.id);
  if (!recipe) throw new StyleRecipeError('这个风格暂时不可用，请选择其他风格。', 503, 'style_recipe_unavailable');
  // Site adapter rules preserve the user's content; they are not upstream style claims.
  const referenceRules = hasReferences
    ? '本次提供了参考图。按用户明确说明区分各图的用途；未说明时，以第一张作为主体基准，其余图片不自动合并成新人物、产品或场景。保留人物、宠物的可辨识特征，不擅自改变身份；对于产品优先保留结构、部件和颜色。参考图负责主体与指定细节，风格规则负责表现方式；看不清的文字或不可见的结构不要猜写。'
    : '本次没有附加参考图。仅依据本轮主体描述与本配方创作，不虚构已看过参考图，不继承未提供的旧图片或其他会话内容。';
  const ordinaryTypography = cleanTitle
    ? `新增可读文字仅使用下面的标题原文，逐字保留字形、数字、标点与大小写；不翻译、不改写、不补字，不把本节说明排进画面。可根据画幅换行，不能省略内容。\n标题原文：\n${cleanTitle}\n标题原文结束。\n使用清楚、完整的笔画与适当字号，确保对比度和安全边距，不遮挡主体；主体描述用于画面内容，不转为额外文案。`
    : '本轮未提供标题，不新增标题、标语、说明小字、占位字符或乱码；原本的标题区域保留干净留白。用户明确要求保留的参考图既有标识，仅按可见原文保留，不猜写模糊字符。';

  const typography = recipe.textMode === 'provided-content'
    ? '本包允许绘制用户在主体描述中明确给出的正文、节点标签、视图标签或对白。逐字保留原文、数字、单位和关系；不要把布光、构图等操作说明画成文字，不补造数据或额外文案。' + (cleanTitle ? '\n画面标题逐字使用：' + cleanTitle : '\n未提供总标题，不新增总标题，但保留已提供的正文与标签。')
    : ordinaryTypography;
  const effectiveSubject = cleanSubject || recipe.defaultTask;

  const prompt = [
    `【创作目标】\n创作一幅「${style.name}」风格的画面。画幅与尺寸使用本次生成设置；直接输出作品，不展示应用界面或外部样机。`,
    `【用户主体与要求】\n${effectiveSubject}`,
    '【内容与风格的分工】\n保留用户指定的主体、数量、动作、场景与颜色。风格中的默认选择用于用户未明确的部分，不覆盖已有要求；不得擅自增加人物、道具、品牌或宣传语。',
    `【风格规则】\n${recipe.rules.join('\n')}`,
    `【参考图处理】\n${referenceRules}`,
    `【文字规则】\n${typography}`,
    '【生成约束】\n保持主体结构与参考图分工，不额外添加签名、水印或未要求的文字。'
  ].join('\n\n');
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new StyleRecipeError('完整方案超过 4000 字符，请缩短主体描述后重试。');
  }
  return {
    style: { id: style.id, version: style.version, name: style.name },
    prompt,
    summary: `已按「${style.name}」整理${hasReferences ? '参考图生成' : '文字生图'}方案${cleanTitle ? '，包含你填写的标题' : ''}，请检查完整提示词后再确认生成。`
  };
}
