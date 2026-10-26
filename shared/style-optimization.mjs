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
  const kind = mapping[id] || (style?.category === '产品' || style?.category === '摄影' ? 'photography'
    : style?.category === '海报' ? 'editorial' : style?.category === '科研' || style?.category === '信息图' ? 'diagram'
    : style?.category === '漫画' ? 'narrative' : style?.category === '角色' ? 'character' : 'illustration');
  return { id: kind, ...profiles[kind], version: STYLE_OPTIMIZATION_VERSION };
}

// Render the narrow v1.5.0 validation failure as a known planning failure without rewriting history.
export function styleOptimizationFailureView(status, error, context) {
  if (!context?.styleOptimization || !['unknown', 'failed'].includes(status)) return { status, error };
  const known = context.styleOptimizationFailure?.reason === 'invalid_style_optimization';
  const legacy = typeof error === 'string' && /^(专业优化返回格式不完整|专业优化未按方案格式返回|专业优化未返回有效说明|专业优化缺少具体处理建议|专业优化建议格式或长度无效|专业优化后的方案过长)/.test(error);
  if (!known && !legacy) return { status, error };
  return { status: 'failed', recovery: 'style_template', error: known ? error : '专业优化已返回，但建议未通过格式或长度校验，尚未提交生图。可切换为“直接套用”准备方案，不再请求优化模型；本次优化是否扣费以上游账单为准，异常扣费请联系管理员微信 panrui12 核对。' };
}
