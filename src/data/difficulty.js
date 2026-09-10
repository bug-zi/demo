/**
 * 难度 = 每回合给你多少时间组织语言。
 *
 * 注意：难度只改倒计时，不动怒气经济的任何数值（软肋 +28~34 / 有效输出 +12 /
 * 自爆 −12 见 duel-engine.js）。也就是说三个难度的胜负规则完全一样，
 * 变的只有「你有多少时间想出那句戳软肋的话」。
 */

export const DIFFICULTIES = [
  { id: 'nightmare', label: '噩梦', seconds: 30, note: '对面不给面子，也不给你时间。' },
  { id: 'hard', label: '困难', seconds: 45, note: '够想一句狠的，不够想两句。' },
  { id: 'easy', label: '简单', seconds: 60, note: '慢慢组织语言，对面跑不掉。' },
];

export const DEFAULT_DIFFICULTY = 'hard';

export function getDifficulty(id) {
  return (
    DIFFICULTIES.find((d) => d.id === id) ||
    DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY) ||
    DIFFICULTIES[0]
  );
}

export function secondsOf(id) {
  return getDifficulty(id).seconds;
}
