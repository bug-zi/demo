/**
 * 玩家成长档案层（3.0）：心池 / 金币 / 经验 / 成就 / 称号。
 *
 * 唯一数据键 gang-ai:profile:v1，防御姿势照抄 settings.js：
 * storage() 守卫 + 全读写 try/catch + 坏数据收敛（schema 版本不符整档重置）。
 * 全部函数就地变异传入的 profile 对象并返回结算信息，落盘由调用方 saveProfile。
 * 经济数值集中在 ECONOMY，调平衡不改逻辑（spec：docs/design/3.0成长系统/archive/designs-specs.md，已落地归档）。
 */
import { loadFavorites, loadNotes } from './notes.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { MAX_ROUNDS } from './duel-engine.js';

const STORAGE_KEY = 'gang-ai:profile:v1';
const SCHEMA_V = 1;
const LEDGER_CAP = 50; // processedDuels 幂等账本封顶（FIFO）
const OUTCOME_WINDOW = 3; // lastOutcomes 保留最近 N 局（触底反弹判定用）

export const ECONOMY = {
  HEARTS_MAX: 5,
  HEART_START: 5,
  HEART_REGEN_MS: 30 * 60 * 1000,
  HEART_PRICE: 50,
  WIN_XP_BASE: 30,
  WIN_XP_PER_DIFF: 10,
  LOSE_XP: 15,
  WIN_COINS_BASE: 50,
  WIN_COINS_PER_DIFF: 20,
  REPLAY_FACTOR: 0.3,
  LEVEL_UP_COINS: 100,
  LEVEL_HEART_EVERY: 5,
  XP_TO_NEXT: (level) => 100 + (level - 1) * 50,
  ACHIEVEMENT_COINS: { bronze: 50, silver: 100, gold: 200, king: 300 },
};

const ROOMS = ['gang', 'deal', 'eq'];

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

const int = (value, lo = 0, hi = Infinity) =>
  Number.isFinite(value) ? Math.min(hi, Math.max(lo, Math.floor(value))) : lo;

const idList = (value, cap = Infinity) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item || out.includes(item)) continue;
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
};

const intMap = (value) => {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [key, num] of Object.entries(value)) {
    if (typeof key === 'string' && key) out[key] = int(num);
  }
  return out;
};

function defaultStats() {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    maxStreak: 0,
    lastOutcomes: [],
    softspotHitsBest: 0,
    fireWins: 0,
    eqWins: 0,
    personaWins: {},
    personaWinStreak: {},
    replayWins: 0,
    levelAttempts: {},
    stickersUsed: {},
    boughtHearts: 0,
    lateNightDuels: 0,
    winsWithHeartOne: 0,
    selfDestructWins: 0,
    fullRoundWins: 0,
    winsWithTitle: 0,
    comebackWins: 0,
    demoWins: 0,
    arenaPlays: 0,
    arenaWins: 0,
    arenaBestRound: 0,
    arenaRecaps: 0,
    scenesViewed: [],
  };
}

export function defaultProfile() {
  return {
    v: SCHEMA_V,
    xp: 0,
    level: 1,
    coins: 0,
    hearts: ECONOMY.HEART_START,
    lastRegenAt: Date.now(),
    cleared: { gang: [], deal: [], eq: [] },
    achievements: {},
    titlesOwned: [],
    equippedTitle: null,
    demoMode: false,
    stats: defaultStats(),
    processedDuels: [],
  };
}

