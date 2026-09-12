/**
 * 3.0 成就登记表（数据层）：36 条，六类 × 6（总方案 §5.3）。
 *
 * 每条 = { id, name, desc, group, tier, coins, hearts?, title?, hidden?, check(p, ctx) }。
 * check 必须是纯读谓词（禁副作用），条件涉及外部计数的从 ctx 取
 * （buildCtx() 现查 favoritesCount / notesCount，不落 profile）。
 * v1 全部只发币，hearts 字段保留不填（总方案 §4.2「部分成就送心」暂缓）。
 * group 只是成就墙的分区展示提示；新增成就只加表行，UI / 引擎零改动。
 */
import { ladderFor } from '../lib/ladder.js';
import { ALL_TITLES } from './titles.js';
import { PERSONAS } from './personas.js';
import { SCENES } from './comebacks.js';
import { STICKERS } from './stickers.js';

/** 房间全通关：梯子为空的房（人设未上架）永远不算通关。 */
function roomCleared(profile, roomId) {
  const ladder = ladderFor(roomId);
  if (!ladder.length) return false;
  const cleared = profile.cleared?.[roomId];
  return Array.isArray(cleared) && ladder.every((_, i) => cleared.includes(i));
}

/** 任一关「首次挑战即通关」：通关账里存在 attempts===1 的关卡。 */
function firstTryClear(profile) {
  const attempts = profile.stats.levelAttempts ?? {};
  for (const [key, count] of Object.entries(attempts)) {
    if (count !== 1) continue;
    const cut = key.indexOf(':');
    const cleared = profile.cleared?.[key.slice(0, cut)];
    if (Array.isArray(cleared) && cleared.includes(Number(key.slice(cut + 1)))) return true;
  }
  return false;
}

