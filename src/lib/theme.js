/**
 * 主题（浅色樱花粉 / 深色宝蓝）。
 * 首次访问跟随系统偏好，手动切换后写入 localStorage 记忆。
 * 颜色全部落在 styles.css 的 [data-theme] 令牌里，这里只管状态。
 */

const KEY = 'gang-ai:theme';
const listeners = new Set();

export function getTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // jsdom 没有 matchMedia，别让测试环境炸
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function applyTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  document.documentElement.dataset.theme = theme;
  for (const fn of listeners) fn(theme);
}

export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  localStorage.setItem(KEY, next);
  applyTheme(next);
}

/** 订阅主题变化（订阅时立即回调一次当前值），返回取消订阅函数。 */
export function onTheme(fn) {
  listeners.add(fn);
  fn(getTheme());
  return () => listeners.delete(fn);
}

export function initTheme() {
  applyTheme(getTheme());
}

/* ---------------- 皮肤（与深浅正交，见 docs/draft/260910-皮肤系统设计方案.md） ---------------- */

const SKIN_KEY = 'gang-ai:skin';
const skinListeners = new Set();

export function getSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  return saved === 'midnight' ? 'midnight' : 'blossom';
}

export function applySkin(skin) {
  if (skin !== 'blossom' && skin !== 'midnight') return;
  document.documentElement.dataset.skin = skin;
  for (const fn of skinListeners) fn(skin);
}

export function setSkin(skin) {
  if (skin !== 'blossom' && skin !== 'midnight') return;
  localStorage.setItem(SKIN_KEY, skin);
  applySkin(skin);
}

/** 订阅皮肤变化（订阅时立即回调一次当前值），返回取消订阅函数。 */
export function onSkin(fn) {
  skinListeners.add(fn);
  fn(getSkin());
  return () => skinListeners.delete(fn);
}

export function initSkin() {
  applySkin(getSkin());
}
