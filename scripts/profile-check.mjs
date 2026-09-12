// 成长档案层回归：心池恢复 / 战斗结算 / 升级链 / 买心 / 坏数据收敛 / 成就管道。
// 不开浏览器，纯 Node 直测（localStorage 用 mock 注入）。用法：npm run profile-check
import {
  ECONOMY,
  defaultProfile,
  loadProfile,
  saveProfile,
  tickHearts,
  heartsRegenEta,
  canBattle,
  grantBattle,
  buyHeart,
  buildCtx,
  grantArena,
  evaluateAchievements,
  applyAchievements,
} from '../src/lib/profile.js';
import {
  ladderFor,
  levelIndexOf,
  isCleared,
  nextRecommended,
} from '../src/lib/ladder.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { PERSONAS } from '../src/data/personas.js';
import { SCENES } from '../src/data/comebacks.js';
import { STICKERS } from '../src/data/stickers.js';
import { TITLES, EQ_TITLES } from '../src/data/titles.js';
import { equipTitle } from '../src/lib/profile.js';

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};

const MIN = 60 * 1000;
const REGEN = ECONOMY.HEART_REGEN_MS;

/* ---- localStorage mock（无存储环境 ↔ 坏数据注入两用） ---- */
function mockStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const withStore = (store, fn) => {
  const prev = globalThis.localStorage;
  globalThis.localStorage = store;
  try {
    fn();
  } finally {
    globalThis.localStorage = prev;
  }
};

/* ---- 局部断言助手 ---- */
let section = '';
const ok = (cond, msg) => {
  if (!cond) fail(`[${section}] ${msg}`);
};
const eq = (actual, expected, msg) => ok(actual === expected, `${msg}（期望 ${expected}，实际 ${actual}）`);

const battle = (over = {}) => ({
  duelId: over.duelId ?? `d-${Math.random().toString(36).slice(2, 8)}`,
  outcome: 'win',
  difficulty: 3,
  mode: 'fire',
  personaId: 'wangyou',
  ts: new Date().setHours(14, 0, 0, 0),
  ...over,
});

/* ============ 0. 默认档与无存储环境 ============ */
section = '默认档';
const fresh = defaultProfile();
eq(fresh.v, 1, 'schema 版本');
eq(fresh.level, 1, '初始等级 1');
eq(fresh.hearts, ECONOMY.HEART_START, '初始满心');
eq(fresh.coins, 0, '初始 0 金币');
eq(fresh.xp, 0, '初始 0 经验');
eq(fresh.demoMode, false, '演示模式默认关');
ok(Number.isFinite(fresh.lastRegenAt), 'lastRegenAt 是时间戳');
eq(fresh.cleared.gang.length + fresh.cleared.deal.length + fresh.cleared.eq.length, 0, '初始无通关');
eq(Object.keys(fresh.achievements).length, 0, '初始无成就');
eq(fresh.processedDuels.length, 0, '初始无已结算对局');

withStore(undefined, () => {
  const p = loadProfile();
  eq(p.hearts, ECONOMY.HEART_START, '无存储环境 loadProfile 回默认档');
  const saved = saveProfile({ ...p, coins: 33 });
  eq(saved.coins, 33, '无存储环境 saveProfile 安静返回收敛值');
});

/* ============ 1. 坏数据收敛 ============ */
section = '坏数据收敛';
withStore(mockStore(), () => {
  const noisy = console.warn;
  console.warn = () => {};
  try {
    globalThis.localStorage.setItem('gang-ai:profile:v1', '{oops 不是 JSON');
    eq(loadProfile().hearts, ECONOMY.HEART_START, '解析失败回默认档');
  } finally {
    console.warn = noisy;
  }
  globalThis.localStorage.setItem('gang-ai:profile:v1', JSON.stringify({ v: 9, xp: 5, hearts: 3 }));
  eq(loadProfile().v, 1, '未知 schema 版本重置');
  globalThis.localStorage.setItem(
    'gang-ai:profile:v1',
    JSON.stringify({
      v: 1,
      xp: -5,
      level: -3,
      coins: 'abc',
      hearts: 99,
      demoMode: 'yes',
      cleared: 'nope',
      processedDuels: ['ok', 42, '', 'ok'],
      stats: { wins: -2, personaWins: 'x', lastOutcomes: 'nope' },
    }),
  );
  const bad = loadProfile();
  eq(bad.xp, 0, '负经验收敛 0');
  eq(bad.level, 1, '负等级收敛 1');
  eq(bad.coins, 0, '非数值金币收敛 0');
  eq(bad.hearts, ECONOMY.HEARTS_MAX, '超界心数封顶');
  eq(bad.demoMode, false, '演示模式只认布尔真值');
  ok(bad.cleared && Array.isArray(bad.cleared.gang), 'cleared 结构重建');
  eq(bad.processedDuels.length, 1, 'processedDuels 过滤非字符串且去重');
  eq(bad.stats.wins, 0, '负胜场收敛 0');
  ok(bad.stats.personaWins && typeof bad.stats.personaWins === 'object', 'personaWins 结构重建');
  ok(Array.isArray(bad.stats.lastOutcomes), 'lastOutcomes 结构重建');
});
withStore(mockStore(), () => {
  globalThis.localStorage.setItem('gang-ai:profile:v1', JSON.stringify({ v: 1, hearts: 2.7, xp: 10.9 }));
  const p = loadProfile();
  eq(p.hearts, 2, '非整数心数取整');
  eq(p.xp, 10, '非整数经验取整');
});

