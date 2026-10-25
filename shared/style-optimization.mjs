// Public labels only. Full professional instructions remain server-side.
export const STYLE_OPTIMIZATION_MODES = Object.freeze(['template', 'professional']);
export const STYLE_OPTIMIZATION_VERSION = '1.0.0';
export function normalizeStyleOptimization(value) {
  if (value === undefined) return 'template';
  if (!STYLE_OPTIMIZATION_MODES.includes(value)) throw new Error('请选择直接套用或专业优化。');
  return value;
}
const profiles = {
  photography: { name: '摄影指导', focus: '布光、机位、构图与材质表现' },
  illustration: { name: '插画指导', focus: '构图、色彩与媒介质感' },
  editorial: { name: '版式指导', focus: '视觉层级、留白与文字排版' },
  narrative: { name: '叙事指导', focus: '镜头顺序、角色一致性与阅读动线' },
  character: { name: '角色指导', focus: '角色特征、视图关系与一致性' },
  diagram: { name: '制图指导', focus: '信息层级、关系表达与标签可读性' },
  restoration: { name: '修复指导', focus: '损伤范围、细节保留与修复边界' }
};
const mapping = {
  'product-studio': 'photography', 'film-photo': 'photography', 'packaging-concept': 'photography',
  'product-white': 'photography', 'product-lifestyle': 'photography', 'photo-film': 'photography',
  'retro-poster': 'editorial', 'minimal-poster': 'editorial', 'editorial-cover': 'editorial', 'travel-poster': 'editorial',
  'knowledge-card': 'diagram', 'scientific-schematic': 'diagram', 'four-panel-comic': 'narrative',
  'character-sheet': 'character', 'photo-restoration': 'restoration'
};
export function getStyleOptimizationProfile(style) {
  const id = typeof style === 'string' ? style : style?.id;
  const kind = mapping[id] || (style?.category === '商品' || style?.category === '摄影' ? 'photography'
    : style?.category === '海报' ? 'editorial' : style?.category === '科研' || style?.category === '信息图' ? 'diagram'
    : style?.category === '漫画' ? 'narrative' : style?.category === '角色' ? 'character' : 'illustration');
  return { id: kind, ...profiles[kind], version: STYLE_OPTIMIZATION_VERSION };
}
