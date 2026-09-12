/**
 * 成就墙视图：自包含模块（同 library.js / arena.js 定位）。
 * main.js 挂载：createWallView({ getProfile, onEquipTitle, onBack }) → { root, dispose }。
 * 进墙前 main.js 已做一次成就扫描（enterWall），本视图只读档案快照渲染；
 * 佩戴/摘下经 onEquipTitle(titleId|null) 通知 main.js 落盘，视图随后自重绘。
 * 样式在 ./wall.css，由 index.html 以 <link> 加载（裸 Node 检查脚本要能直接 import 本文件）。
 * 渲染铁律：全部经 h() 的 textContent，绝不拼 HTML。
 */
import { backBtn, h } from '../lib/dom.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { ALL_TITLES, titleById } from '../data/titles.js';
import { ECONOMY } from '../lib/profile.js';

const TIER_LABELS = { bronze: '青铜', silver: '白银', gold: '黄金', king: '王者' };
const GROUP_ORDER = ['对线', '战役', '资料库', '擂台', '收集', '隐藏'];

export function createWallView({ getProfile, onEquipTitle, onBack }) {
  function fmtTs(ts) {
    const d = new Date(ts);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  /* ---- 名片头：等级 / 称号 / 金币 / 心 / 成就进度 ---- */
  function wallCard() {
    const p = getProfile();
    const unlocked = Object.keys(p.achievements).length;
    const pct = ACHIEVEMENTS.length ? Math.round((unlocked / ACHIEVEMENTS.length) * 100) : 0;
    const title = p.equippedTitle ? titleById(p.equippedTitle) : null;
    return h(
      'div',
      { class: 'wall-card' },
      h('span', { class: 'profile-lv', text: `Lv.${p.level}` }),
      h('span', { class: `wall-title-chip${title ? '' : ' empty'}`, text: title ? title.name : '未佩戴称号' }),
      h('span', { class: 'profile-stat', text: `金币 ${p.coins}` }),
      h('span', { class: 'profile-stat', text: `生命 ${p.hearts}/${ECONOMY.HEARTS_MAX}` }),
      h(
        'div',
        { class: 'wall-progress' },
        h('span', { class: 'wall-progress-label', text: `成就 ${unlocked}/${ACHIEVEMENTS.length}` }),
        h('div', { class: 'wall-progress-track' },
          h('div', { class: 'wall-progress-fill', style: `width:${pct}%` })),
      ),
    );
  }

  /* ---- 称号柜：全图鉴 9 格，已收集可点佩戴（再点摘下），未收集只露 ??? + 品阶 ---- */
  function titleCell(t) {
    const p = getProfile();
    const owned = p.titlesOwned.includes(t.id);
    if (!owned) {
      return h(
        'div',
        { class: 'title-cell locked' },
        h('span', { class: 'title-rank', text: t.rank }),
        h('div', {},
          h('div', { class: 'title-name', text: '???' }),
          h('p', { class: 'title-desc', text: '称号尚未收集。' }),
        ),
      );
    }
    const on = p.equippedTitle === t.id;
    return h(
      'button',
      {
        class: `title-cell owned${on ? ' on' : ''}`,
        type: 'button',
        'data-title': t.id,
        onclick: () => {
          onEquipTitle(on ? null : t.id);
          paintAll();
        },
      },
      h('span', { class: 'title-rank', text: t.rank }),
      h('div', {},
        h('div', { class: 'title-name', text: t.name }),
        h('p', { class: 'title-desc', text: t.desc }),
        h('span', { class: 'title-equip', text: on ? '佩戴中 · 点击摘下' : '点击佩戴' }),
      ),
    );
  }

  /** 徽章图（A4 小样）：onload 才亮出、404 onerror 摘除，不占位不破格。
      不能加 loading="lazy"——display:none 的图没有布局盒，lazy 永不触发加载。 */
  function badgeImg(def) {
    return h('img', {
      class: 'achv-badge',
      src: `/assets/art/badges/${def.id}.png`,
      alt: '',
      onload: (e) => e.target.classList.add('ok'),
      onerror: (e) => e.target.remove(),
    });
  }

  /* ---- 成就网格：按六类分区，解锁亮 + 时间，未解锁灰 + 条件，隐藏未解锁 ??? ---- */
  function achvCell(def) {
    const p = getProfile();
    const ts = p.achievements[def.id];
    const secret = def.hidden && !ts;
    const cls = ['achv-card', ts ? 'unlocked' : 'locked'];
    if (def.hidden) cls.push('hidden-cell');
    if (def.tier) cls.push(`tier-${def.tier}`);
    const coins = Number.isFinite(def.coins) ? def.coins : ECONOMY.ACHIEVEMENT_COINS[def.tier] ?? 0;
    return h(
      'div',
      { class: cls.join(' ') },
      h(
        'div',
        { class: 'achv-head' },
        badgeImg(def),
        h('span', { class: 'achv-name', text: secret ? '???' : def.name }),
        h('span', { class: 'achv-tier', text: TIER_LABELS[def.tier] ?? def.tier }),
      ),
      h('p', { class: 'achv-desc', text: secret ? '隐藏成就，达成后揭晓。' : def.desc }),
      h(
        'div',
        { class: 'achv-foot' },
        h('span', { class: 'achv-reward', text: `+${coins} 金币` }),
        h('span', { class: 'achv-time', text: ts ? `解锁于 ${fmtTs(ts)}` : '未解锁' }),
      ),
    );
  }

  const cardEl = h('div', { class: 'wall-card-slot' });
  const vaultEl = h('div', { class: 'title-vault' });
  const gridEl = h('div', { class: 'achv-grid' });

  function paintAll() {
    cardEl.replaceChildren(wallCard());
    vaultEl.replaceChildren(...ALL_TITLES.map(titleCell));
    gridEl.replaceChildren(
      ...GROUP_ORDER.flatMap((group) => [
        h('h2', { class: 'achv-group-title', text: group }),
        h(
          'div',
          { class: 'achv-group' },
          ...ACHIEVEMENTS.filter((d) => d.group === group).map(achvCell),
        ),
      ]),
    );
  }

  paintAll();

  const root = h(
    'section',
    { class: 'wall' },
    backBtn('大厅', () => onBack()),
    h('div', { class: 'wall-head' },
      h('h1', { class: 'hero-title', text: '成就墙' }),
      h('p', { class: 'hero-sub', text: '嘴上功夫，都记着账呢。' })),
    cardEl,
    h('h2', { class: 'achv-group-title', text: '称号柜' }),
    vaultEl,
    gridEl,
  );

  return { root, dispose() {} };
}
