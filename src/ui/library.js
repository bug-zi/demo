/**
 * 话术资料库视图：自包含模块（同 settings-dialog.js 定位）。
 * main.js 挂载时只调 createLibraryView({数据 getter + 持久化回调 + onBack})；
 * 筛选/搜索/表单状态在闭包里，视图自管局部重绘（输入框不重建，不丢焦点）。
 * 样式在 ./library.css，由 main.js 在 Phase B 接线时 import（裸 Node 检查脚本跑不动 CSS import）。
 * 渲染铁律：全部经 h() 的 textContent，绝不拼 HTML。
 */
import { h } from '../lib/dom.js';
import { COMEBACKS, SCENES, TYPES, sceneName, typeName } from '../data/comebacks.js';

export function createLibraryView({ getFavorites, getNotes, onToggleFavorite, onSaveNote, onDeleteNote, onBack }) {
  /** 筛选轴：scene（'all' | 场景 id | 'mine'）/ type / onlyFav / query；form 为打开中的表单。 */
  const ui = { scene: 'all', type: 'all', onlyFav: false, query: '', form: null };

  const sceneRow = h('div', { class: 'chip-row' });
  const typeRow = h('div', { class: 'chip-row' });
  const listEl = h('div', { class: 'library-list' });
  const formSlot = h('div', { class: 'note-form-slot' });

  /* ---- 数据视图：笔记排最前（自己的东西先看到），再接内置话术 ---- */
  function entries() {
    const favs = new Set(getFavorites());
    const q = ui.query.trim().toLowerCase();
    const source = [
      ...getNotes().map((n) => ({ ...n, mine: true })),
      ...COMEBACKS.map((c) => ({ ...c, mine: false, fav: favs.has(c.id) })),
    ];
    return source.filter((e) => {
      if (ui.scene === 'mine') {
        if (!e.mine) return false;
      } else if (ui.scene !== 'all' && e.scene !== ui.scene) return false;
      if (ui.type !== 'all' && e.type !== ui.type) return false;
      if (ui.onlyFav && !e.fav) return false;
      if (q) {
        const hay = `${e.text} ${e.tip ?? ''} ${(e.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /* ---- 列表 ---- */
  function card(entry) {
    const ops = entry.mine
      ? h(
          'span',
          { class: 'entry-actions' },
          h('button', { class: 'entry-edit-btn', type: 'button', text: '编辑', onclick: () => openForm(entry) }),
          h('button', { class: 'entry-del-btn', type: 'button', text: '删除', onclick: () => { onDeleteNote(entry.id); closeForm(); paint(); } }),
        )
      : h('button', {
          class: `fav-btn${entry.fav ? ' on' : ''}`,
          type: 'button',
          text: entry.fav ? '★' : '☆',
          'aria-label': entry.fav ? '取消收藏' : '收藏',
          title: '收藏',
          onclick: () => { onToggleFavorite(entry.id); paint(); },
        });
    return h(
      'article',
      { class: 'entry-card', 'data-id': entry.id },
      h('div', { class: 'entry-main' },
        h('p', { class: 'entry-text', text: entry.text }),
        entry.mine ? h('span', { class: 'mine-badge', text: '自建' }) : null,
        ops),
      h('p', { class: 'entry-meta', text: `${sceneName(entry.scene)} · ${typeName(entry.type)} · ${entry.tip || '—'}` }),
      entry.tags && entry.tags.length
        ? h('div', { class: 'entry-tags' }, entry.tags.map((t) => h('span', { class: 'tag', text: `# ${t}` })))
        : null,
    );
  }

  function paint() {
    const rows = entries();
    listEl.replaceChildren(
      ...(rows.length
        ? rows.map(card)
        : [h('p', { class: 'lib-empty', text: ui.onlyFav ? '还没有收藏，点 ☆ 攒起来。' : '没有匹配的话术。' })]),
    );
  }

  /* ---- 筛选 chips（重绘以刷新 .on 态） ---- */
  function sceneChip(id, name) {
    return h('button', {
      class: `lib-chip${ui.scene === id ? ' on' : ''}`,
      type: 'button',
      'data-scene': id,
      text: name,
      onclick: () => { ui.scene = id; paintChips(); paint(); },
    });
  }
  function typeChip(id, name) {
    return h('button', {
      class: `lib-chip${ui.type === id ? ' on' : ''}`,
      type: 'button',
      'data-type': id,
      text: name,
      onclick: () => { ui.type = id; paintChips(); paint(); },
    });
  }
  function favChip() {
    return h('button', {
      class: `lib-chip${ui.onlyFav ? ' on' : ''}`,
      type: 'button',
      'data-only-fav': 'true',
      text: '仅收藏 ★',
      onclick: () => { ui.onlyFav = !ui.onlyFav; paintChips(); paint(); },
    });
  }
  function paintChips() {
    sceneRow.replaceChildren(
      sceneChip('all', '全部'),
      ...SCENES.map((s) => sceneChip(s.id, s.name)),
      sceneChip('mine', '自建'),
    );
    typeRow.replaceChildren(
      typeChip('all', '全部'),
      ...TYPES.map((t) => typeChip(t.id, t.name)),
      favChip(),
    );
  }

  /* ---- composer：新建 / 编辑共用，输入期间不重建 ---- */
  function openForm(note) {
    ui.form = note ? { id: note.id } : { id: null };
    paintForm();
  }
  function closeForm() {
    ui.form = null;
    formSlot.replaceChildren();
  }
  function paintForm(err = '') {
    const editing = ui.form?.id ? getNotes().find((n) => n.id === ui.form.id) : null;
    const box = h(
      'div',
      { class: 'note-form' },
      h('textarea', { class: 'nf-text', rows: 2, placeholder: '写下你的那句话（必填）' }),
      h('div', { class: 'nf-row' },
        h('select', { class: 'nf-scene', 'aria-label': '场景' }, SCENES.map((s) => h('option', { value: s.id, text: s.name }))),
        h('select', { class: 'nf-type', 'aria-label': '类型' }, TYPES.map((t) => h('option', { value: t.id, text: t.name }))),
      ),
      h('input', { class: 'nf-tip', type: 'text', placeholder: '何时用（可选）' }),
      h('input', { class: 'nf-tags', type: 'text', placeholder: '标签，逗号分隔（可选）' }),
      err ? h('p', { class: 'form-error', text: err }) : null,
      h('div', { class: 'nf-actions' },
        h('button', { class: 'note-save-btn', type: 'button', text: '保存', onclick: submit }),
        h('button', { class: 'note-cancel-btn', type: 'button', text: '取消', onclick: closeForm }),
      ),
    );
    if (editing) {
      box.querySelector('.nf-text').value = editing.text;
      box.querySelector('.nf-scene').value = editing.scene;
      box.querySelector('.nf-type').value = editing.type;
      box.querySelector('.nf-tip').value = editing.tip ?? '';
      box.querySelector('.nf-tags').value = (editing.tags ?? []).join(',');
    }
    formSlot.replaceChildren(box);
  }
  function submit() {
    const form = formSlot.querySelector('.note-form');
    const draft = {
      id: ui.form?.id ?? null,
      text: form.querySelector('.nf-text').value,
      scene: form.querySelector('.nf-scene').value,
      type: form.querySelector('.nf-type').value,
      tip: form.querySelector('.nf-tip').value,
      tags: form
        .querySelector('.nf-tags')
        .value.split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      onSaveNote(draft);
      closeForm();
      paint();
    } catch (err) {
      paintForm(err?.message || '保存失败');
    }
  }

  /* ---- 组装（搜索框只建一次，键入只重绘列表，不丢焦点） ---- */
  const root = h(
    'section',
    { class: 'library' },
    h('button', { class: 'back-btn', type: 'button', text: '← 大厅', onclick: () => onBack() }),
    h('div', { class: 'library-head' },
      h('h1', { class: 'hero-title', text: '话术资料库' }),
      h('p', { class: 'hero-sub', text: '先背两句，再上场。' }),
      h('div', { class: 'lib-tools' },
        h('button', { class: 'note-add-btn', type: 'button', text: '+ 自建话术', onclick: () => openForm(null) }),
      ),
    ),
    h('div', { class: 'library-filters' }, sceneRow, typeRow),
    h('input', {
      class: 'lib-search',
      type: 'search',
      placeholder: '搜话术 / 何时用 / 标签',
      'aria-label': '搜索话术',
      oninput: (e) => { ui.query = e.target.value; paint(); },
    }),
    formSlot,
    listEl,
    h('p', { class: 'footnote', text: '收藏和自建都存在本地浏览器里，清了缓存就没了，想留的先抄走。' }),
  );
  paintChips();
  paint();
  return root;
}