export const ACHIEVEMENTS = [
  /* ---- 对线 ---- */
  {
    id: 'first_win', name: '初出茅庐', desc: '赢下第一场对线',
    group: '对线', tier: 'bronze', coins: 50,
    check: (p) => p.stats.wins >= 1,
  },
  {
    id: 'ten_wins', name: '嘴上功夫', desc: '累计赢下 10 场对线',
    group: '对线', tier: 'bronze', coins: 50,
    check: (p) => p.stats.wins >= 10,
  },
  {
    id: 'thirty_wins', name: '舌灿莲花', desc: '累计赢下 30 场对线',
    group: '对线', tier: 'silver', coins: 100,
    check: (p) => p.stats.wins >= 30,
  },
  {
    id: 'softspot_master', name: '直击要害', desc: '单局命中 3 个不同软肋',
    group: '对线', tier: 'bronze', coins: 50,
    check: (p) => p.stats.softspotHitsBest >= 3,
  },
  {
    id: 'phoenix', name: '向死而生', desc: '自爆两次仍然获胜',
    group: '对线', tier: 'gold', coins: 200,
    check: (p) => p.stats.selfDestructWins >= 1,
  },
  {
    id: 'full_battle', name: '绝地翻盘', desc: '打满 8 回合并获胜',
    group: '对线', tier: 'silver', coins: 100,
    check: (p) => p.stats.fullRoundWins >= 1,
  },

  /* ---- 战役 ---- */
  {
    id: 'gang_clear', name: '杠中杠', desc: '杠精房全部通关',
    group: '战役', tier: 'gold', coins: 200,
    check: (p) => roomCleared(p, 'gang'),
  },
  {
    id: 'deal_clear', name: '甲方收割机', desc: '谈判房全部通关',
    group: '战役', tier: 'gold', coins: 200, title: 'jiafang-harvester',
    check: (p) => roomCleared(p, 'deal'),
  },
  {
    id: 'eq_clear', name: '灭火专家', desc: '情商房全部通关',
    group: '战役', tier: 'gold', coins: 200,
    check: (p) => roomCleared(p, 'eq'),
  },
  {
    id: 'all_clear', name: '嘴强王者', desc: '三间房全部通关',
    group: '战役', tier: 'king', coins: 300,
    check: (p) => roomCleared(p, 'gang') && roomCleared(p, 'deal') && roomCleared(p, 'eq'),
  },
  {
    id: 'one_shot', name: '一鼓作气', desc: '任一关卡首次挑战即通关',
    group: '战役', tier: 'silver', coins: 100,
    check: (p) => firstTryClear(p),
  },
  {
    id: 'replay_10', name: '温故知新', desc: '复刷关卡并再胜 10 次',
    group: '战役', tier: 'bronze', coins: 50,
    check: (p) => p.stats.replayWins >= 10,
  },

  /* ---- 资料库 ---- */
  {
    id: 'first_fav', name: '淘到好货', desc: '收藏第一条话术',
    group: '资料库', tier: 'bronze', coins: 50,
    check: (_p, ctx) => ctx.favoritesCount >= 1,
  },
  {
    id: 'fav_10', name: '剪报家', desc: '收藏 10 条话术',
    group: '资料库', tier: 'bronze', coins: 50,
    check: (_p, ctx) => ctx.favoritesCount >= 10,
  },
  {
    id: 'fav_30', name: '话术富翁', desc: '收藏 30 条话术',
    group: '资料库', tier: 'silver', coins: 100,
    check: (_p, ctx) => ctx.favoritesCount >= 30,
  },
  {
    id: 'first_note', name: '落笔为强', desc: '写下第一条笔记',
    group: '资料库', tier: 'bronze', coins: 50,
    check: (_p, ctx) => ctx.notesCount >= 1,
  },
  {
    id: 'note_10', name: '著书立说', desc: '写下 10 条笔记',
    group: '资料库', tier: 'silver', coins: 100,
    check: (_p, ctx) => ctx.notesCount >= 10,
  },
  {
    id: 'read_all', name: '博览群书', desc: '浏览过资料库全部 8 个场景',
    group: '资料库', tier: 'bronze', coins: 50,
    check: (p) => SCENES.every((s) => p.stats.scenesViewed?.includes(s.id)),
  },

  /* ---- 擂台 ---- */
  {
    id: 'arena_first', name: '开擂', desc: '完成首场好友擂台',
    group: '擂台', tier: 'bronze', coins: 50,
    check: (p) => p.stats.arenaPlays >= 1,
  },
  {
    id: 'arena_win', name: '擂主', desc: '赢下一场好友擂台',
    group: '擂台', tier: 'silver', coins: 100,
    check: (p) => p.stats.arenaWins >= 1,
  },
  {
    id: 'arena_win_3', name: '三连擂主', desc: '好友擂台累计 3 胜',
    group: '擂台', tier: 'gold', coins: 200,
    check: (p) => p.stats.arenaWins >= 3,
  },
  {
    id: 'arena_high', name: '高光时刻', desc: '擂台单回合拿下 9 分以上',
    group: '擂台', tier: 'silver', coins: 100,
    check: (p) => p.stats.arenaBestRound >= 9,
  },
  {
    id: 'arena_ai', name: '听君一席话', desc: '生成一次 AI 终盘复盘',
    group: '擂台', tier: 'bronze', coins: 50,
    check: (p) => p.stats.arenaRecaps >= 1,
  },
  {
    id: 'arena_3', name: '常规操作', desc: '完成 3 场好友擂台',
    group: '擂台', tier: 'bronze', coins: 50,
    check: (p) => p.stats.arenaPlays >= 3,
  },

  /* ---- 收集 ---- */
  {
    id: 'title_3', name: '崭露头角', desc: '收集 3 枚称号',
    group: '收集', tier: 'bronze', coins: 50,
    check: (p) => p.titlesOwned.length >= 3,
  },
  {
    id: 'title_8', name: '名号响亮', desc: '收集 8 枚称号',
    group: '收集', tier: 'silver', coins: 100,
    check: (p) => p.titlesOwned.length >= 8,
  },
  {
    id: 'title_all', name: '名满天下', desc: `集齐全部 ${ALL_TITLES.length} 枚称号`,
    group: '收集', tier: 'gold', coins: 200,
    check: (p) => p.titlesOwned.length >= ALL_TITLES.length,
  },
  {
    id: 'win_with_title', name: '盛装出席', desc: '佩戴称号赢下一局',
    group: '收集', tier: 'bronze', coins: 50,
    check: (p) => p.stats.winsWithTitle >= 1,
  },
  {
    id: 'sticker_all', name: '斗图达人', desc: '12 种表情包各用过一次',
    group: '收集', tier: 'silver', coins: 100,
    check: (p) => STICKERS.every((s) => (p.stats.stickersUsed?.[s.id] ?? 0) >= 1),
  },
  {
    id: 'whale', name: '氪金玩家', desc: '花金币买过一颗心',
    group: '收集', tier: 'bronze', coins: 50,
    check: (p) => p.stats.boughtHearts >= 1,
  },

  /* ---- 隐藏 ---- */
  {
    id: 'night_owl', name: '夜猫子', desc: '在 0 点到 5 点之间完成一场对局',
    group: '隐藏', tier: 'silver', coins: 100, hidden: true,
    check: (p) => p.stats.lateNightDuels >= 1,
  },
  {
    id: 'last_heart', name: '背水一战', desc: '只剩最后一颗心时赢下一局',
    group: '隐藏', tier: 'gold', coins: 200, hidden: true,
    check: (p) => p.stats.winsWithHeartOne >= 1,
  },
  {
    id: 'comeback', name: '触底反弹', desc: '连败三场后赢下下一局',
    group: '隐藏', tier: 'silver', coins: 100, hidden: true,
    check: (p) => p.stats.comebackWins >= 1,
  },
  {
    id: 'bloodline', name: '血脉压制', desc: '对同一人设连赢 5 次',
    group: '隐藏', tier: 'silver', coins: 100, hidden: true,
    check: (p) => Object.values(p.stats.personaWinStreak ?? {}).some((n) => n >= 5),
  },
  {
    id: 'demo_win', name: '磨洋工', desc: '开着演示模式赢下一局',
    group: '隐藏', tier: 'bronze', coins: 50, hidden: true,
    check: (p) => p.stats.demoWins >= 1,
  },
  {
    id: 'dex_full', name: '全图鉴', desc: '让每一位对手都输给你一次',
    group: '隐藏', tier: 'king', coins: 300, hidden: true,
    check: (p) => PERSONAS.every((x) => (p.stats.personaWins?.[x.id] ?? 0) >= 1),
  },
];
