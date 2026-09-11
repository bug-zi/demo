/**
 * 好友擂台引擎：同屏 hot-seat 两真人 PK 的记分层。
 *
 * 与 duel-engine.js 完全独立 —— 第二种玩法不塞进对线引擎，「引擎不许焊死」。
 * 纯数据与规则：不碰 DOM、不 import llm（本地粗评在这里，远程评分在 llm.js 里反向依赖本文件）。
 *
 * 一场的生命周期（视图驱动，引擎只记账）：
 *   createArena 预抽 roundCount 张不重复场景卡
 *   → 每轮：双方各 recordAnswer 一次（空串 = 弃权）
 *   → 视图拿场景与作答去 llm.judgeArenaRound 评分，结果 recordScores 落账
 *   → 满 roundCount 轮后 arenaResult 判胜（引擎是胜负唯一正本，AI 说了不算）
 */

import { GENERIC_TRAPS } from '../data/scenarios.js';

export const ARENA_ROUNDS = 3;
export const ARENA_ANSWER_SECONDS = 60;
export const ARENA_MAX_CHARS = 120;

/** 第 r 轮（0 起）谁先答：轮换制，连续后答不吃亏。 */
export function firstPlayerOf(roundIndex) {
  return roundIndex % 2 === 0 ? 'p1' : 'p2';
}

/** 部分 Fisher-Yates 抽 count 张不重复卡；rand 可注入（测试确定性）。 */
export function drawScenarios(scenarios, count, rand = Math.random) {
  const pool = [...scenarios];
  const picked = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    picked.push(pool[i]);
  }
  return picked;
}

/**
 * @param {{scenarios:object[], names:{p1:string,p2:string}, roundCount?:number, rand?:function}} args
 */
export function createArena({ scenarios, names, roundCount = ARENA_ROUNDS, rand = Math.random }) {
  return {
    names: { p1: names.p1, p2: names.p2 },
    roundCount,
    scenarioIds: drawScenarios(scenarios, roundCount, rand).map((s) => s.id),
    answers: { p1: [], p2: [] },
    scores: [],
  };
}

/** 记一次作答：trim 后入账（空串照记 = 弃权，本地粗评直接 0 分）。 */
export function recordAnswer(arena, player, text) {
  arena.answers[player].push(String(text ?? '').trim());
  return arena;
}

/**
 * 落一轮评分。verdict = judgeArenaRound 的返回（p1/p2 各 {score, comment, source, fallback?}），
 * 按 scores.length 推断是第几轮，并关联当轮场景 id。
 */
export function recordScores(arena, verdict) {
  arena.scores.push({
    round: arena.scores.length + 1,
    scenarioId: arena.scenarioIds[arena.scores.length],
    p1: verdict.p1,
    p2: verdict.p2,
  });
  return arena;
}

export function arenaTotals(arena) {
  return arena.scores.reduce(
    (acc, r) => ({ p1: acc.p1 + r.p1.score, p2: acc.p2 + r.p2.score }),
    { p1: 0, p2: 0 },
  );
}

/** 胜负唯一正本：未满轮 null；满了按总分判，平分即平局。 */
export function arenaResult(arena) {
  if (arena.scores.length < arena.roundCount) return null;
  const totals = arenaTotals(arena);
  return {
    winner: totals.p1 === totals.p2 ? 'draw' : totals.p1 > totals.p2 ? 'p1' : 'p2',
    totals,
  };
}

/* ------------------------------------------------------------------ */
/* 本地粗评（无 key / 远程失败时的兜底评分）                              */
/* ------------------------------------------------------------------ */

/**
 * 确定性启发式：base 4，命中 keyword +2（封顶 +6），踩雷 -3（封顶 -9），
 * ≥12 字 +1；<4 字封顶 2；最终钳 0..10。评不了自由文本的深度，但保证有分、有话、可比较。
 */
export function localScore(scenario, text) {
  const t = String(text ?? '').trim();
  if (!t) return { score: 0, comment: '粗评：没作答，这轮白给。', hits: [], traps: [] };

  const hits = scenario.keywords.filter((kw) => t.includes(kw));
  const traps = [...scenario.traps, ...GENERIC_TRAPS].filter((tr) => t.includes(tr));

  let score = 4;
  score += Math.min(6, hits.length * 2);
  score -= Math.min(9, traps.length * 3);
  if (t.length >= 12) score += 1;
  if (t.length < 4) score = Math.min(score, 2);
  score = Math.max(0, Math.min(10, Math.round(score)));

  let comment;
  if (traps.length) comment = `粗评：上头了（${traps[0]}），评委扣分。`;
  else if (hits.length) comment = `粗评：碰到「${hits[0]}」，方向对。`;
  else comment = '粗评：四平八稳，没踩到分点。';

  return { score, comment, hits, traps };
}

/** 本地终盘复盘：文案模板 + 金句取全场单轮最高分（同分取更早轮，全 0 无金句）。 */
export function localRecap(arena) {
  const result = arenaResult(arena);
  const totals = arenaTotals(arena);
  const wName = result.winner === 'p1' ? arena.names.p1 : arena.names.p2;

  let golden = null;
  let best = 0;
  for (const r of arena.scores) {
    for (const p of ['p1', 'p2']) {
      if (r[p].score > best) {
        best = r[p].score;
        golden = { player: p, quote: arena.answers[p][r.round - 1], why: '全场最高分的一句。' };
      }
    }
  }

  const bestOf = (p) => Math.max(0, ...arena.scores.map((r) => r[p].score));
  return {
    summary:
      result.winner === 'draw'
        ? `总比分 ${totals.p1}：${totals.p2}，菜鸡互啄，不分伯仲。（本地粗评，图一乐）`
        : `${wName} 以 ${totals.p1 > totals.p2 ? `${totals.p1}：${totals.p2}` : `${totals.p2}：${totals.p1}`} 拿下。（本地粗评，图一乐）`,
    p1Comment: `三轮里最好一轮拿了 ${bestOf('p1')} 分。`,
    p2Comment: `三轮里最好一轮拿了 ${bestOf('p2')} 分。`,
    golden,
    winner: result.winner,
    source: 'local',
  };
}
