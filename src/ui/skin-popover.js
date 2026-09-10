/**
 * 皮肤选择弹层：顶栏 palette 按钮触发，挂 body（不走 render()，
 * 对线中随时打开，不暂停计时——轻量即时选择）。
 * 点卡即切皮肤（与深浅解耦），弹层保持打开便于对比；Esc / 点外部关闭。
 */
import { h } from '../lib/dom.js';
import { onSkin, setSkin } from '../lib/theme.js';
import { SKINS } from '../data/skins.js';

let root = null;
let offSkin = null;
let btn = null;

function onDocMouseDown(e) {
  if (root && !root.contains(e.target) && !(btn && btn.contains(e.target))) closeSkinPopover();
}

function onDocKeyDown(e) {
  if (e.key === 'Escape') closeSkinPopover();
}

function syncActive() {
  if (!root) return;
  const current = document.documentElement.dataset.skin || 'blossom';
  for (const card of root.querySelectorAll('.skin-card')) {
    card.classList.toggle('is-active', card.dataset.skinId === current);
  }
}

function sample([bg, accent], label) {
  return h('span', { class: 'skin-sample' },
    h('span', { class: 'skin-sample-bg', style: `background:${bg}` }),
    h('span', { class: 'skin-sample-dot', style: `background:${accent}` }),
    h('span', { class: 'skin-sample-label' }, label));
}

function skinCard(skin) {
  return h('button', {
    type: 'button',
    class: 'skin-card',
    'data-skin-id': skin.id,
    onclick: () => setSkin(skin.id),
  },
    h('span', { class: 'skin-card-head' },
      h('span', { class: 'skin-card-name' }, skin.name),
      h('span', { class: 'skin-card-check' },
        h('span', { class: 'icon i-check', 'aria-hidden': 'true' }))),
    h('span', { class: 'skin-card-desc' }, skin.desc),
    h('span', { class: 'skin-card-samples' },
      sample(skin.samples.light, '浅色'),
      sample(skin.samples.dark, '深色')));
}

export function openSkinPopover(trigger) {
  if (root) return;
  btn = trigger;
  root = h('div', { class: 'skin-popover', role: 'dialog', 'aria-label': '皮肤选择' },
    h('div', { class: 'skin-pop-title' }, '皮肤'),
    h('div', { class: 'skin-cards' }));
  for (const skin of SKINS) root.querySelector('.skin-cards').append(skinCard(skin));
  document.body.append(root);
  offSkin = onSkin(syncActive);
  syncActive();
  document.addEventListener('mousedown', onDocMouseDown);
  document.addEventListener('keydown', onDocKeyDown);
}

export function closeSkinPopover() {
  if (!root) return;
  root.remove();
  root = null;
  btn = null;
  if (offSkin) {
    offSkin();
    offSkin = null;
  }
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('keydown', onDocKeyDown);
}

export function toggleSkinPopover(trigger) {
  if (root) closeSkinPopover();
  else openSkinPopover(trigger);
}