/* ============ 2. 存取回路 ============ */
section = '存取回路';
withStore(mockStore(), () => {
  const p = defaultProfile();
  p.coins = 77;
  p.stats.wins = 3;
  saveProfile(p);
  const back = loadProfile();
  eq(back.coins, 77, '金币回路');
  eq(back.stats.wins, 3, 'stats 回路');
});

/* ============ 3. 心池恢复 ============ */
section = '心池恢复';
{
  const now = Date.now();
  const p = defaultProfile();
  p.hearts = ECONOMY.HEARTS_MAX;
  p.lastRegenAt = now - 3 * 60 * MIN;
  tickHearts(p, now);
  eq(p.hearts, ECONOMY.HEARTS_MAX, '满心不再回');
  eq(p.lastRegenAt, now, '满心时重置记账起点');

  const q = defaultProfile();
  q.hearts = 3;
  q.lastRegenAt = now - 45 * MIN;
  tickHearts(q, now);
  eq(q.hearts, 4, '45 分钟回 1 颗');
  eq(q.lastRegenAt, now - 15 * MIN, '保留 15 分钟余数进度');

  const r = defaultProfile();
  r.hearts = 3;
  r.lastRegenAt = now - 3 * 60 * MIN;
  tickHearts(r, now);
  eq(r.hearts, ECONOMY.HEARTS_MAX, '3 小时回满封顶');
  eq(r.lastRegenAt, now, '回满后记账起点重置');

  const s = defaultProfile();
  s.hearts = 0;
  s.lastRegenAt = now - REGEN;
  tickHearts(s, now);
  eq(s.hearts, 1, '归零后 30 分钟回 1 颗');

  const t = defaultProfile();
  t.hearts = 0;
  t.demoMode = true;
  t.lastRegenAt = now - REGEN;
  tickHearts(t, now);
  eq(t.hearts, 1, '演示模式不拦自然恢复');

  const e = defaultProfile();
  e.hearts = 3;
  e.lastRegenAt = now - 10 * MIN;
  eq(heartsRegenEta(e, now), 20 * MIN, '下一颗心倒计时 20 分钟');
  const f = defaultProfile();
  f.hearts = ECONOMY.HEARTS_MAX;
  eq(heartsRegenEta(f, now), 0, '满心倒计时为 0');
}

/* ============ 4. 可开战 ============ */
section = '可开战';
{
  const p = defaultProfile();
  p.hearts = 0;
  eq(canBattle(p), false, '没心不能开战');
  p.demoMode = true;
  eq(canBattle(p), true, '演示模式没心也能开战');
  p.demoMode = false;
  p.hearts = 2;
  eq(canBattle(p), true, '有心就能开战');
}

