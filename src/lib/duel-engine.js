/**
 * 对线引擎：破防值、情绪阶段、软肋判定、胜负。
 *
 * 关键设计（见计划书 §6.1）：模型只负责输出 hitType 和一个判断分，
 * 破防值由前端算。模型抽风也不会把游戏搞坏 —— 数值全在这儿夹死了。
 */

import { stripEmoji } from './text.js';

export const MAX_ROUNDS = 8;
// 每回合的输入时限由难度决定，见 data/difficulty.js
export const MAX_SELF_DESTRUCTS = 2;
export const MAX_BREAKDOWN = 100;

/**
 * 判定类型 → 破防值增量。这是 80% 的那一半。
 *
 * 数值是这么配的：每个人设三个软肋的 delta 加起来 ≈ 90，
 * 所以「找齐三个软肋 + 再补一句有内容的」刚好破百；
 * 而 miss 给 0，光靠废话堆到八轮也到不了 100（8 × hit 12 = 96）。
 * 换句话说：不找软肋就别想赢。
 */
export const TABLE_DELTA = {
  softspot: 30, // 实际用软肋自带的 delta
  hit: 12,
  miss: 0,
  self_destruct: -12,
};

/* ------------------------------------------------------------------ */
/* 80 / 20                                                             */
/* ------------------------------------------------------------------ */

/**
 * 最终增量 = 查表值 × 80% + 判断分 × 20%。
 *
 * - 查表值（TABLE_DELTA）：骨架。戳没戳中软肋、有没有自爆，这部分是确定的。
 * - 判断分（judge）：这一句「到底多有杀伤力」的独立打分 ——
 *   同样戳中软肋，一句话敷衍过去和一句把人噎死，不该是一个价。
 *   远程由模型给（prompt 里给了锚点），本地由 localJudge 给。
 */
export const TABLE_WEIGHT = 0.8;
export const JUDGE_WEIGHT = 0.2;

/**
 * 判断分的合法区间，跟查表值同量纲（自爆 −12 ~ 软肋 +34 上下）。
 *
 * 必须夹死：模型要是返回 999，乘完 20% 也能一回合把破防值顶满，
 * 整局就废了 —— 「模型抽风也坏不了游戏」这条底线不能因为加了 20% 就破掉。
 */
export const JUDGE_MIN = -15;
export const JUDGE_MAX = 35;

/** 非数字、NaN、Infinity 一律返回 null，交给调用方走兜底。 */
export function clampJudge(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n), JUDGE_MIN, JUDGE_MAX);
}

/**
 * 查表值 × 80% + 判断分 × 20%，四舍五入 —— 界面上不显示小数。
 * 判断分等于查表值时结果正好是查表值本身，所以老数值原样保留。
 */
export function blendDelta(tableDelta, judgeDelta) {
  return Math.round(tableDelta * TABLE_WEIGHT + judgeDelta * JUDGE_WEIGHT);
}

// 四档的颜色不在这儿 —— 它得跟着主题走，所以放在 styles.css 的
// --stage-* 变量里，这里只留 id。加主题时不用回来改这个文件。
export const STAGES = [
  { id: 'polite', label: '礼貌', min: 0, max: 35 },
  { id: 'sarcastic', label: '阴阳', min: 35, max: 65 },
  { id: 'agitated', label: '上头', min: 65, max: 85 },
  { id: 'breakdown', label: '破防', min: 85, max: 100 },
];

