/**
 * 文本小工具。纯函数，不碰 DOM，node 下也能跑（smoke 直接 import）。
 */

/** 每回合输入框的字数上限。一个 emoji 占两个单位，所以别按「字数」跟玩家解释。 */
export const MAX_INPUT = 100;

/**
 * 表情/图形符号的范围。
 *
 * 用得上它的原因：判定的长度启发式只看「多少字」，
 * 而 9 个 emoji 就是 18 个 UTF-16 单元，正好撞上「够长了算有效输出」那条线 ——
 * 白送一次 +12，比打字便宜得多。所以判定前先把表情摘掉。
 */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** 摘掉表情，只留字。 */
export function stripEmoji(text) {
  return String(text ?? '').replace(EMOJI_RE, '');
}

/**
 * 按 UTF-16 长度裁到 max，但不切断代理对。
 *
 * 正好从中间劈开一个 emoji 的话，会留下一个孤立代理项 ——
 * 界面上渲染成一个「�」，看着像我们的 bug。宁可少留一个字符。
 */
export function clip(text, max = MAX_INPUT) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const last = s.charCodeAt(max - 1);
  const splitPair = last >= 0xd800 && last <= 0xdbff;
  return s.slice(0, splitPair ? max - 1 : max);
}