/* ============ 5. 战斗结算金额 ============ */
section = '战斗结算';
{
  const p = defaultProfile();
  const s1 = grantBattle(p, battle({ difficulty: 3 }));
  eq(s1.xp, 60, '胜局经验 30+10×3');
  eq(s1.coins, 110, '首通金币 50+20×3');
  eq(s1.heartsDelta, 0, '胜局不掉心');
  eq(s1.firstClear, true, '默认按首通计（M1 简化）');
  eq(p.stats.wins, 1, '胜场 +1');
  eq(p.processedDuels.length, 1, 'duelId 入账');

  const again = grantBattle(p, { ...battle({ duelId: 'd-same' }), duelId: p.processedDuels[0] });
  eq(again.idempotent, true, '同局重放标记幂等');
  eq(again.xp + again.coins, 0, '同局重放零入账');
  eq(p.stats.wins, 1, '胜场不重复计');

  const q = defaultProfile();
  const s2 = grantBattle(q, battle({ outcome: 'lose' }));
  eq(s2.xp, ECONOMY.LOSE_XP, '负局安慰经验');
  eq(s2.coins, 0, '负局 0 金币');
  eq(s2.heartsDelta, -1, '负局掉 1 心');
  eq(q.hearts, ECONOMY.HEART_START - 1, '心池扣减');
  eq(q.stats.losses, 1, '败场 +1');

  q.hearts = 0;
  q.demoMode = false;
  const s3 = grantBattle(q, battle({ outcome: 'lose', difficulty: 2 }));
  eq(q.hearts, 0, '心数为 0 时输局不再扣成负数');
  eq(s3.heartsDelta, 0, '扣无可扣记 0');

  const demo = defaultProfile();
  demo.demoMode = true;
  const s4 = grantBattle(demo, battle({ outcome: 'lose' }));
  eq(demo.hearts, ECONOMY.HEART_START, '演示模式输局不掉心');
  eq(s4.heartsDelta, 0, '演示模式掉心记 0');

  const dr = defaultProfile();
  const s5 = grantBattle(dr, battle({ outcome: 'draw' }));
  eq(s5.xp, ECONOMY.LOSE_XP, '和局安慰经验');
  eq(s5.coins, 0, '和局 0 金币');
  eq(dr.hearts, ECONOMY.HEART_START, '和局不掉心');
  eq(dr.stats.draws, 1, '和局 +1');

  const rp = defaultProfile();
  const s6 = grantBattle(rp, battle({ difficulty: 5, isReplay: true }));
  eq(s6.xp, 80, '复刷经验照发 30+10×5');
  eq(s6.coins, Math.floor(150 * ECONOMY.REPLAY_FACTOR), '复刷金币 = 首通×0.3');
  eq(s6.firstClear, false, '复刷标记非首通');
  eq(rp.stats.replayWins, 1, '复刷胜场统计');
}

/* ============ 6. 升级链 ============ */
section = '升级链';
{
  const p = defaultProfile();
  grantBattle(p, battle({ duelId: 'a', difficulty: 5 })); // xp 80
  grantBattle(p, battle({ duelId: 'b', difficulty: 5 })); // xp 160 → Lv2 余 60
  eq(p.level, 2, '两胜升到 Lv2');
  eq(p.coins, 150 + 150 + ECONOMY.LEVEL_UP_COINS + ECONOMY.ACHIEVEMENT_COINS.bronze,
    '两场首通 300 + 升级 100 + 首胜成就 50');
  eq(p.xp, 60, '升级后余 60 经验');

  const q = defaultProfile();
  q.xp = 240;
  const s = grantBattle(q, battle({ duelId: 'c', difficulty: 1 })); // 280 → Lv2(余180) → Lv3(余30)
  eq(q.level, 3, '一次跨两级');
  eq(s.levelUps.length, 2, 'levelUps 记两级');
  eq(q.xp, 30, '跨两级后余 30');
  eq(q.coins, 70 + 2 * ECONOMY.LEVEL_UP_COINS + ECONOMY.ACHIEVEMENT_COINS.bronze,
    '本场首通 70 + 两级各 100 + 首胜成就 50');

  const h = defaultProfile();
  h.hearts = 3;
  h.level = 4;
  h.xp = 240;
  grantBattle(h, battle({ duelId: 'd', difficulty: 5 })); // 320 → Lv5（需 250，余 70）
  eq(h.level, 5, '升到 Lv5');
  eq(h.hearts, 4, '每满 5 级送 1 心');
}

/* ============ 7. 买心 ============ */
section = '买心';
{
  const p = defaultProfile();
  p.hearts = 4;
  p.coins = 50;
  p.achievements.whale = 1; // 预持「氪金玩家」，买心用例不掺成就回补
  eq(buyHeart(p), 'ok', '足额买心成功');
  eq(p.coins, 0, '买心扣 50 币');
  eq(p.hearts, ECONOMY.HEARTS_MAX, '买心补满');
  eq(p.stats.boughtHearts, 1, '买心统计 +1');
  eq(buyHeart(p), 'full', '满心拒买');
  const firstBuy = defaultProfile();
  firstBuy.hearts = 4;
  firstBuy.coins = 50;
  eq(buyHeart(firstBuy), 'ok', '首次买心成功');
  eq(firstBuy.coins, ECONOMY.ACHIEVEMENT_COINS.bronze, '首买解锁氪金玩家回补 50 币');
  ok(firstBuy.achievements.whale > 0, '氪金玩家随首买解锁');
  const q = defaultProfile();
  q.hearts = 3;
  q.coins = 49;
  eq(buyHeart(q), 'no_coins', '钱不够拒买');
  eq(q.coins, 49, '拒买不扣钱');
}