export function stageOf(breakdown) {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    if (breakdown >= STAGES[i].min) return STAGES[i];
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
  // 表情先摘掉再判长度：9 个 emoji 就是 18 个 UTF-16 单元，
  // 正好够上「说了句有内容的」，白送一次 +12 —— 那表情就成了刷分器。
  // 摘掉之后，纯表情一条算什么都不说（miss），跟「表情只是语气」的设定一致。
  const t = normalize(stripEmoji(text));
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
 * 本地「判断分」：没接真实 AI 的时候，那 20% 也得有人打分。
 *
 * 基准分就是查表值 —— 不触发任何加减时，本地这一路和加机制之前一模一样，
 * 「三个预设刚好 90、补一句破百」的配平不会散架。
 * 加减刻意用跟软肋关键词无关的信号（复读、长度、标点、有没有引用对方），
 * 否则它只是把查表结果再算一遍，那 20% 就白加了。
 */
export function localJudge(duel, text, tableDelta) {
  const t = normalize(stripEmoji(text));
  if (!t) return tableDelta; // 纯表情 / 空：不奖不罚

  let score = tableDelta;

  const last = duel.rounds[duel.rounds.length - 1];
  if (last && normalize(stripEmoji(last.userText)) === t) score -= 8; // 复读机
  if (t.length < 6) score -= 5; // 俩字就想打发人
  if (/[!！?？]{2,}|\.{3,}/.test(t)) score -= 4; // 标点刷屏，底气不足
  if (HIT_HINTS.some((kw) => t.includes(kw))) score += 4; // 引用了对方 / 有反问
  if (t.length >= 20) score += 4; // 真把话说清楚了

  return clampJudge(score) ?? tableDelta;
}

export function createDuel(persona) {
  return {
    persona,
    personaId: persona.id,
    breakdown: 0,
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
 * @param {{userText:string, aiReply:string, hitType:string, quip:string, usedPreset?:boolean,
 *          softspot?:object, judgeScore?:number, silent?:boolean}} turn
 */
export function recordTurn(duel, turn) {
  const before = duel.breakdown;
  let table = TABLE_DELTA[turn.hitType] ?? 0;
  let spot = null;

  if (turn.hitType === 'softspot') {
    spot = turn.softspot || matchSoftspot(duel.persona, turn.userText);
    if (spot) {
      // 同一个软肋反复戳，效果递减——不然按着预设连点就赢了
      const repeat = duel.softspotKeys.includes(spot.key);
      table = repeat ? Math.round(spot.delta * 0.5) : spot.delta;
      if (!repeat) duel.softspotKeys.push(spot.key);
    } else {
      table = TABLE_DELTA.hit;
    }
  }

  // 20% 那部分。远程模型给了分就用它的；没给（老模型 / 降级）就本地打分。
  // 超时判的沉默不算「敷衍」，不扣分 —— 那不是玩家的句子。
  const judgeDelta = turn.silent
    ? table
    : clampJudge(turn.judgeScore) ?? localJudge(duel, turn.userText, table);
  const delta = blendDelta(table, judgeDelta);

  duel.breakdown = clamp(before + delta, 0, MAX_BREAKDOWN);
  if (turn.hitType === 'self_destruct') duel.selfDestructs += 1;
  if (turn.usedPreset) duel.usedPresets += 1;
  if (!turn.usedPreset && !turn.silent) duel.freeTextRounds += 1;

  const record = {
    round: duel.rounds.length + 1,
    userText: turn.userText,
    aiReply: turn.aiReply,
    hitType: turn.hitType,
    quip: turn.quip,
    tableDelta: table,
    judgeDelta,
    delta,
    breakdownAfter: duel.breakdown,
    stage: stageOf(duel.breakdown).id,
    softspotKey: spot ? spot.key : null,
  };
  duel.rounds.push(record);

  const result = judge(duel);
  if (result) duel.result = result;

  return { record, before, after: duel.breakdown, delta, softspot: spot, result };
}

/** 现在这一回合是第几轮（1-based）。 */
export function currentRound(duel) {
  return duel.rounds.length + 1;
}

/** @returns {'win'|'lose'|'draw'|null} */
export function judge(duel) {
  if (duel.selfDestructs >= MAX_SELF_DESTRUCTS) return 'lose';
  if (duel.breakdown >= MAX_BREAKDOWN) return 'win';
  if (duel.rounds.length >= MAX_ROUNDS) return 'draw';
  return null;
}

export function uniqueSoftspotHits(duel) {
  return duel.softspotKeys.length;
}
