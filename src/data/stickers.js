/**
 * 表情包（大号 emoji 贴纸）登记表。
 *
 * 一张贴纸 = 大 emoji + 吐槽小字 + 固定小增量（fire 方向定义）：
 * - 玩家发送：走正常输入框（emoji 字符随文字一起），submit 时由 matchSticker 剥离；
 *   纯贴纸（净文本为空）按 hitType 'sticker' 结算。
 * - delta 上限 ±8：贴纸是调味不是连胜捷径——引擎侧还有全局递减兜底（见 duel-engine.js）。
 * - 求和向负 delta 在杠精房是喜剧负收益（对方觉得你怂了）；
 *   灭火局里一切增量整体翻方向，与 softspot/hit 同一套哲学。
 */

export const STICKERS = [
  { id: 'smug', emoji: '😤', label: '就这？', delta: 8 },
  { id: 'eyeroll', emoji: '🙄', label: '就嗯嗯哦哦呗', delta: 6 },
  { id: 'clown', emoji: '🤡', label: '小丑竟是你自己', delta: 8 },
  { id: 'skull', emoji: '💀', label: '笑不活了', delta: 7 },
  { id: 'tea', emoji: '🍵', label: '茶香四溢', delta: 6 },
  { id: 'clap', emoji: '👏', label: '阴阳掌声', delta: 7 },
  { id: 'point', emoji: '👉', label: '说你呢', delta: 6 },
  { id: 'horse', emoji: '🐴', label: '牛马互认', delta: 5 },
  { id: 'salute', emoji: '🫡', label: '敷衍敬礼', delta: 4 },
  { id: 'heart', emoji: '🥰', label: '爱你哟（阴阳）', delta: 3 },
  { id: 'rose', emoji: '🌹', label: '赔罪玫瑰', delta: -5 },
  { id: 'handshake', emoji: '🤝', label: '先和解为敬', delta: -6 },
];

/** 远程 AI 的 JSON schema 枚举用：与登记表同序。 */
export const STICKER_IDS = STICKERS.map((s) => s.id);

const byId = new Map(STICKERS.map((s) => [s.id, s]));

/** 按 id 取贴纸；查无此 id 返回 null（远程返回的非法值走这里静默丢弃）。 */
export function stickerById(id) {
  return byId.get(id) ?? null;
}

/**
 * 从原始输入里剥离已注册的贴纸 emoji。
 *
 * 取「字符串位置最靠前」的一张作为本回合贴纸（不是登记表序——玩家排布即意图）；
 * 其余已注册 emoji 一并剥掉，未注册 emoji（玩家自己手打的）原样留在文本里。
 *
 * @returns {{sticker:object|null, text:string}}
 */
export function matchSticker(raw) {
  const text = String(raw || '');
  let sticker = null;
  let at = Infinity;
  for (const s of STICKERS) {
    const i = text.indexOf(s.emoji);
    if (i !== -1 && i < at) {
      at = i;
      sticker = s;
    }
  }
  if (!sticker) return { sticker: null, text };
  let cleaned = text;
  for (const s of STICKERS) cleaned = cleaned.split(s.emoji).join('');
  return { sticker, text: cleaned };
}

/** 本地引擎按怒气阶段发贴纸的概率；玩家先发贴纸时按回敬概率抬一手（斗图要有来有回）。 */
const AI_STICKER_RATE = {
  polite: 0,
  sarcastic: 0.15,
  agitated: 0.3,
  breakdown: 0.45,
};
const REPLY_STICKER_RATE = 0.5;

/** 各阶段的人设无关贴纸池（人设定制等情商房解锁再议）。 */
const AI_STICKER_POOLS = {
  sarcastic: ['eyeroll', 'tea', 'clap', 'heart'],
  agitated: ['smug', 'skull', 'point', 'horse'],
  breakdown: ['clown', 'skull', 'salute', 'smug'],
};

/**
 * 本地引擎这回合回不回贴纸、回哪张。
 *
 * @param {string} stageId 怒气阶段 id（stageOf().id）
 * @param {number} [rand] 随机源，测试注入后可确定化；默认 Math.random()
 * @param {{replyToSticker?:boolean}} [options] 玩家这回合先发了贴纸
 * @returns {object|null} 贴纸对象，不发就是 null
 */
export function pickAiSticker(stageId, rand = Math.random(), { replyToSticker = false } = {}) {
  const base = AI_STICKER_RATE[stageId] ?? 0;
  const p = replyToSticker ? Math.max(base, REPLY_STICKER_RATE) : base;
  if (rand >= p) return null;
  const pool = AI_STICKER_POOLS[stageId] ?? AI_STICKER_POOLS.agitated;
  return stickerById(pool[Math.floor(rand * pool.length) % pool.length]);
}