/* ============ 8. processedDuels 封顶 ============ */
section = '对局账本封顶';
{
  const p = defaultProfile();
  for (let i = 0; i < 55; i += 1) grantBattle(p, battle({ duelId: `d-${i}`, outcome: i % 2 ? 'win' : 'lose' }));
  eq(p.processedDuels.length, 50, '封顶 50 条');
  eq(p.processedDuels[0], 'd-5', '最老的 5 条被淘汰');
  eq(p.processedDuels[49], 'd-54', '最新的在尾部');
}

/* ============ 9. stats 记账 ============ */
section = 'stats 记账';
{
  const p = defaultProfile();
  grantBattle(p, battle({ duelId: 's1' }));
  grantBattle(p, battle({ duelId: 's2', stickerIds: ['smile', 'smile', 'fire'], softspotHitKinds: ['a', 'b', 'a'] }));
  grantBattle(p, battle({ duelId: 's3', outcome: 'lose' }));
  eq(p.stats.wins, 2, '胜场 2');
  eq(p.stats.streak, 0, '输后连胜清零');
  eq(p.stats.maxStreak, 2, '最大连胜 2');
  eq(JSON.stringify(p.stats.lastOutcomes), JSON.stringify(['win', 'win', 'lose']), 'lastOutcomes 保留最近三局');
  eq(p.stats.personaWins.wangyou, 2, '人设胜场记账');
  eq(p.stats.personaWinStreak.wangyou, 0, '人设连胜输局清零');
  eq(p.stats.stickersUsed.smile, 2, '表情包按 id 计数');
  eq(p.stats.stickersUsed.fire, 1, '表情包第二 id 计数');
  eq(p.stats.softspotHitsBest, 2, '单局去重软肋纪录');

  const t = defaultProfile();
  grantBattle(t, battle({ duelId: 't1' }));
  grantBattle(t, battle({ duelId: 't2' }));
  grantBattle(t, battle({ duelId: 't3', difficulty: 4 }));
  eq(t.stats.personaWinStreak.wangyou, 3, '同一人设连胜累计');

  const n = defaultProfile();
  grantBattle(n, battle({ duelId: 'n1', ts: new Date().setHours(2, 30, 0, 0) }));
  eq(n.stats.lateNightDuels, 1, '凌晨局计入夜猫子');
  grantBattle(n, battle({ duelId: 'n2', ts: new Date().setHours(14, 0, 0, 0) }));
  eq(n.stats.lateNightDuels, 1, '白天局不计');

  const h1 = defaultProfile();
  h1.hearts = 1;
  grantBattle(h1, battle({ duelId: 'h1' }));
  eq(h1.stats.winsWithHeartOne, 1, '背水一战记账');

  const lv = defaultProfile();
  grantBattle(lv, battle({ duelId: 'lv1', roomId: 'gang', levelIndex: 0, outcome: 'lose' }));
  grantBattle(lv, battle({ duelId: 'lv2', roomId: 'gang', levelIndex: 0 }));
  eq(lv.stats.levelAttempts['gang:0'], 2, '关卡尝试数按完成局计');
  eq(JSON.stringify(lv.cleared.gang), JSON.stringify([0]), '胜局写通关账、败局不写');
}

/* ============ 10. 成就管道 ============ */
section = '成就管道';
{
  const p = defaultProfile();
  eq(evaluateAchievements(p, buildCtx()).length, 0, '默认档案在全表下零解锁');

  const TABLE = [
    {
      id: 'test_bronze',
      name: '测试铜',
      tier: 'bronze',
      coins: 50,
      check: (prof) => prof.stats.wins >= 1,
    },
    {
      id: 'test_title',
      name: '带称号',
      tier: 'gold',
      coins: 200,
      title: 'test-title',
      check: (prof) => prof.stats.wins >= 2,
    },
  ];
  eq(evaluateAchievements(p, buildCtx(), TABLE).length, 0, '条件未达不解锁');
  grantBattle(p, battle({ duelId: 'ac1' }));
  let pending = evaluateAchievements(p, buildCtx(), TABLE);
  eq(pending.length, 1, '首胜触发第一条');
  eq(pending[0].id, 'test_bronze', '返回的是成就定义');
  applyAchievements(p, pending);
  eq(p.coins, 110 + ECONOMY.ACHIEVEMENT_COINS.bronze + ECONOMY.ACHIEVEMENT_COINS.bronze,
    '解锁发铜币（战斗币 110 + 首胜成就 50 + 测试铜 50）');
  ok(p.achievements.test_bronze > 0, '盖章时间戳');
  eq(evaluateAchievements(p, buildCtx(), TABLE).length, 0, '已解锁不重复返回');

  grantBattle(p, battle({ duelId: 'ac2' }));
  pending = evaluateAchievements(p, buildCtx(), TABLE);
  eq(pending.length, 1, '两胜触发带称号成就');
  applyAchievements(p, pending);
  ok(p.titlesOwned.includes('test-title'), '成就称号入册');
  const coinChain = 110 + ECONOMY.ACHIEVEMENT_COINS.bronze + ECONOMY.ACHIEVEMENT_COINS.bronze
    + 110 + ECONOMY.LEVEL_UP_COINS + ECONOMY.ACHIEVEMENT_COINS.gold;
  eq(p.coins, coinChain, '金币链：战斗 110 + 首胜 50 + 测试铜 50 + 战斗 110 + 升级 100 + 金档 200');
  applyAchievements(p, pending);
  eq(p.coins, coinChain, '重复 apply 不重复发奖');
}

