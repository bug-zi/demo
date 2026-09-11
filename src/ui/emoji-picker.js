/**
 * 表情面板：挂在输入框左边，点一个就往光标处插一个。
 *
 * 只做「插进输入框」这一件事 —— 不碰破防值、不碰判定。
 * 表情是语气，不是招式（见 lib/duel-engine.js 的 localHitType）。
 */

import { EMOJIS } from '../data/emojis.js';
import { h } from '../lib/dom.js';
import { MAX_INPUT } from '../lib/text.js';

const NOTE = '表情只是语气，不参与破防值判定。';
const NOTE_FULL = '输入框满了：每回合最多 100 个单位，一个表情算两个。';

/**
 * 往输入框的光标处插一段文本，插完把光标停在它后面。
 * 有选区就替换掉选中的内容（跟直接打字一样）。
 *
 * @returns {boolean} 放不下（超上限）时返回 false，输入框保持原样
 */
export function insertAtCaret(field, text) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const next = field.value.slice(0, start) + text + field.value.slice(end);
  if (next.length > MAX_INPUT) return false;

  field.value = next;
  // 先 focus 再定光标：有些浏览器 focus 时会把光标丢到末尾
  field.focus();
  const caret = start + text.length;
  field.setSelectionRange(caret, caret);
  return true;
}

/**
 * @param {{field: HTMLTextAreaElement, onInsert?: (char: string) => void}} options
 * @returns {{el: HTMLElement, close: () => void}}
 */
export function createEmojiPicker({ field, onInsert }) {
  const note = h('p', { class: 'emoji-note', text: NOTE });
  let noteTimer = null;

  const flashFull = () => {
    clearTimeout(noteTimer);
    note.textContent = NOTE_FULL;
    note.classList.add('is-full');
    noteTimer = setTimeout(() => {
      note.textContent = NOTE;
      note.classList.remove('is-full');
    }, 2000);
  };

  const grid = h(
    'div',
    { class: 'emoji-panel', hidden: true, role: 'group', 'aria-label': '表情' },
    h(
      'div',
      { class: 'emoji-grid' },
      ...EMOJIS.map((item) =>
        h('button', {
          class: 'emoji-item',
          type: 'button',
          text: item.char,
          title: item.hint,
          'aria-label': `插入表情：${item.hint}`,
          onclick: () => {
            if (!insertAtCaret(field, item.char)) {
              flashFull();
              return;
            }
            onInsert?.(item.char);
          },
        }),
      ),
    ),
    note,
  );

  const button = h('button', {
    class: 'emoji-btn',
    type: 'button',
    text: '😀',
    title: '插入表情',
    'aria-label': '插入表情',
    'aria-expanded': 'false',
  });

  // 点面板外面 / 按 Esc 收起。监听挂在 document 上，所以关的时候一定要摘掉。
  const onDocClick = (event) => {
    // 界面重绘会把这个节点整个摘掉（render 里 replaceChildren）——
    // 这时候顺手把全局监听也收了，不然每开一次面板就漏一个
    if (!el.isConnected) return close();
    if (!el.contains(event.target)) close();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };

  function open() {
    grid.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown);
  }

  function close() {
    grid.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    clearTimeout(noteTimer);
    note.textContent = NOTE;
    note.classList.remove('is-full');
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeydown);
  }

  button.addEventListener('click', () => {
    if (grid.hidden) open();
    else close();
  });

  // 对方还在打字时输入框是禁用的，表情按钮也得跟着禁 ——
  // 不然插进去的字会在下个回合开始时被清掉，白插
  function setDisabled(disabled) {
    button.disabled = disabled;
    if (disabled) close();
  }

  const el = h('div', { class: 'picker' }, button, grid);
  return { el, close, setDisabled };
}
