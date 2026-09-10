/**
 * 用户自己填的 AI 配置，存在 localStorage 里。
 *
 * 这里刻意不 import 任何 DOM 之外的东西 —— 纯 node（scripts/smoke.mjs）也会
 * import 这条链，所以 `localStorage` 不存在时必须安静地返回默认值。
 * Safari 无痕模式下 localStorage 会抛异常，读写全部包了 try/catch。
 */

const STORAGE_KEY = 'gang-ai:settings:v1';
const PROVIDERS = ['local', 'anthropic', 'openai'];

export const DEFAULT_SETTINGS = {
  provider: 'local',
  apiKey: '',
  model: '',
  baseUrl: '',
};

const str = (value) => String(value ?? '').trim();

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 不管读进来的是什么，都收敛成一份干净、可信的设置。 */
function sanitize(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    provider: PROVIDERS.includes(obj.provider) ? obj.provider : 'local',
    apiKey: str(obj.apiKey),
    model: str(obj.model),
    baseUrl: str(obj.baseUrl),
  };
}

export function loadSettings() {
  const store = storage();
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('[嘴强王者] 本地设置读不出来，按未配置处理：', err?.message || err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** @returns 实际落盘的那份（可能被 sanitize 过） */
export function saveSettings(next) {
  const clean = sanitize(next);
  const store = storage();
  if (!store) return clean;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('[嘴强王者] 本地设置存不进去：', err?.message || err);
  }
  return clean;
}

export function clearSettings() {
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[嘴强王者] 本地设置清不掉：', err?.message || err);
  }
  return { ...DEFAULT_SETTINGS };
}

/** 回填输入框时用，别把整串 key 摆在屏幕上。 */
export function maskKey(key) {
  const value = str(key);
  if (!value) return '';
  if (value.length <= 10) return '•'.repeat(value.length);
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