/* ============ 11. buildCtx ============ */
section = 'buildCtx';
withStore(mockStore(), () => {
  globalThis.localStorage.setItem('gang-ai:favorites:v1', JSON.stringify(['a', 'b']));
  const ctx = buildCtx();
  eq(ctx.favoritesCount, 2, '收藏数从 notes 现查');
  eq(ctx.notesCount, 0, '笔记数从 notes 现查');
});

/* ============ 12. 擂台入账 ============ */
section = '擂台入账';
{
  const p = defaultProfile();
  const defs = grantArena(p, { win: true, bestRound: 9, recap: true });
  eq(p.stats.arenaPlays, 1, '场次 +1');
  eq(p.stats.arenaWins, 1, '胜场 +1');
  eq(p.stats.arenaBestRound, 9, '单回合最高分刷新');
  eq(p.stats.arenaRecaps, 1, '复盘次数 +1');
  ok(Array.isArray(defs), '返回成就定义数组');
  grantArena(p, { win: false, bestRound: 7, recap: false });
  eq(p.stats.arenaPlays, 2, '负场也计次');
  eq(p.stats.arenaWins, 1, '负场不计胜');
  eq(p.stats.arenaBestRound, 9, '最高分不被更低分刷掉');
}

/* ============ 13. ECONOMY 常量契约 ============ */
section = '常量契约';
eq(ECONOMY.HEARTS_MAX, 5, '心池上限 5');
eq(ECONOMY.HEART_PRICE, 50, '买心 50 币');
eq(ECONOMY.XP_TO_NEXT(1), 100, 'Lv1→2 需 100');
eq(ECONOMY.XP_TO_NEXT(3), 200, 'Lv3→4 需 200');
eq(ECONOMY.ACHIEVEMENT_COINS.king, 300, '王者档 300 币');

/* ============ 14. 房内关卡梯（全开放 + 推荐路线） ============ */
section = '关卡梯';
{
  const gang = ladderFor('gang');
  eq(gang.map((p) => p.id).join(','), 'shengren,qinqi,wangyou,banping,qungui,yimoulun', '杠精房按难度 1→5、同星按数组序');
  const deal = ladderFor('deal');
  eq(deal.map((p) => p.id).join(','), 'chefan,tanzhu,zhongjie,laoban,hr,jiafang', '谈判房按难度 1→5、同星按数组序');
  const eqRoom = ladderFor('eq');
  eq(eqRoom.map((p) => p.id).join(','), 'naicha,chadui,gezi,laodie,zhigyou,chaping', '情商房按难度 1→5、同星按数组序');
  eq(levelIndexOf('gang', 'wangyou'), 2, '网友是杠精房第 3 关');
  eq(levelIndexOf('gang', 'shengren'), 0, '评论区圣人是杠精房首关');
  eq(levelIndexOf('gang', 'nope'), -1, '陌生 id 返回 -1');

  const p = defaultProfile();
  p.cleared.gang = [0, 2];
  ok(isCleared(p, 'gang', 2), '已通关按坐标查真（账容空洞）');
  eq(isCleared(p, 'gang', 1), false, '空洞位不误报');
  eq(isCleared(p, 'gang', 3), false, '未通关不误报');
  eq(isCleared(p, 'nope', 0), false, '陌生房间无通关账可查');

  eq(nextRecommended(p, 'gang'), 1, '空洞账推荐落在第一个未通关');
  p.cleared.gang = [];
  eq(nextRecommended(p, 'gang'), 0, '新档推荐首关');
  p.cleared.gang = [0, 1, 2, 3, 4, 5];
  eq(nextRecommended(p, 'gang'), -1, '全通无推荐');
  eq(nextRecommended(p, 'nope'), -1, '陌生房无梯无推荐');

  const q = defaultProfile();
  const s1 = grantBattle(q, battle({ duelId: 'l1', roomId: 'gang', levelIndex: 0 }));
  ok(q.cleared.gang.includes(0), '胜局写通关账');
  eq(s1.firstClear, true, '首次通关标记');
  grantBattle(q, battle({ duelId: 'l2', roomId: 'gang', levelIndex: 0, isReplay: true }));
  eq(JSON.stringify(q.cleared.gang), JSON.stringify([0]), '重复通关去重');
  grantBattle(q, battle({ duelId: 'l3', roomId: 'gang', levelIndex: 1, outcome: 'lose' }));
  eq(q.cleared.gang.length, 1, '败局不写通关账');
  grantBattle(q, battle({ duelId: 'l4', roomId: 'nope', levelIndex: 0 }));
  eq(q.cleared.nope, undefined, '陌生房间不产生通关账');

  const r = defaultProfile();
  const r1 = grantBattle(r, battle({ duelId: 'r1', roomId: 'deal', levelIndex: 0, difficulty: 2 }));
  eq(r1.coins, 90, '首通金币 50+20×2');
  const r2 = grantBattle(r, battle({ duelId: 'r2', roomId: 'deal', levelIndex: 0, difficulty: 2, isReplay: true }));
  eq(r2.coins, Math.floor(90 * ECONOMY.REPLAY_FACTOR), '复刷金币按首通×0.3');
  eq(r2.firstClear, false, '复刷不算首通');
}