/** 不管读进来的是什么，都收敛成一份干净、可信的档案。 */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== SCHEMA_V) return defaultProfile();
  const statsRaw = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const clearedRaw = raw.cleared && typeof raw.cleared === 'object' ? raw.cleared : {};
  const cleared = {};
  for (const room of ROOMS) {
    const arr = Array.isArray(clearedRaw[room]) ? clearedRaw[room] : [];
    cleared[room] = [...new Set(arr.map((n) => int(n, 0, 99)))].sort((a, b) => a - b);
  }
  const achievements = {};
  if (raw.achievements && typeof raw.achievements === 'object') {
    for (const [id, ts] of Object.entries(raw.achievements)) {
      if (typeof id === 'string' && id && Number.isFinite(ts)) achievements[id] = ts;
    }
  }
  const titlesOwned = idList(raw.titlesOwned);
  const stats = {
    ...defaultStats(),
    wins: int(statsRaw.wins),
    losses: int(statsRaw.losses),
    draws: int(statsRaw.draws),
    streak: int(statsRaw.streak),
    maxStreak: int(statsRaw.maxStreak),
    lastOutcomes: (Array.isArray(statsRaw.lastOutcomes) ? statsRaw.lastOutcomes : [])
      .filter((x) => x === 'win' || x === 'lose')
      .slice(-OUTCOME_WINDOW),
    softspotHitsBest: int(statsRaw.softspotHitsBest),
    fireWins: int(statsRaw.fireWins),
    eqWins: int(statsRaw.eqWins),
    personaWins: intMap(statsRaw.personaWins),
    personaWinStreak: intMap(statsRaw.personaWinStreak),
    replayWins: int(statsRaw.replayWins),
    levelAttempts: intMap(statsRaw.levelAttempts),
    stickersUsed: intMap(statsRaw.stickersUsed),
    boughtHearts: int(statsRaw.boughtHearts),
    lateNightDuels: int(statsRaw.lateNightDuels),
    winsWithHeartOne: int(statsRaw.winsWithHeartOne),
    selfDestructWins: int(statsRaw.selfDestructWins),
    fullRoundWins: int(statsRaw.fullRoundWins),
    winsWithTitle: int(statsRaw.winsWithTitle),
    comebackWins: int(statsRaw.comebackWins),
    demoWins: int(statsRaw.demoWins),
    arenaPlays: int(statsRaw.arenaPlays),
    arenaWins: int(statsRaw.arenaWins),
    arenaBestRound: int(statsRaw.arenaBestRound, 0, 100),
    arenaRecaps: int(statsRaw.arenaRecaps),
    scenesViewed: idList(statsRaw.scenesViewed),
  };
  return {
    v: SCHEMA_V,
    xp: int(raw.xp),
    level: int(raw.level, 1, 9999),
    coins: int(raw.coins),
    hearts: Number.isFinite(raw.hearts) ? int(raw.hearts, 0, ECONOMY.HEARTS_MAX) : ECONOMY.HEART_START,
    lastRegenAt: Number.isFinite(raw.lastRegenAt) ? raw.lastRegenAt : Date.now(),
    cleared,
    achievements,
    titlesOwned,
    equippedTitle: typeof raw.equippedTitle === 'string' && titlesOwned.includes(raw.equippedTitle)
      ? raw.equippedTitle
      : null,
    demoMode: raw.demoMode === true,
    stats,
    processedDuels: idList(raw.processedDuels, LEDGER_CAP).slice(-LEDGER_CAP),
  };
}

export function loadProfile() {
  const store = storage();
  if (!store) return defaultProfile();
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('[嘴强王者] 成长档案读不出来，按新档处理：', err?.message || err);
    return defaultProfile();
  }
}

/** @returns 实际落盘的那份（可能被 sanitize 过） */
export function saveProfile(profile) {
  const clean = sanitize(profile && typeof profile === 'object' ? profile : {});
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (err) {
      console.warn('[嘴强王者] 成长档案存不进去：', err?.message || err);
    }
  }
  return clean;
}

/**
 * 惰性结算自然恢复：读档时算，不挂后台定时器，离线也在回心。
 * 满血时把记账起点拨到当前时刻，避免打开瞬间到账一笔陈年余数。
 */
export function tickHearts(profile, now = Date.now()) {
  if (profile.hearts >= ECONOMY.HEARTS_MAX) {
    profile.lastRegenAt = now;
    return;
  }
  const elapsed = Math.max(0, now - profile.lastRegenAt);
  const gained = Math.min(
    ECONOMY.HEARTS_MAX - profile.hearts,
    Math.floor(elapsed / ECONOMY.HEART_REGEN_MS),
  );
  if (gained > 0) {
    profile.hearts += gained;
    profile.lastRegenAt += gained * ECONOMY.HEART_REGEN_MS;
  }
  if (profile.hearts >= ECONOMY.HEARTS_MAX) profile.lastRegenAt = now;
}

/** 下一颗自然恢复的心还差多少毫秒；满心为 0。 */
export function heartsRegenEta(profile, now = Date.now()) {
  if (profile.hearts >= ECONOMY.HEARTS_MAX) return 0;
  const elapsed = Math.max(0, now - profile.lastRegenAt);
  return Math.max(0, ECONOMY.HEART_REGEN_MS - (elapsed % ECONOMY.HEART_REGEN_MS));
}

export function canBattle(profile) {
  return profile.demoMode === true || profile.hearts > 0;
}

/** 资料库/擂台成就用的外部计数，现场只读现查，不落 profile。 */
export function buildCtx() {
  return {
    favoritesCount: loadFavorites().length,
    notesCount: loadNotes().length,
  };
}

/**
 * 纯扫描：返回条件成立且尚未解锁的成就定义。check 抛错视作未达成，不炸主流程。
 * @param {object} profile
 * @param {object} [ctx] 外部计数（缺省现场 buildCtx）
 * @param {Array} [table] 成就表（缺省全表；测试可注入小表）
 */
