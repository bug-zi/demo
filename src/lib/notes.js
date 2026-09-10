/**
 * 收藏与自建笔记的存储层（话术资料库）。
 *
 * 防御姿势照抄 settings.js：storage() 守卫 + 全读写 try/catch + 坏数据收敛。
 * 纯函数（toggle/upsert/delete）与落盘分离，scripts/library-check.mjs 可在 Node 直测。
 * 日志前缀用 [话术资料库]，别用应用名——改名浪潮（2.0 只动展示层）不波及这里。
 */
import { SCENES, TYPES } from '../data/comebacks.js';

const FAV_KEY = 'gang-ai:favorites:v1';
const NOTES_KEY = 'gang-ai:notes:v1';

const SCENE_IDS = new Set(SCENES.map((s) => s.id));
const TYPE_IDS = new Set(TYPES.map((t) => t.id));

const str = (value) => (typeof value === 'string' ? value.trim() : '');

function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function mintId() {
  return `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 单条笔记收敛：schema 不合格直接丢弃（返回 null），坏一条不坏一库。 */
function sanitizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id);
  const text = str(raw.text);
  if (!id || !text) return null;
  if (!SCENE_IDS.has(raw.scene) || !TYPE_IDS.has(raw.type)) return null;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(str).filter(Boolean) : [];
  return { id, text, scene: raw.scene, type: raw.type, tip: str(raw.tip), tags, createdAt: Number(raw.createdAt) || null };
}

/* ---- 收藏（内置话术的 id 列表） ---- */

export function loadFavorites() {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(FAV_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      const id = str(item);
      if (!id || out.includes(id)) continue;
      out.push(id);
    }
    return out;
  } catch (err) {
    console.warn('[话术资料库] 收藏读不出来，按空处理：', err?.message || err);
    return [];
  }
}

/** @returns 实际落盘的那份（去重保序） */
export function saveFavorites(ids) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(str).filter(Boolean))];
  const store = storage();
  if (store) {
    try {
      store.setItem(FAV_KEY, JSON.stringify(clean));
    } catch (err) {
      console.warn('[话术资料库] 收藏存不进去：', err?.message || err);
    }
  }
  return clean;
}

/** 纯函数：有则移除、无则追加，不动入参。 */
export function toggleFavorite(ids, id) {
  if (!str(id)) return [...(ids ?? [])];
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/* ---- 自建笔记 ---- */

export function loadNotes() {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(NOTES_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeNote).filter(Boolean);
  } catch (err) {
    console.warn('[话术资料库] 笔记读不出来，按空处理：', err?.message || err);
    return [];
  }
}

/** @returns 实际落盘的那份（逐条 sanitize，不合格静默丢弃） */
export function saveNotes(notesList) {
  const clean = (Array.isArray(notesList) ? notesList : []).map(sanitizeNote).filter(Boolean);
  const store = storage();
  if (store) {
    try {
      store.setItem(NOTES_KEY, JSON.stringify(clean));
    } catch (err) {
      console.warn('[话术资料库] 笔记存不进去：', err?.message || err);
    }
  }
  return clean;
}

/**
 * 新建或更新一条笔记（纯函数，调用方自己 saveNotes 落盘）。
 * 无 id = 新建（分配 n- id 与 createdAt）；有 id = 原位更新（保留 createdAt、刷 updatedAt）。
 * @throws 话术为空 / 场景类型不合法 / 指定 id 不存在
 */
export function upsertNote(list, draft) {
  const text = str(draft?.text);
  if (!text) throw new Error('话术不能为空');
  if (!SCENE_IDS.has(draft.scene)) throw new Error('场景不合法');
  if (!TYPE_IDS.has(draft.type)) throw new Error('类型不合法');
  const tags = Array.isArray(draft.tags) ? draft.tags.map(str).filter(Boolean) : [];
  const now = Date.now();

  if (draft.id) {
    const idx = list.findIndex((n) => n.id === draft.id);
    if (idx === -1) throw new Error('笔记不存在');
    const next = [...list];
    next[idx] = { ...list[idx], text, scene: draft.scene, type: draft.type, tip: str(draft.tip), tags, updatedAt: now };
    return next;
  }
  return [...list, { id: mintId(), text, scene: draft.scene, type: draft.type, tip: str(draft.tip), tags, createdAt: now }];
}

/** 纯函数：返回删除后的新数组。 */
export function deleteNote(list, id) {
  return (list ?? []).filter((n) => n.id !== id);
}
