/**
 * 场景分类登记表：选人屏分组 + 引擎模式来源。
 * mode: 'fire' 点火局（把对方激到破防）/ 'extinguish' 灭火局（把对方哄到消气）。
 * locked 分组在选人屏显示「即将开放」占位，不做死链。
 */

export const CATEGORIES = [
  { id: 'gang', name: '杠精房', mode: 'fire', hint: '点火局 · 把 TA 说到破防' },
  { id: 'deal', name: '谈判房', mode: 'fire', hint: '点火局 · 把 TA 说到破防' },
  { id: 'eq', name: '情商房', mode: 'extinguish', hint: '灭火局 · 把 TA 哄到消气', locked: true },
];

const FALLBACK_CATEGORY = CATEGORIES[0];

/** 人设查所属分类；没挂 category 的兜底归杠精房，别让漏标把选人屏搞挂。 */
export function categoryOf(persona) {
  if (!persona) return FALLBACK_CATEGORY;
  return CATEGORIES.find((c) => c.id === persona.category) || FALLBACK_CATEGORY;
}