/* ============ 15. 成就表（M4）：36 条逐条正反例 ============ */
section = '成就表';
{
  const CTX0 = { favoritesCount: 0, notesCount: 0 };
  eq(ACHIEVEMENTS.length, 36, '成就总数 36');
  const TIERS = ['bronze', 'silver', 'gold', 'king'];
  for (const def of ACHIEVEMENTS) {
    if (!def.id || !def.name || !def.desc) fail(`[${section}] 成就缺 id/名称/描述`);
    if (!TIERS.includes(def.tier)) fail(`[${section}] ${def.id} tier 非法：${def.tier}`);
    if (typeof def.check !== 'function') fail(`[${section}] ${def.id} check 不是函数`);
    if (def.hearts) fail(`[${section}] ${def.id} v1 不发心（hearts 保留不填）`);
  }
  eq(new Set(ACHIEVEMENTS.map((d) => d.id)).size, 36, '成就 id 唯一');
  eq(ACHIEVEMENTS.filter((d) => d.hidden === true).length, 6, '隐藏成就恰好 6 条');

  const roomFull = (roomId) => ladderFor(roomId).map((_, i) => i);
  const allTitles = [...TITLES, ...EQ_TITLES].map((t) => t.id).concat(['jiafang-harvester']);
  eq(allTitles.length, 9, '称号全图共 9 枚（8 赛后 + 1 成就专属）');
  eq(allTitles.filter((id, i) => allTitles.indexOf(id) !== i).length, 0, '称号 id 无重复');

  /* 每条：yes 必给（达标构造），no 可省（省略 = 默认档即反例） */
  const CASES = [
    { id: 'first_win', yes: (p) => { p.stats.wins = 1; } },
    { id: 'ten_wins', yes: (p) => { p.stats.wins = 10; }, no: (p) => { p.stats.wins = 9; } },
    { id: 'thirty_wins', yes: (p) => { p.stats.wins = 30; }, no: (p) => { p.stats.wins = 29; } },
    { id: 'softspot_master', yes: (p) => { p.stats.softspotHitsBest = 3; }, no: (p) => { p.stats.softspotHitsBest = 2; } },
    { id: 'phoenix', yes: (p) => { p.stats.selfDestructWins = 1; } },
    { id: 'full_battle', yes: (p) => { p.stats.fullRoundWins = 1; } },
    { id: 'gang_clear', yes: (p) => { p.cleared.gang = roomFull('gang'); } },
    { id: 'deal_clear', yes: (p) => { p.cleared.deal = roomFull('deal'); } },
    { id: 'eq_clear', yes: (p) => { p.cleared.eq = roomFull('eq'); }, no: (p) => { p.cleared.eq = roomFull('eq').slice(1); } },
    {
      id: 'all_clear',
      yes: (p) => { p.cleared.gang = roomFull('gang'); p.cleared.deal = roomFull('deal'); p.cleared.eq = roomFull('eq'); },
      no: (p) => { p.cleared.gang = roomFull('gang'); p.cleared.deal = roomFull('deal'); p.cleared.eq = roomFull('eq').slice(1); },
    },
    {
      id: 'one_shot',
      yes: (p) => { p.stats.levelAttempts = { 'gang:0': 1 }; p.cleared.gang = [0]; },
      no: (p) => { p.stats.levelAttempts = { 'gang:0': 2 }; p.cleared.gang = [0]; },
    },
    { id: 'replay_10', yes: (p) => { p.stats.replayWins = 10; }, no: (p) => { p.stats.replayWins = 9; } },
    { id: 'first_fav', yes: (_p, ctx) => { ctx.favoritesCount = 1; } },
    { id: 'fav_10', yes: (_p, ctx) => { ctx.favoritesCount = 10; }, no: (_p, ctx) => { ctx.favoritesCount = 9; } },
    { id: 'fav_30', yes: (_p, ctx) => { ctx.favoritesCount = 30; }, no: (_p, ctx) => { ctx.favoritesCount = 29; } },
    { id: 'first_note', yes: (_p, ctx) => { ctx.notesCount = 1; } },
    { id: 'note_10', yes: (_p, ctx) => { ctx.notesCount = 10; }, no: (_p, ctx) => { ctx.notesCount = 9; } },
    {
      id: 'read_all',
      yes: (p) => { p.stats.scenesViewed = SCENES.map((s) => s.id); },
      no: (p) => { p.stats.scenesViewed = SCENES.slice(1).map((s) => s.id); },
    },
    { id: 'arena_first', yes: (p) => { p.stats.arenaPlays = 1; } },
    { id: 'arena_win', yes: (p) => { p.stats.arenaWins = 1; } },
    { id: 'arena_win_3', yes: (p) => { p.stats.arenaWins = 3; }, no: (p) => { p.stats.arenaWins = 2; } },
    { id: 'arena_high', yes: (p) => { p.stats.arenaBestRound = 9; }, no: (p) => { p.stats.arenaBestRound = 8; } },
    { id: 'arena_ai', yes: (p) => { p.stats.arenaRecaps = 1; } },
    { id: 'arena_3', yes: (p) => { p.stats.arenaPlays = 3; }, no: (p) => { p.stats.arenaPlays = 2; } },
    { id: 'title_3', yes: (p) => { p.titlesOwned = ['a', 'b', 'c']; }, no: (p) => { p.titlesOwned = ['a', 'b']; } },
    { id: 'title_8', yes: (p) => { p.titlesOwned = allTitles.slice(0, 8); }, no: (p) => { p.titlesOwned = allTitles.slice(0, 7); } },
    { id: 'title_all', yes: (p) => { p.titlesOwned = [...allTitles]; }, no: (p) => { p.titlesOwned = allTitles.slice(1); } },
    {
      id: 'win_with_title',
      yes: (p) => { p.stats.winsWithTitle = 1; },
      // 佩戴中但从未「戴着赢过」：读账不读当前佩戴态
      no: (p) => { p.titlesOwned = ['swift']; equipTitle(p, 'swift'); },
    },
    {
      id: 'sticker_all',
      yes: (p) => { p.stats.stickersUsed = Object.fromEntries(STICKERS.map((s) => [s.id, 1])); },
      no: (p) => {
        p.stats.stickersUsed = Object.fromEntries(STICKERS.slice(1).map((s) => [s.id, 1]));
      },
    },
    { id: 'whale', yes: (p) => { p.stats.boughtHearts = 1; } },
    { id: 'night_owl', yes: (p) => { p.stats.lateNightDuels = 1; } },
    { id: 'last_heart', yes: (p) => { p.stats.winsWithHeartOne = 1; } },
    { id: 'comeback', yes: (p) => { p.stats.comebackWins = 1; } },
    { id: 'bloodline', yes: (p) => { p.stats.personaWinStreak = { wangyou: 5 }; }, no: (p) => { p.stats.personaWinStreak = { wangyou: 4 }; } },
    { id: 'demo_win', yes: (p) => { p.stats.demoWins = 1; } },
    {
      id: 'dex_full',
      yes: (p) => { p.stats.personaWins = Object.fromEntries(PERSONAS.map((x) => [x.id, 1])); },
      no: (p) => {
        p.stats.personaWins = Object.fromEntries(PERSONAS.slice(1).map((x) => [x.id, 1]));
      },
    },
  ];
  for (const { id, yes, no } of CASES) {
    const def = ACHIEVEMENTS.find((d) => d.id === id);
    if (!def) fail(`[${section}] 缺成就定义：${id}`);
    if (yes) {
      const pYes = defaultProfile();
      const ctxYes = { ...CTX0 };
      yes(pYes, ctxYes);
      ok(evaluateAchievements(pYes, ctxYes).some((d) => d.id === id), `${def.name} 达标触发`);
    }
    if (no) {
      const pNo = defaultProfile();
      const ctxNo = { ...CTX0 };
      no(pNo, ctxNo);
      ok(!evaluateAchievements(pNo, ctxNo).some((d) => d.id === id), `${def.name} 不达标不触发`);
    } else {
      ok(!evaluateAchievements(defaultProfile(), { ...CTX0 }).some((d) => d.id === id), `${def.name} 默认档不触发`);
    }
  }

  /* 批量并发 + 幂等（真实全表） */
  const multi = defaultProfile();
  multi.stats.wins = 30;
  multi.stats.softspotHitsBest = 3;
  const pending = evaluateAchievements(multi, CTX0);
  for (const want of ['first_win', 'ten_wins', 'thirty_wins', 'softspot_master']) {
    ok(pending.some((d) => d.id === want), `并发扫描含 ${want}`);
  }
  applyAchievements(multi, pending);
  const afterFirst = multi.coins;
  ok(afterFirst > 0, '批量发币入账');
  applyAchievements(multi, pending);
  eq(multi.coins, afterFirst, '重复 apply 不重复发币（幂等）');
  eq(pending.find((d) => d.id === 'thirty_wins')?.coins, ECONOMY.ACHIEVEMENT_COINS.silver, '银档 100 币');

  /* 成就称号入册（甲方收割机） */
  const dealWinner = defaultProfile();
  dealWinner.cleared.deal = roomFull('deal');
  applyAchievements(dealWinner, evaluateAchievements(dealWinner, CTX0));
  ok(dealWinner.titlesOwned.includes('jiafang-harvester'), '成就称号入册 titlesOwned');
  eq(dealWinner.equippedTitle, null, '入册不等于佩戴');
}

