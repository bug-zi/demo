/**
 * 对局选项：回合时限。存在 localStorage 里，键 gang-ai:round-seconds:v1。
 *
 * 0 = 不限时（默认）。防御姿势照抄 settings.js：纯 node（scripts/smoke.mjs）
 * 也会 import 这条链，localStorage 不存在时必须安静地返回默认值；
 * 无痕模式读写抛异常一律 try/catch；读进来的值不在档位里就收敛到 0。
 */

const STORAGE_KEY = 'gang-ai:round-seconds:v1';

/** 设置弹窗「对局」区的四档；0 = 不限时。 */
export const ROUND_SECONDS_OPTIONS = [
  { value: 0, label: '不限时' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

const ALLOWED = ROUND_SECONDS_OPTIONS.map((option) => option.value);

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sanitize(value) {
  const n = Number(value);
  return ALLOWED.includes(n) ? n : 0;
}

export function loadRoundSeconds() {
  const store = storage();
  if (!store) return 0;
  try {
    return sanitize(store.getItem(STORAGE_KEY));
  } catch (err) {
    console.warn('[嘴强王者] 回合时限读不出来，按不限时处理：', err?.message || err);
    return 0;
  }
}

/** @returns 实际落盘的那一档（非法值收敛到 0） */
export function saveRoundSeconds(value) {
  const clean = sanitize(value);
  const store = storage();
  if (!store) return clean;
  try {
    store.setItem(STORAGE_KEY, String(clean));
  } catch (err) {
    console.warn('[嘴强王者] 回合时限存不进去：', err?.message || err);
  }
  return clean;
}
