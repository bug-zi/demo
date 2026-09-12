/**
 * 房内关卡梯：关卡序由人设表现算，不落盘——加人设即自动长梯。
 * 同房按 difficulty 升序排关，同星按 personas.js 数组序稳定排序。
 * 所有关对玩家直接开放（全开放），梯序只承担「推荐路线」：
 * nextRecommended 指向本房第一个未通关的关（通关账允许跳关空洞），全通返回 -1。
 * 通关账记账与经济入账见 profile.js grantBattle。
 * 规范：docs/design/3.0成长系统/archive/designs-specs.md §M2.1（已落地归档）。
 */
import { PERSONAS } from '../data/personas.js';
import { categoryOf } from '../data/categories.js';

/** 房 → 关卡列表（人设按难度升序）。 */
export function ladderFor(roomId) {
  return PERSONAS.map((persona, order) => ({ persona, order }))
    .filter(({ persona }) => categoryOf(persona).id === roomId)
    .sort((a, b) => (a.persona.difficulty ?? 1) - (b.persona.difficulty ?? 1) || a.order - b.order)
    .map(({ persona }) => persona);
}

/** 人设在其房间梯子里的关卡序号（0 起）；不在梯内返回 -1。 */
export function levelIndexOf(roomId, personaId) {
  return ladderFor(roomId).findIndex((persona) => persona.id === personaId);
}

/** 第 i 关是否已通关。 */
export function isCleared(profile, roomId, levelIndex) {
  const cleared = profile?.cleared?.[roomId];
  return Array.isArray(cleared) && cleared.includes(levelIndex);
}

/** 推荐路线：本房第一个未通关的关卡序号；全通（或空房）返回 -1。 */
export function nextRecommended(profile, roomId) {
  const cleared = profile?.cleared?.[roomId];
  const clearedSet = Array.isArray(cleared) ? new Set(cleared) : new Set();
  return ladderFor(roomId).findIndex((_, i) => !clearedSet.has(i));
}
