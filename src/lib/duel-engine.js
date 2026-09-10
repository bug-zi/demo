/**
 * 对线引擎：怒气值、情绪阶段、软肋判定、胜负。
 *
 * 关键设计（见计划书 §6.1）：模型只负责输出 hitType，
 * 怒气值由前端查表计算。模型抽风也不会把游戏搞坏。
 *
 * 两种模式（见 categories.js）：
 * - fire 点火局：怒气 0 起步，把对方激到 100 算赢（杠精房/谈判房）。
 * - extinguish 灭火局：怒气 100 起步，把对方哄到阈值下算赢（情商房）；
 *   增量方向整体翻转、八轮没哄好判负，没有平局。
 */

import { categoryOf } from '../data/categories.js';

export const MAX_ROUNDS = 8;
export const ROUND_SECONDS = 30;
export const MAX_SELF_DESTRUCTS = 2;
export const MAX_ANGER = 100;
export const EXTINGUISH_WIN_ANGER = 20;

/**
 * 判定类型 → 怒气增量。
 *
 * 数值是这么配的：每个人设三个软肋的 delta 加起来 ≈ 90，
 * 所以「找齐三个软肋 + 再补一句有内容的」刚好破百；
 * 而 miss 给 0，光靠废话堆到八轮也到不了 100（8 × hit 12 = 96）。
 * 换句话说：不找软肋就别想赢。
 */
export const ANGER_DELTA = {
  softspot: 30, // 实际用软肋自带的 delta
  hit: 12,
  miss: 0,
  self_destruct: -12,
};

export const STAGES = [
  { id: 'polite', label: '礼貌', min: 0, max: 35 },
  { id: 'sarcastic', label: '阴阳', min: 35, max: 65 },
  { id: 'agitated', label: '上头', min: 65, max: 85 },
  { id: 'breakdown', label: '破防', min: 85, max: 100 },
];

export function stageOf(anger) {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    if (anger >= STAGES[i].min) return STAGES[i];
  }
  return STAGES[0];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** 玩家自己上头的信号：骂人、人身攻击、语无伦次。 */
const SELF_DESTRUCT_HINTS = [
  '你懂个屁', '闭嘴', '滚', '傻', '白痴', '有病', '神经病', '垃圾',
  '废物', '你算什么东西', '你算什么', '去死', '闭嘴吧', '你是不是',
];

/** 有效输出的信号：有论点、有反问、有引用。 */
const HIT_HINTS = [
  '但是', '因为', '所以', '请问', '你刚才', '你说过', '证据', '那你',
  '凭什么', '你自己', '你上次', '反过来', '如果', '明明', '可是',
];

function normalize(text) {
  return String(text || '').replace(/\s+/g, '');
}

/**
 * 玩家这句话扎中了哪个软肋？没扎中返回 null。
 */
export function matchSoftspot(persona, text) {
  const t = normalize(text);
  if (!t) return null;
  for (const spot of persona.softspots) {
    if (spot.keywords.some((kw) => t.includes(kw))) return spot;
  }
  return null;
}

/**
 * 本地判定（无 API key 时用；也作为远程返回异常时的兜底）。
 */
export function localHitType(persona, text) {
  const t = normalize(text);
  if (!t) return 'miss';

  if (matchSoftspot(persona, t)) return 'softspot';

  // 只认「骂人」和「语无伦次」两种信号；话说得长不算自爆
  const looksUnhinged =
    /[!！]{3,}|[?？]{3,}/.test(t) || SELF_DESTRUCT_HINTS.some((kw) => t.includes(kw));
  if (looksUnhinged) return 'self_destruct';

  const hasArgument = t.length >= 8 && HIT_HINTS.some((kw) => t.includes(kw));
  if (hasArgument || t.length >= 18) return 'hit';

  return 'miss';
}

/**
 * @param {object} persona
 * @param {{roundSeconds?:number}} [options] 回合倒计时秒数，0 = 不限时（UI 层据此不启动倒计时）；
 *   默认仍是 ROUND_SECONDS。时限跟着 duel 走：进行中的局不随设置改动变卦。
 */
export function createDuel(persona, { roundSeconds = ROUND_SECONDS } = {}) {
  const mode = categoryOf(persona).mode;
  return {
    persona,
    personaId: persona.id,
    mode,
    roundSeconds,
    // 点火从 0 拉满，灭火从 100 往下哄
    anger: mode === 'extinguish' ? MAX_ANGER : 0,
    rounds: [],
    selfDestructs: 0,
    softspotKeys: [],
    usedPresets: 0,
    freeTextRounds: 0, // 玩家自己打字（而不是点预设/沉默）的回合数
    result: null,
  };
}

/**
 * 记录一个回合，返回这一回合的结算信息。
 *
 * @param {object} duel
 * @param {{userText:string, aiReply:string, hitType:string, quip:string, usedPreset?:boolean, softspot?:object}} turn
 */
export function recordTurn(duel, turn) {
  const before = duel.anger;
  let delta = ANGER_DELTA[turn.hitType] ?? 0;
  let spot = null;

  if (turn.hitType === 'softspot') {
    spot = turn.softspot || matchSoftspot(duel.persona, turn.userText);
    if (spot) {
      // 同一个软肋反复戳，效果递减——不然按着预设连点就赢了
      const repeat = duel.softspotKeys.includes(spot.key);
      delta = repeat ? Math.round(spot.delta * 0.5) : spot.delta;
      if (!repeat) duel.softspotKeys.push(spot.key);
    } else {
      delta = ANGER_DELTA.hit;
    }
  }

  // 灭火局整体翻方向：戳心结/有效安抚降怒气，火上浇油反而反弹
  if (duel.mode === 'extinguish') delta = -delta;

  duel.anger = clamp(before + delta, 0, MAX_ANGER);
  if (turn.hitType === 'self_destruct') duel.selfDestructs += 1;
  if (turn.usedPreset) duel.usedPresets += 1;
  if (!turn.usedPreset && !turn.silent) duel.freeTextRounds += 1;

  const record = {
    round: duel.rounds.length + 1,
    userText: turn.userText,
    aiReply: turn.aiReply,
    hitType: turn.hitType,
    quip: turn.quip,
    delta,
    angerAfter: duel.anger,
    stage: stageOf(duel.anger).id,
    softspotKey: spot ? spot.key : null,
  };
  duel.rounds.push(record);

  const result = judge(duel);
  if (result) duel.result = result;

  return { record, before, after: duel.anger, delta, softspot: spot, result };
}

/** 现在这一回合是第几轮（1-based）。 */
export function currentRound(duel) {
  return duel.rounds.length + 1;
}

/** @returns {'win'|'lose'|'draw'|null} */
export function judge(duel) {
  if (duel.selfDestructs >= MAX_SELF_DESTRUCTS) return 'lose';
  // 灭火局开局就是满怒气——必须先看 mode，再比数值，否则首回合就被 fire 规则误判成 win
  if (duel.mode === 'extinguish') {
    if (duel.anger <= EXTINGUISH_WIN_ANGER) return 'win';
    if (duel.rounds.length >= MAX_ROUNDS) return 'lose'; // 时间到没哄好，明确失败态
    return null;
  }
  if (duel.anger >= MAX_ANGER) return 'win';
  if (duel.rounds.length >= MAX_ROUNDS) return 'draw';
  return null;
}

export function uniqueSoftspotHits(duel) {
  return duel.softspotKeys.length;
}