/* ============ 15b. grantBattle 新记账（M4 stats 扩展） ============ */
section = '成就记账';
{
  const sd = defaultProfile();
  grantBattle(sd, battle({ duelId: 's1', outcome: 'win', selfDestructs: 2 }));
  eq(sd.stats.selfDestructWins, 1, '自爆两次仍胜记账');
  grantBattle(sd, battle({ duelId: 's2', outcome: 'lose', selfDestructs: 2 }));
  eq(sd.stats.selfDestructWins, 1, '败局不记自爆胜');

  const fr = defaultProfile();
  grantBattle(fr, battle({ duelId: 'f1', outcome: 'win', rounds: 7 }));
  eq(fr.stats.fullRoundWins, 0, '7 回合胜不算满员局');
  grantBattle(fr, battle({ duelId: 'f2', outcome: 'win', rounds: 8 }));
  eq(fr.stats.fullRoundWins, 1, '8 回合胜记账');
  grantBattle(fr, battle({ duelId: 'f3', outcome: 'lose', rounds: 8 }));
  eq(fr.stats.fullRoundWins, 1, '败局不算');

  const wt = defaultProfile();
  wt.titlesOwned = ['swift'];
  grantBattle(wt, battle({ duelId: 'w1' }));
  eq(wt.stats.winsWithTitle, 0, '入册未佩戴的胜局不记');
  equipTitle(wt, 'swift');
  grantBattle(wt, battle({ duelId: 'w2' }));
  eq(wt.stats.winsWithTitle, 1, '佩戴称号胜局记账');

  const cb = defaultProfile();
  for (const id of ['c1', 'c2', 'c3']) grantBattle(cb, battle({ duelId: id, outcome: 'lose' }));
  grantBattle(cb, battle({ duelId: 'c4' }));
  eq(cb.stats.comebackWins, 1, '三连败后获胜记账');
  const cb2 = defaultProfile();
  grantBattle(cb2, battle({ duelId: 'n1' }));
  for (const id of ['n2', 'n3']) grantBattle(cb2, battle({ duelId: id, outcome: 'lose' }));
  grantBattle(cb2, battle({ duelId: 'n4' }));
  eq(cb2.stats.comebackWins, 0, '两连败后获胜不算反弹');

  const dm = defaultProfile();
  grantBattle(dm, battle({ duelId: 'dm1' }));
  eq(dm.stats.demoWins, 0, '普通胜不记演示局');
  dm.demoMode = true;
  grantBattle(dm, battle({ duelId: 'dm2' }));
  eq(dm.stats.demoWins, 1, '演示模式胜记账');

  const bl = defaultProfile();
  for (let i = 0; i < 5; i += 1) grantBattle(bl, battle({ duelId: `bl${i}` }));
  eq(bl.stats.personaWinStreak.wangyou, 5, '同人五连胜累计');
  ok(bl.achievements.bloodline > 0, '血脉压制随第五胜经扫描解锁');

  const ph = defaultProfile();
  const phSettle = grantBattle(ph, battle({ duelId: 'ph1', selfDestructs: 2 }));
  ok(phSettle.newAchievements.some((d) => d.id === 'phoenix'), '向死而生随结算一并发放');

  const os = defaultProfile();
  const osSettle = grantBattle(os, battle({ duelId: 'os1', roomId: 'gang', levelIndex: 0 }));
  ok(osSettle.newAchievements.some((d) => d.id === 'one_shot'), '一鼓作气随结算一并发放');
}

console.log('\n✓ profile-check 全绿');
