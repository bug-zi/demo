/** 判定类型的中文标签与飘字，以及通用兜底台词。 */

export const HIT_LABELS = {
  softspot: '扎中软肋',
  hit: '有效输出',
  miss: '无效输出',
  self_destruct: '自爆',
  sticker: '斗图',
};

export const HIT_QUIPS = {
  softspot: '扎心了',
  hit: '有效输出',
  miss: '没接住',
  self_destruct: '自爆',
  sticker: '贴脸开大',
};

/** 灭火局（情商房）版本：软肋的语义是「心结」，自爆的语义是「火上浇油」。 */

export const EQ_HIT_LABELS = {
  softspot: '说到心结',
  hit: '有效安抚',
  miss: '无效输出',
  self_destruct: '火上浇油',
  sticker: '斗图',
};

export const EQ_HIT_QUIPS = {
  softspot: '说到位了',
  hit: '气消一点',
  miss: '没接住',
  self_destruct: '更炸了',
  sticker: '逗 TA 一下',
};

/** 玩家自己上头（骂人 / 语无伦次）时，对手的通用反应。 */
export const SELF_DESTRUCT_REACTIONS = [
  '你急了你急了。',
  '哦，开始骂人了？那就是你说不过了。',
  '你看，说不过就急。',
  '行行行，你继续，我听着。',
  '这就破防了？我还没发力呢。',
];

/** 玩家一句话都懒得说时的占位。 */
export const SILENCE_TEXT = '（沉默）';

/** 本地引擎在完全没词时兜底，保证对线永远不会卡住。 */
export const GENERIC_REPLIES = [
  '……你说这个我就没法接了。',
  '行吧，你继续说。',
  '嗯。',
];

export function pick(list) {
  if (!list || list.length === 0) return pick(GENERIC_REPLIES);
  return list[Math.floor(Math.random() * list.length)];
}
