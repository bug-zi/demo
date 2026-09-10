/**
 * 配色主题：暗色（默认）/ 亮色。
 *
 * 主题只是给 <html> 挂一个 data-theme，具体颜色全在 styles.css 里 ——
 * JS 这边不碰任何色值，加一套新配色只需要往 CSS 里加一段变量覆盖。
 *
 * 和 settings.js 一样，`localStorage` 不存在时（纯 node 跑 smoke）要安静地
 * 返回默认值，读写全部包 try/catch（Safari 无痕会抛）。
 *
 * 注意：index.html 的 <head> 里有一段内联脚本，为了首屏不闪，它会在 CSS
 * 生效前先读一次 storage 并挂上 data-theme。改动 STORAGE_KEY 时两边都要改。
 */

export const STORAGE_KEY = 'gang-ai:theme:v1';

export const THEMES = [
  { id: 'dark', label: '暗色', icon: '🌙' },
  { id: 'light', label: '亮色', icon: '☀️' },
];

export const DEFAULT_THEME = 'dark';

export function normalizeTheme(id) {
  return THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
}

export function findTheme(id) {
  return THEMES.find((t) => t.id === normalizeTheme(id)) || THEMES[0];
}

/** 点一下就换到另一套。 */
export function nextTheme(id) {
  const current = normalizeTheme(id);
  const index = THEMES.findIndex((t) => t.id === current);
  return THEMES[(index + 1) % THEMES.length].id;
}

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadTheme() {
  const store = storage();
  if (!store) return DEFAULT_THEME;
  try {
    return normalizeTheme(store.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id) {
  const theme = normalizeTheme(id);
  const store = storage();
  try {
    store?.setItem(STORAGE_KEY, theme);
  } catch (err) {
    console.warn('[杠精陪练房] 主题存不进去，刷新后会回到默认：', err?.message || err);
  }
  return theme;
}

/** 落到 <html data-theme>。 */
export function applyTheme(id) {
  const theme = normalizeTheme(id);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = theme;
  }
  return theme;
}

/** 开局时用：读出来、应用、并把按钮画好。 */
export function initTheme(button) {
  const theme = applyTheme(loadTheme());
  if (button) paintThemeButton(button, theme);
  return theme;
}

/** 按钮显示的是「点了会变成什么」，不是当前状态 —— 避免看图标猜半天。 */
export function paintThemeButton(button, currentId) {
  if (!button) return;
  const current = findTheme(currentId);
  const target = findTheme(nextTheme(currentId));
  button.textContent = target.icon;
  button.title = `切换到${target.label}主题`;
  button.setAttribute('aria-label', `切换到${target.label}主题（当前${current.label}）`);
}