export function evaluateAchievements(profile, ctx = buildCtx(), table = ACHIEVEMENTS) {
  const pending = [];
  for (const def of table) {
    if (!def || typeof def.id !== 'string' || !def.id) continue;
    if (profile.achievements[def.id]) continue;
    let reached = false;
    try {
      reached = def.check(profile, ctx) === true;
    } catch {
      reached = false;
    }
    if (reached) pending.push(def);
  }
  return pending;
}

/** 与 evaluate 成对用：盖章 + 发奖（币/心/称号），重复传入不重复发。返回实际入账的定义。 */
export function applyAchievements(profile, defs) {
  const applied = [];
  let coins = 0;
  let hearts = 0;
  for (const def of Array.isArray(defs) ? defs : []) {
    if (!def || typeof def.id !== 'string' || !def.id || profile.achievements[def.id]) continue;
    profile.achievements[def.id] = Date.now();
    coins += Number.isFinite(def.coins)
      ? Math.max(0, Math.floor(def.coins))
      : ECONOMY.ACHIEVEMENT_COINS[def.tier] ?? 0;
    if (Number.isFinite(def.hearts) && def.hearts > 0 && profile.hearts < ECONOMY.HEARTS_MAX) {
      profile.hearts += 1;
      hearts += 1;
    }
    if (typeof def.title === 'string' && def.title && !profile.titlesOwned.includes(def.title)) {
      profile.titlesOwned.push(def.title);
    }
    applied.push(def);
  }
  profile.coins += coins;
  return applied;
}

/** 称号佩戴：只有已入册的称号能戴上；传 null 摘下。 */
export function equipTitle(profile, titleId) {
  if (titleId === null) {
    profile.equippedTitle = null;
    return true;
  }
  if (typeof titleId !== 'string' || !profile.titlesOwned.includes(titleId)) return false;
  profile.equippedTitle = titleId;
  return true;
}

/**
 * 战斗结算（唯一入账口）。幂等：同 duelId 重放返回零值。
 * M1 简化期 isReplay/roomId/levelIndex 可不传（一律按首通、不写通关账），M2 接梯子后传真实值。
 * @param {object} profile 就地变异
 * @param {{duelId:string, outcome:'win'|'lose'|'draw', difficulty:number, mode?:string,
 *          personaId?:string, ts?:number, stickerIds?:string[], softspotHitKinds?:string[],
 *          isReplay?:boolean, roomId?:string, levelIndex?:number}} ev
 */
export function grantBattle(profile, ev) {
  const zero = {
    xp: 0,
    coins: 0,
    heartsDelta: 0,
    levelUps: [],
    heartFromLevelUp: 0,
    newAchievements: [],
    firstClear: false,
    idempotent: true,
  };
  const duelId = typeof ev?.duelId === 'string' && ev.duelId ? ev.duelId : null;
  if (!duelId || profile.processedDuels.includes(duelId)) return { ...zero };

  const outcome = ev.outcome === 'win' || ev.outcome === 'lose' || ev.outcome === 'draw' ? ev.outcome : 'draw';
  const difficulty = Math.min(5, Math.max(1, Math.floor(Number(ev.difficulty) || 1)));
  const ts = Number.isFinite(ev.ts) ? ev.ts : Date.now();
  const heartsBefore = profile.hearts;

  let xp = 0;
  let coins = 0;
  let heartsDelta = 0;
  if (outcome === 'win') {
    xp = ECONOMY.WIN_XP_BASE + ECONOMY.WIN_XP_PER_DIFF * difficulty;
    const full = ECONOMY.WIN_COINS_BASE + ECONOMY.WIN_COINS_PER_DIFF * difficulty;
    coins = ev.isReplay ? Math.floor(full * ECONOMY.REPLAY_FACTOR) : full;
  } else {
    xp = ECONOMY.LOSE_XP; // 负局/和局安慰经验
  }
  if (outcome === 'lose' && profile.demoMode !== true) {
    heartsDelta = heartsBefore > 0 ? -1 : 0;
    profile.hearts = Math.max(0, profile.hearts - 1);
  }

  profile.coins += coins;
  profile.xp += xp;
  const levelUps = [];
  let heartFromLevelUp = 0;
  while (profile.xp >= ECONOMY.XP_TO_NEXT(profile.level)) {
    profile.xp -= ECONOMY.XP_TO_NEXT(profile.level);
    profile.level += 1;
    profile.coins += ECONOMY.LEVEL_UP_COINS;
    levelUps.push(profile.level);
    if (profile.level % ECONOMY.LEVEL_HEART_EVERY === 0 && profile.hearts < ECONOMY.HEARTS_MAX) {
      profile.hearts += 1;
      heartFromLevelUp += 1;
    }
  }

  const st = profile.stats;
  // 触底反弹要在本局结果写进 lastOutcomes 之前判定
  const comebackReady =
    outcome === 'win' &&
    st.lastOutcomes.length === OUTCOME_WINDOW &&
    st.lastOutcomes.every((x) => x === 'lose');
  if (outcome === 'win') {
    st.wins += 1;
    st.streak += 1;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
    if (ev.mode === 'extinguish') st.eqWins += 1;
    else if (ev.mode === 'fire') st.fireWins += 1;
    if (ev.isReplay) st.replayWins += 1;
    if (heartsBefore === 1) st.winsWithHeartOne += 1;
    if (int(ev.selfDestructs) >= 2) st.selfDestructWins += 1;
    if (Math.floor(Number(ev.rounds) || 0) >= MAX_ROUNDS) st.fullRoundWins += 1;
    if (profile.equippedTitle) st.winsWithTitle += 1;
    if (profile.demoMode === true) st.demoWins += 1;
    if (comebackReady) st.comebackWins += 1;
  } else if (outcome === 'lose') {
    st.losses += 1;
    st.streak = 0;
  } else {
    st.draws += 1;
  }
  if (outcome === 'win' || outcome === 'lose') {
    st.lastOutcomes.push(outcome);
    st.lastOutcomes = st.lastOutcomes.slice(-OUTCOME_WINDOW);
  }
  const personaId = typeof ev.personaId === 'string' ? ev.personaId : '';
  if (personaId) {
    if (outcome === 'win') {
      st.personaWins[personaId] = (st.personaWins[personaId] ?? 0) + 1;
      st.personaWinStreak[personaId] = (st.personaWinStreak[personaId] ?? 0) + 1;
    } else if (outcome === 'lose') {
      st.personaWinStreak[personaId] = 0;
    }
  }
  if (typeof ev.roomId === 'string' && ev.roomId && Number.isInteger(ev.levelIndex) && ev.levelIndex >= 0) {
    const key = `${ev.roomId}:${ev.levelIndex}`;
    st.levelAttempts[key] = (st.levelAttempts[key] ?? 0) + 1;
  }
  // 通关账（M2 闯关梯）：胜局且携带合法关卡坐标才写，重复通关去重
  if (
    outcome === 'win' &&
    ROOMS.includes(ev.roomId) &&
    Number.isInteger(ev.levelIndex) &&
    ev.levelIndex >= 0 &&
    !profile.cleared[ev.roomId].includes(ev.levelIndex)
  ) {
    profile.cleared[ev.roomId].push(ev.levelIndex);
  }
  for (const id of Array.isArray(ev.stickerIds) ? ev.stickerIds : []) {
    if (typeof id === 'string' && id) st.stickersUsed[id] = (st.stickersUsed[id] ?? 0) + 1;
  }
  const softspotKinds = new Set(
    (Array.isArray(ev.softspotHitKinds) ? ev.softspotHitKinds : []).filter(
      (k) => typeof k === 'string' && k,
    ),
  );
  if (softspotKinds.size > st.softspotHitsBest) st.softspotHitsBest = softspotKinds.size;
  const hour = new Date(ts).getHours();
  if (hour >= 0 && hour < 5) st.lateNightDuels += 1;

  profile.processedDuels.push(duelId);
  profile.processedDuels = profile.processedDuels.slice(-LEDGER_CAP);

  const newAchievements = applyAchievements(profile, evaluateAchievements(profile));
  return {
    xp,
    coins,
    heartsDelta,
    levelUps,
    heartFromLevelUp,
    newAchievements,
    firstClear: outcome === 'win' && !ev.isReplay,
    idempotent: false,
  };
}

/** @returns {'ok'|'no_coins'|'full'} */
export function buyHeart(profile) {
  if (profile.hearts >= ECONOMY.HEARTS_MAX) return 'full';
  if (profile.coins < ECONOMY.HEART_PRICE) return 'no_coins';
  profile.coins -= ECONOMY.HEART_PRICE;
  profile.hearts += 1;
  profile.stats.boughtHearts += 1;
  applyAchievements(profile, evaluateAchievements(profile));
  return 'ok';
}

/** 擂台终盘入账（由 arena 视图层回调，引擎与评分零改动）。 */
export function grantArena(profile, ev) {
  const st = profile.stats;
  st.arenaPlays += 1;
  if (ev?.win) st.arenaWins += 1;
  const best = Number(ev?.bestRound);
  if (Number.isFinite(best)) st.arenaBestRound = Math.max(st.arenaBestRound, Math.floor(best));
  if (ev?.recap) st.arenaRecaps += 1;
  return applyAchievements(profile, evaluateAchievements(profile));
}
