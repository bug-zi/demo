/**
 * 嘴强王者 · 主状态机
 *
 * LOBBY → SELECT(三房分组) → DUEL(1..8, 点火/灭火) → REPORT
 * 大厅随时可去，进行中的对局不销毁（记录在 state.duel，回来重建）。
 *
 * 所有模型产出都走 textContent 落地，绝不拼 HTML（见计划书 §6.5）。
 */

import { PERSONAS, getPersona } from './data/personas.js';
import { CATEGORIES, categoryOf } from './data/categories.js';
import { HIT_LABELS, EQ_HIT_LABELS, HIT_QUIPS, EQ_HIT_QUIPS, SILENCE_TEXT } from './data/fallbacks.js';
import { pickTitle } from './data/titles.js';
import { STICKERS, matchSticker, stickerById } from './data/stickers.js';
import {
  MAX_ROUNDS,
  MAX_SELF_DESTRUCTS,
  createDuel,
  currentRound,
  recordTurn,
  stageOf,
  uniqueSoftspotHits,
} from './lib/duel-engine.js';
import { loadRoundSeconds } from './lib/duel-options.js';
import { exportDuelCard } from './lib/share-card.js';
import { engineLabel, generateTurn, isRemote } from './lib/llm.js';
import { blip, isSoundEnabled, setSoundEnabled } from './lib/audio.js';
import { h } from './lib/dom.js';
import { openSettings } from './ui/settings-dialog.js';
import { toggleSkinPopover } from './ui/skin-popover.js';
import { createLibraryView } from './ui/library.js';
import { createArenaView } from './ui/arena.js';
import {
  loadFavorites,
  loadNotes,
  saveFavorites,
  saveNotes,
  toggleFavorite,
  upsertNote,
  deleteNote,
} from './lib/notes.js';
import { initTheme, initSkin, toggleTheme, onTheme } from './lib/theme.js';

const screenEl = document.getElementById('screen');

const state = {
  screen: 'lobby',
  duel: null,
  busy: false,
  timerId: null,
  secondsLeft: 0,
  timerPaused: false, // 手动暂停：跨大厅往返保持，发完一言进下一轮自动解除
  favorites: loadFavorites(),
  notes: loadNotes(),
};

/** 当前屏幕里需要原地更新的节点。 */
const refs = {};

/** 擂台视图实例（离场即弃局：render 前先 dispose，清掉它的答题倒计时）。 */
let arenaView = null;

function disposeArena() {
  if (!arenaView) return;
  arenaView.dispose();
  arenaView = null;
}

/* ------------------------------------------------------------------ */
/* DOM 小工具                                                          */
/* ------------------------------------------------------------------ */

function scrollLogToBottom() {
  if (!refs.log) return;
  refs.log.scrollTop = refs.log.scrollHeight;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 重放一次性动效类：先摘掉再强制回流，连跨两档时动画也能重新跑起来。 */
function replayFx(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/* ------------------------------------------------------------------ */
/* 渲染入口                                                            */
/* ------------------------------------------------------------------ */

function render() {
  stopTimer();
  closeStickerPicker();
  disposeArena();
  for (const key of Object.keys(refs)) delete refs[key];
  screenEl.replaceChildren();

  if (state.screen === 'lobby') screenEl.append(viewLobby());
  else if (state.screen === 'select') screenEl.append(viewSelect());
  else if (state.screen === 'duel') screenEl.append(viewDuel());
  else if (state.screen === 'report') screenEl.append(viewReport());
  else if (state.screen === 'library') screenEl.append(libraryView());
  else if (state.screen === 'arena') {
    arenaView = createArenaView({ onBack: goLobby, openSettings: openSettingsDialog });
    screenEl.append(arenaView.root);
  }
}

/* ------------------------------------------------------------------ */
/* 大厅                                                                */
/* ------------------------------------------------------------------ */

function viewLobby() {
  const activeDuel = state.duel && !state.duel.result ? state.duel : null;
  return h(
    'section',
    { class: 'lobby' },
    h(
      'div',
      { class: 'lobby-head' },
      h('h1', { class: 'hero-title', text: '今天想跟谁练练？' }),
      h('p', { class: 'hero-sub', text: '对线房三间都已亮灯，先从最热闹那间开始。' }),
    ),
    h(
      'div',
      { class: 'lobby-grid' },
      h(
        'button',
        {
          class: 'module-card primary',
          type: 'button',
          onclick: enterDuelModule,
        },
        h(
          'div',
          { class: 'module-top' },
          h('span', { class: 'module-name', text: '对线房' }),
          activeDuel
            ? h('span', {
                class: 'module-badge live',
                text: `对局进行中 · 第 ${currentRound(activeDuel)} 轮`,
              })
            : null,
        ),
        h('p', { class: 'module-desc', text: '选个对手开练：点火破防，或灭火哄人。' }),
      ),
      h(
        'button',
        {
          class: 'module-card library',
          type: 'button',
          onclick: enterLibrary,
        },
        h(
          'div',
          { class: 'module-top' },
          h('span', { class: 'module-name', text: '话术资料库' }),
        ),
        h('p', { class: 'module-desc', text: '回怼话术随身查阅，收藏自己的必杀句。' }),
      ),
      h(
        'button',
        {
          class: 'module-card arena',
          type: 'button',
          onclick: enterArena,
        },
        h(
          'div',
          { class: 'module-top' },
          h('span', { class: 'module-name', text: '好友擂台' }),
        ),
        h('p', { class: 'module-desc', text: '同一块屏幕，两个人，AI 当裁判。' }),
      ),
    ),
    h('p', {
      class: 'footnote',
      text: '擂台也开张了：是骡子是马，拉个朋友上场遛遛。',
    }),
    isRemote() ? null : connectHint(),
  );
}

/** 擂台入口：离场即弃局的派对局，不挂「进行中」角标、不进 state。 */
function enterArena() {
  state.screen = 'arena';
  render();
}

/** 大厅主卡：有活局就续，没有就进选人（顺手弃掉已结束的旧局）。 */
function enterDuelModule() {
  if (state.duel && !state.duel.result) {
    state.screen = 'duel';
  } else {
    state.duel = null;
    state.screen = 'select';
  }
  render();
}

function goLobby() {
  state.screen = 'lobby';
  render();
}

/* ------------------------------------------------------------------ */
/* 话术资料库                                                          */
/* ------------------------------------------------------------------ */

function enterLibrary() {
  state.screen = 'library';
  render();
}

/** 资料库视图：数据在 state，持久化在回调里做完，视图自管筛选与重绘。 */
function libraryView() {
  return createLibraryView({
    getFavorites: () => state.favorites,
    getNotes: () => state.notes,
    onToggleFavorite: (id) => {
      state.favorites = toggleFavorite(state.favorites, id);
      saveFavorites(state.favorites);
    },
    onSaveNote: (draft) => {
      state.notes = upsertNote(state.notes, draft);
      saveNotes(state.notes);
    },
    onDeleteNote: (id) => {
      state.notes = deleteNote(state.notes, id);
      saveNotes(state.notes);
    },
    onBack: goLobby,
  });
}

/* ------------------------------------------------------------------ */
/* 选人屏                                                              */
/* ------------------------------------------------------------------ */

function viewSelect() {
  return h(
    'section',
    { class: 'select' },
    h('button', { class: 'back-btn', type: 'button', text: '← 大厅', onclick: goLobby }),
    h(
      'div',
      { class: 'select-head' },
      h('h1', { class: 'hero-title', text: '选个对手开练' }),
      h('p', {
        class: 'hero-sub',
        text: '点火房把 TA 说到破防；灭火房把 TA 哄到消气。',
      }),
    ),
    ...CATEGORIES.map(categoryGroup),
    h('p', {
      class: 'footnote',
      text: '每个人都有软肋，藏着的那种。但话说太冲，先破防的可能是你自己。',
    }),
    isRemote() ? null : connectHint(),
  );
}

/** 选人屏的一间房：组头（房名 + 模式提示）+ 组内人设卡；空的可玩分组不渲染。 */
function categoryGroup(category) {
  const members = PERSONAS.filter((p) => categoryOf(p).id === category.id);
  if (!category.locked && members.length === 0) return null;
  return h(
    'div',
    { class: 'category-group' },
    h(
      'div',
      { class: 'category-head' },
      h('span', { class: 'category-name', text: category.name }),
      h('span', { class: 'category-hint', text: category.hint }),
    ),
    category.locked && members.length === 0
      ? lockedPersonaCard()
      : h('div', { class: 'persona-grid' }, members.map(personaCard)),
  );
}

/** 未开放分组的占位卡：可看不可点，不做死链（同大厅锁定卡精神）。 */
function lockedPersonaCard() {
  return h(
    'button',
    { class: 'persona-card locked', type: 'button', disabled: true },
    h(
      'div',
      { class: 'persona-top' },
      h('span', { class: 'persona-name', text: '哄人 / 说服' }),
      h('span', { class: 'module-badge', text: '即将开放' }),
    ),
    h('p', { class: 'persona-intro', text: '灭火局：对方正在气头上，把 TA 哄到消气。' }),
  );
}

/** 没配 AI 时，在选人屏底部再提一句 —— 顶栏那个齿轮太容易被忽略。 */
function connectHint() {
  return h(
    'div',
    { class: 'connect-hint' },
    h('span', { text: '对手现在只会背台词。' }),
    h('button', {
      class: 'hint-btn',
      type: 'button',
      text: '接入你的 AI →',
      onclick: openSettingsDialog,
    }),
  );
}

function personaCard(persona) {
  return h(
    'button',
    {
      class: 'persona-card',
      type: 'button',
      onclick: () => startDuel(persona.id),
    },
    h(
      'div',
      { class: 'persona-top' },
      h('span', { class: 'avatar' },
        h('span', { class: `icon i-${persona.avatar}`, 'aria-hidden': 'true' }),
      ),
      h(
        'div',
        { class: 'persona-id' },
        h('div', { class: 'persona-name', text: persona.name }),
        h('div', { class: 'persona-stars', 'aria-label': `难度 ${persona.difficulty}/5` },
          ...Array.from({ length: persona.difficulty }, () =>
            h('span', { class: 'icon i-star', 'aria-hidden': 'true' })),
          ...Array.from({ length: 5 - persona.difficulty }, () =>
            h('span', { class: 'icon i-star star-dim', 'aria-hidden': 'true' })),
        ),
      ),
    ),
    h('p', { class: 'persona-tagline', text: `「${persona.tagline}」` }),
    h('p', { class: 'persona-intro', text: persona.intro }),
  );
}

/* ------------------------------------------------------------------ */
/* 对线屏                                                              */
/* ------------------------------------------------------------------ */

function startDuel(personaId) {
  const persona = getPersona(personaId);
  if (!persona) return;
  // 时限在开局时定格：设置改动只影响下一局，进行中的局不中途变卦
  state.duel = createDuel(persona, { roundSeconds: loadRoundSeconds() });
  state.busy = false;
  state.secondsLeft = state.duel.roundSeconds;
  state.timerPaused = false;
  state.screen = 'duel';
  render();
}

function viewDuel() {
  const { duel } = state;
  const persona = duel.persona;
  const stage = stageOf(duel.anger);

  // data-stage 驱动对手气泡底色随阶段渐变（颜色归 CSS，这里只报阶段）
  refs.log = h('div', { class: 'log', 'data-stage': stage.id });
  refs.log.append(bubbleAI(persona.opener));

  for (const round of duel.rounds) {
    if (round.userText) refs.log.append(bubbleMe(round.userText));
    const mine = round.stickerId ? stickerById(round.stickerId) : null;
    if (mine) refs.log.append(stickerMe(mine));
    refs.log.append(bubbleAI(round.aiReply));
    const theirs = round.aiStickerId ? stickerById(round.aiStickerId) : null;
    if (theirs) refs.log.append(stickerAI(theirs));
    refs.log.append(quipLine(round));
  }

  refs.angerFill = h('div', {
    class: 'anger-fill',
    'data-stage': stage.id,
    style: `width:${duel.anger}%`,
  });
  refs.angerNum = h('span', { class: 'anger-num', text: String(duel.anger) });
  refs.stagePill = h('span', {
    class: `stage-pill stage-${stage.id}`,
    text: stage.label,
  });
  refs.roundLabel = h('span', {
    class: 'round-label',
    text: `第 ${currentRound(duel)} / ${MAX_ROUNDS} 轮`,
  });
  // 开了计时的局才有倒计时 + 暂停按钮；不限时的局 meta 区只剩轮次
  const timed = duel.roundSeconds > 0;
  refs.timerLabel = timed ? h('span', { class: 'timer-label' }) : null;
  refs.pauseBtn = timed
    ? h('button', {
        class: 'pause-btn',
        type: 'button',
        text: state.timerPaused ? '继续' : '暂停',
        onclick: () => setPaused(!state.timerPaused),
      })
    : null;

  refs.input = h('textarea', {
    class: 'input',
    rows: '2',
    maxlength: '100',
    placeholder: '说点什么，让他绷不住…（Enter 发送，Shift+Enter 换行）',
  });
  refs.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitTurn(refs.input.value, {});
    }
  });

  const sendBtn = h('button', {
    class: 'send-btn',
    type: 'button',
    text: '发送',
    onclick: () => submitTurn(refs.input.value, {}),
  });
  refs.sendBtn = sendBtn;

  // 贴纸按钮：点开弹层选贴纸，emoji 插进输入框 —— 单发/随文字发一个心智模型
  const stickerBtn = h('button', {
    class: 'sticker-btn',
    type: 'button',
    title: '表情包',
    'aria-label': '表情包',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    onclick: (event) => toggleStickerPicker(event.currentTarget),
  }, h('span', { class: 'icon i-add_reaction', 'aria-hidden': 'true' }));
  refs.stickerBtn = stickerBtn;

  const presetRow = h(
    'div',
    { class: 'presets' },
    h('span', { class: 'presets-label', text: '预设话术' }),
    ...persona.presets.map((text) =>
      h('button', {
        class: 'preset-chip',
        type: 'button',
        text,
        onclick: (event) => {
          // 对方还在打字时点了就先不动 —— 别把牌白白作废
          if (state.busy) return;
          const chip = event.currentTarget;
          chip.disabled = true;
          chip.classList.add('used');
          submitTurn(text, { preset: true });
        },
      }),
    ),
  );

  const root = h(
    'section',
    { class: 'duel' },
    h(
      'div',
      { class: 'duel-head' },
      h('button', { class: 'back-btn duel-exit', type: 'button', text: '← 大厅', onclick: goLobby }),
      h(
        'div',
        { class: 'duel-who' },
        refs.headAvatar = h('span', { class: 'avatar small' },
          h('span', { class: `icon i-${persona.avatar}`, 'aria-hidden': 'true' }),
        ),
        h('div', {},
          h('div', { class: 'persona-name', text: persona.name }),
          h('div', { class: 'persona-tagline small', text: `「${persona.tagline}」` }),
        ),
      ),
      h('div', { class: 'duel-meta' }, refs.roundLabel, refs.timerLabel, refs.pauseBtn),
    ),
    h(
      'div',
      { class: 'anger' },
      h(
        'div',
        { class: 'anger-head' },
        h('span', { class: 'anger-label', text: '怒气值' }),
        refs.angerNum,
        refs.stagePill,
      ),
      h(
        'div',
        { class: 'anger-track' },
        refs.angerFill,
        h('div', { class: 'anger-tick', style: 'left:35%' }),
        h('div', { class: 'anger-tick', style: 'left:65%' }),
        h('div', { class: 'anger-tick', style: 'left:85%' }),
      ),
    ),
    refs.log,
    h(
      'div',
      { class: 'composer' },
      presetRow,
      h('div', { class: 'input-row' }, stickerBtn, refs.input, sendBtn),
    ),
  );

  requestAnimationFrame(() => {
    // 进屏后一帧内就回大厅的话，refs 已被 render() 清空 —— 别碰了
    if (state.screen !== 'duel') return;
    scrollLogToBottom();
    refs.input?.focus();
  });
  // 开了计时的局才碰计时器：暂停中就冻结着回来；大厅往返接着剩余秒数走，不偷偷回满；新回合走满
  if (duel.roundSeconds > 0) {
    if (state.timerPaused) {
      paintTimer();
    } else if (state.secondsLeft > 0 && state.secondsLeft < duel.roundSeconds) {
      paintTimer();
      resumeTimer();
    } else {
      startTimer();
    }
  }
  refs.duelRoot = root;
  return root;
}

function bubbleAI(text) {
  const { duel } = state;
  return h(
    'div',
    { class: 'row row-ai' },
    h('span', { class: 'avatar small' },
      h('span', { class: `icon i-${duel.persona.avatar}`, 'aria-hidden': 'true' }),
    ),
    h('div', { class: 'bubble bubble-ai', text }),
  );
}

function bubbleMe(text) {
  return h('div', { class: 'row row-me' }, h('div', { class: 'bubble bubble-me', text }));
}

/** 对手「正在输入…」占位行：回合生成期间 & 已读不回演出共用。 */
function typingBubble() {
  return h('div', { class: 'row row-ai' },
    h('span', { class: 'avatar small' },
      h('span', { class: `icon i-${state.duel.persona.avatar}`, 'aria-hidden': 'true' }),
    ),
    h('div', { class: 'bubble bubble-ai typing' }, h('i'), h('i'), h('i')),
  );
}

/** 贴纸气泡：大号 emoji + 吐槽小字，全程 textContent，没有 innerHTML。 */
function stickerBubble(sticker) {
  return h(
    'div',
    { class: 'sticker-bubble' },
    h('span', { class: 'sticker-emoji', text: sticker.emoji }),
    h('span', { class: 'sticker-label', text: sticker.label }),
  );
}

function stickerMe(sticker) {
  return h('div', { class: 'sticker-row me' }, stickerBubble(sticker));
}

function stickerAI(sticker) {
  return h(
    'div',
    { class: 'sticker-row ai' },
    h('span', { class: 'avatar small' },
      h('span', { class: `icon i-${state.duel.persona.avatar}`, 'aria-hidden': 'true' }),
    ),
    stickerBubble(sticker),
  );
}

/* ------------------------------------------------------------------ */
/* 贴纸弹层                                                            */
/* ------------------------------------------------------------------ */

// 一次只开一个弹层；AbortController 把「点外部关闭 / Esc 关闭」的监听一起带走
let stickerPickerCtrl = null;

function closeStickerPicker() {
  if (!stickerPickerCtrl) return;
  stickerPickerCtrl.abort();
  stickerPickerCtrl.picker.remove();
  if (refs.stickerBtn) refs.stickerBtn.setAttribute('aria-expanded', 'false');
  stickerPickerCtrl = null;
}

function toggleStickerPicker(btn) {
  if (stickerPickerCtrl) {
    closeStickerPicker();
    return;
  }
  if (state.busy || !state.duel || state.duel.result) return;

  // 注意 realm：jsdom/浏览器各自的 addEventListener 只认自家 AbortSignal，
  // 所以从 document.defaultView 拿构造器（真浏览器里就是 window.AbortController）
  const { AbortController: LocalAbortController } = document.defaultView ?? globalThis;
  const ctrl = new LocalAbortController();
  const picker = h(
    'div',
    { class: 'sticker-picker', role: 'menu', 'aria-label': '选择表情包' },
    ...STICKERS.map((s) =>
      h(
        'button',
        {
          class: 'sticker-cell',
          type: 'button',
          'data-id': s.id,
          'aria-label': `${s.emoji} ${s.label}`,
          onclick: () => {
            insertSticker(s);
            closeStickerPicker();
          },
        },
        h('span', { class: 'sticker-emoji', text: s.emoji }),
        h('span', { class: 'sticker-label', text: s.label }),
      ),
    ),
  );

  document.addEventListener(
    'click',
    (event) => {
      if (picker.contains(event.target) || btn.contains(event.target)) return;
      closeStickerPicker();
    },
    { capture: true, signal: ctrl.signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') closeStickerPicker();
    },
    { signal: ctrl.signal },
  );

  stickerPickerCtrl = ctrl;
  ctrl.picker = picker;
  btn.closest('.composer')?.appendChild(picker);
  btn.setAttribute('aria-expanded', 'true');
}

/** 选中的贴纸以 emoji 字符插进输入框光标处（跟手打 emoji 同一条路，submit 时统一解析）。 */
function insertSticker(sticker) {
  const input = refs.input;
  if (!input || input.disabled) return;
  const at = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, at) + sticker.emoji + input.value.slice(input.selectionEnd ?? at);
  const caret = at + sticker.emoji.length;
  input.focus();
  input.setSelectionRange(caret, caret);
}

/** 远程 AI 掉线时的提示：明说是本地台词，不然玩家分不清这局到底谁在说话。 */
function fallbackLine(reason) {
  return h('div', { class: 'fallback-line' },
    h('span', { class: 'fallback-tag', text: '本地兜底' }),
    h('span', { text: `真实 AI 没接上：${reason}` }),
  );
}

function quipLine(round) {
  const isEq = state.duel?.mode === 'extinguish';
  const labels = isEq ? EQ_HIT_LABELS : HIT_LABELS;
  const quips = isEq ? EQ_HIT_QUIPS : HIT_QUIPS;
  const sign = round.delta > 0 ? '+' : '';
  const tagIcon =
    round.hitType === 'softspot'
      ? h('span', { class: 'icon i-target', 'aria-hidden': 'true' })
      : round.hitType === 'self_destruct'
        ? h('span', { class: 'icon i-bolt', 'aria-hidden': 'true' })
        : null;
  // 纯贴纸回合的 quip 是空文本分类（miss 档）带出来的 —— 换成斗图飘字
  const quipText = round.hitType === 'sticker' ? quips.sticker : round.quip;
  // 斗图回合的 delta 本来就是贴纸增量，不必再注一遍；只给「文字+贴纸」的叠加回合标注
  const stickerNote =
    round.stickerDelta && round.hitType !== 'sticker'
      ? `（贴纸 ${round.stickerDelta > 0 ? '+' : ''}${round.stickerDelta}）`
      : '';
  return h(
    'div',
    { class: `quip quip-${round.hitType}` },
    h('span', { class: 'quip-tag' }, tagIcon, labels[round.hitType] || '回合'),
    h('span', { class: 'quip-text', text: `${quipText || ''} ${sign}${round.delta}${stickerNote}` }),
  );
}

/* ------------------------------------------------------------------ */
/* 回合流程                                                            */
/* ------------------------------------------------------------------ */

async function submitTurn(rawText, { preset = false, timeout = false } = {}) {
  if (state.busy || !state.duel || state.duel.result) return;

  // 贴纸 = 注册过的 emoji 字符，随文字一起走输入框；这里剥出来单独结算
  const { sticker, text: stripped } = matchSticker(rawText);
  const text = stripped.trim().slice(0, 100);
  if (!text && !sticker && !timeout) {
    refs.input?.focus();
    return;
  }

  state.busy = true;
  stopTimer();
  closeStickerPicker();

  const userText = text || (sticker ? '' : SILENCE_TEXT);

  if (userText) refs.log.append(bubbleMe(userText));
  if (sticker) refs.log.append(stickerMe(sticker));
  if (refs.input) refs.input.value = '';
  if (refs.sendBtn) refs.sendBtn.disabled = true;
  if (refs.stickerBtn) refs.stickerBtn.disabled = true;
  if (refs.input) refs.input.disabled = true;
  scrollLogToBottom();
  blip('send');

  const typing = typingBubble();
  refs.log.append(typing);
  scrollLogToBottom();

  let turn;
  try {
    turn = await generateTurn({
      persona: state.duel.persona,
      duel: state.duel,
      userText,
      userSticker: sticker,
    });
  } catch (err) {
    console.error('[嘴强王者] 生成失败：', err);
    turn = { reply: '……', hitType: 'miss', quip: '', softspot: null, sticker: null };
  }

  typing.remove();

  const { record, result, before } = recordTurn(state.duel, {
    userText,
    aiReply: turn.reply,
    hitType: turn.hitType,
    quip: turn.quip,
    softspot: turn.softspot,
    usedPreset: preset,
    silent: timeout,
    sticker,
    aiSticker: turn.sticker,
  });

  // 玩家中途回了大厅：回合照常记账（上面已入 state.duel），界面等回来再补画
  if (state.screen !== 'duel') {
    if (result) {
      state.duel.result = result;
      // 大厅主卡的「对局进行中」角标是离场快照 —— 胜负落账后刷新掉
      if (state.screen === 'lobby') render();
    }
    state.busy = false;
    return;
  }

  refs.log.append(bubbleAI(turn.reply));
  if (turn.sticker) refs.log.append(stickerAI(turn.sticker));
  if (turn.fallback) refs.log.append(fallbackLine(turn.fallback));
  refs.log.append(quipLine(record));
  updateAngerUI();
  // 跨阶段的一回合（计划书 §4.3/§7.2）：报幕 + 闪红 + 抖头 + 弹胶囊。
  // 出胜负时不算 —— 破防演出本身比阶段切换的戏份更足，别叠着吵
  if (!result && record.stage !== stageOf(before).id) {
    playStageFx(stageOf(state.duel.anger));
  }
  scrollLogToBottom();
  blip(turn.hitType === 'softspot' ? 'softspot' : turn.hitType === 'self_destruct' ? 'self_destruct' : 'reply');

  if (result === 'win') {
    await finish('win');
    return;
  }
  if (result === 'lose') {
    await finish('lose');
    return;
  }
  if (result === 'draw') {
    await finish('draw');
    return;
  }

  state.busy = false;
  if (refs.sendBtn) refs.sendBtn.disabled = false;
  if (refs.stickerBtn) refs.stickerBtn.disabled = false;
  if (refs.input) {
    refs.input.disabled = false;
    refs.input.focus();
  }
  if (refs.roundLabel) {
    refs.roundLabel.textContent = `第 ${currentRound(state.duel)} / ${MAX_ROUNDS} 轮`;
  }
  startTimer();
}

function updateAngerUI() {
  const { duel } = state;
  const stage = stageOf(duel.anger);
  if (refs.angerFill) refs.angerFill.style.width = `${duel.anger}%`;
  if (refs.angerNum) refs.angerNum.textContent = String(duel.anger);
  if (refs.stagePill) {
    refs.stagePill.textContent = stage.label;
    refs.stagePill.className = `stage-pill stage-${stage.id}`;
  }
  if (refs.angerFill) refs.angerFill.dataset.stage = stage.id;
  if (refs.log) refs.log.dataset.stage = stage.id;
}

/**
 * 阶段切换反馈（计划书 §4.3/§7.2）：怒气条闪红、对手头像抖一下、阶段胶囊弹一下，
 * 日志里补一行报幕。报幕是文字通道 —— reduced-motion 把动画全豁免后，它仍可感知。
 */
function playStageFx(stage) {
  if (!refs.log) return;
  refs.log.append(
    h('div', { class: `system-line stage-line stage-${stage.id}`, text: `—— TA 进入「${stage.label}期」 ——` }),
  );
  replayFx(refs.angerFill, 'flash');
  replayFx(refs.headAvatar, 'shake');
  replayFx(refs.stagePill, 'pop');
  scrollLogToBottom();
}

/* ------------------------------------------------------------------ */
/* 破防演出（计划书 §5.3）                                              */
/* ------------------------------------------------------------------ */

/**
 * 胜利演出总入口。灭火局与人设没配 finale 时走通用降级（台词连播 + 安静退场），
 * 所以「专属演出做不完」从来不是选项 —— 数据缺席即降级，永不空窗。
 */
async function playWinFinale() {
  const { duel } = state;
  const persona = duel.persona;
  const isEq = duel.mode === 'extinguish';

  if (isEq || !persona.finale) {
    refs.log.append(
      h('div', { class: 'system-line', text: isEq ? '—— TA 消气了 ——' : '—— 他绷不住了 ——' }),
    );
    for (const line of persona.breakdown) {
      refs.log.append(bubbleAI(line));
      scrollLogToBottom();
      await sleep(420);
      if (state.screen !== 'duel' || !refs.log) return;
    }
    refs.log.append(
      h('div', { class: 'system-line exit', text: isEq ? '对话安静了下来' : '对方已退出群聊' }),
    );
    scrollLogToBottom();
    return;
  }

  refs.log.append(h('div', { class: 'system-line', text: '—— 他绷不住了 ——' }));
  await sleep(350);
  if (state.screen !== 'duel' || !refs.log) return;
  await playFinale(persona.finale);
}

/**
 * 专属演出节拍器：台词在 personas.js（finale.lead/exitLine），编排在这里按 kind 走。
 * 每一步之前都查「玩家还在不在对线屏」—— 演出中途回大厅不追着画。
 */
async function playFinale(finale) {
  const alive = () => state.screen === 'duel' && refs.log;

  if (finale.kind === 'rapid') {
    // 杠精网友：连环短消息轰炸，一条比一条快
    for (const line of finale.lead) {
      const row = bubbleAI(line);
      row.querySelector('.bubble')?.classList.add('burst');
      refs.log.append(row);
      scrollLogToBottom();
      blip('reply');
      await sleep(240);
      if (!alive()) return;
    }
  } else if (finale.kind === 'recall') {
    // 画饼老板：台词铺垫，甩下一句狠话，然后撤回
    for (const line of finale.lead) {
      refs.log.append(bubbleAI(line));
      scrollLogToBottom();
      await sleep(450);
      if (!alive()) return;
    }
    const recalled = bubbleAI(finale.recallText);
    refs.log.append(recalled);
    scrollLogToBottom();
    await sleep(950);
    if (!alive()) return;
    recalled.remove();
  } else if (finale.kind === 'read-none') {
    // 五彩斑斓甲方：说完最后一句，「正在输入…」亮了一会儿又灭了
    for (const line of finale.lead) {
      refs.log.append(bubbleAI(line));
      scrollLogToBottom();
      await sleep(500);
      if (!alive()) return;
    }
    const typing = typingBubble();
    refs.log.append(typing);
    scrollLogToBottom();
    await sleep(1100);
    if (!alive()) return;
    typing.remove();
  } else {
    // 亲戚（quit）/ 摊主（lights-off）：台词正常节奏连播
    for (const line of finale.lead) {
      refs.log.append(bubbleAI(line));
      scrollLogToBottom();
      await sleep(450);
      if (!alive()) return;
    }
  }

  // 退群：头像先灰下去，「对方已退出群聊」才落地
  if (finale.kind === 'quit') refs.duelRoot?.classList.add('ai-gone');
  refs.log.append(h('div', { class: 'system-line exit', text: finale.exitLine }));
  scrollLogToBottom();

  if (finale.kind === 'lights-off') {
    // 收摊：话说完了，摊位的灯才熄 —— 报幕落在全亮时刻，灯暗是句号
    await sleep(450);
    if (!alive()) return;
    refs.duelRoot?.classList.add('lights-off');
    await sleep(1150);
  } else {
    await sleep(650);
  }
}

/** 玩家败北演出：自己最后的气泡灰掉 +「你说不出话了」（计划书 §5.3）。 */
async function playLoseFinale() {
  if (state.duel.mode === 'extinguish') {
    refs.log?.append(h('div', { class: 'system-line', text: '—— 这局没哄好 ——' }));
    scrollLogToBottom();
    return;
  }
  refs.log.append(h('div', { class: 'system-line', text: '—— 你先绷不住了 ——' }));
  const mine = refs.log ? [...refs.log.querySelectorAll('.bubble-me')].pop() : null;
  mine?.classList.add('muted-me');
  scrollLogToBottom();
  await sleep(750);
  if (state.screen !== 'duel' || !refs.log) return;
  refs.log.append(h('div', { class: 'system-line exit', text: '你说不出话了' }));
  scrollLogToBottom();
}

async function finish(result) {
  const { duel } = state;
  duel.result = result;
  stopTimer();

  if (result === 'win') {
    blip('breakdown');
    await playWinFinale();
  } else if (result === 'lose') {
    await playLoseFinale();
  } else {
    refs.log?.append(h('div', { class: 'system-line', text: '—— 八轮打完，谁也没破防 ——' }));
    scrollLogToBottom();
  }

  await sleep(600);
  // 演出中途回了大厅：胜负已记账，别把玩家硬拽进报告（同「离场落账」的哲学）
  if (state.screen !== 'duel') return;
  state.screen = 'report';
  render();
}

/* ------------------------------------------------------------------ */
/* 计时器                                                              */
/* ------------------------------------------------------------------ */

function startTimer() {
  // 不限时的局压根不该有倒计时 —— 0 秒起跳的 interval 会在 1 秒后判超时，
  // 把「等玩家说话」变成「（沉默）」回合连环自动开火
  if (!state.duel || state.duel.roundSeconds <= 0) return;
  stopTimer();
  state.secondsLeft = state.duel.roundSeconds;
  // 新一回合从满秒重新走 —— 上一回合按过的暂停不带到这一回合
  state.timerPaused = false;
  paintTimer();
  updatePauseBtn();
  state.timerId = setInterval(tick, 1000);
}

function tick() {
  state.secondsLeft -= 1;
  paintTimer();
  if (state.secondsLeft <= 0) {
    stopTimer();
    submitTurn('', { timeout: true });
  }
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

/** 打开设置弹窗时暂停倒计时 —— 保留 secondsLeft，别偷偷给玩家回满 30 秒。 */
function pauseTimer() {
  stopTimer();
}

function resumeTimer() {
  if (state.timerId) return;
  if (state.timerPaused) return; // 手动暂停优先：关设置弹窗的自动恢复不许把暂停偷走
  // 不限时的局没倒计时可恢复 —— 这里也给它武装 interval 的话，关一次弹窗就冒（沉默）
  if (state.screen !== 'duel' || !state.duel || state.duel.result || state.duel.roundSeconds <= 0) return;
  state.timerId = setInterval(tick, 1000);
}

/** 暂停按钮：冻结/恢复当前回合的倒计时（只对开了计时的局有意义）。 */
function setPaused(paused) {
  if (!state.duel || state.duel.result || state.duel.roundSeconds <= 0) return;
  state.timerPaused = paused;
  if (paused) {
    stopTimer();
  } else {
    resumeTimer();
  }
  updatePauseBtn();
}

function updatePauseBtn() {
  if (refs.pauseBtn) refs.pauseBtn.textContent = state.timerPaused ? '继续' : '暂停';
}

function paintTimer() {
  if (!refs.timerLabel) return;
  refs.timerLabel.textContent = `${state.secondsLeft}s`;
  refs.timerLabel.classList.toggle('urgent', state.secondsLeft <= 10);
}

/* ------------------------------------------------------------------ */
/* 赛后报告                                                            */
/* ------------------------------------------------------------------ */

const RESULT_COPY = {
  win: { headline: '他破防了', sub: '恭喜，你把对方聊到闭麦。' },
  lose: { headline: '你被反杀', sub: '两次自爆，对面反而占了上风。' },
  draw: { headline: '打平', sub: '八轮打完，谁也没能破防。' },
};

/** 灭火局（情商房）版本：lose 含自爆与超时，没有平局。 */
const EQ_RESULT_COPY = {
  win: { headline: 'TA 消气了', sub: '你把这场架温柔地摁灭了。' },
  lose: { headline: '没哄好', sub: '越哄越炸，或者时间到了。' },
};

function resultCopyOf(duel) {
  if (duel.mode !== 'extinguish') return RESULT_COPY[duel.result] || RESULT_COPY.draw;
  return EQ_RESULT_COPY[duel.result] || EQ_RESULT_COPY.lose;
}

function viewReport() {
  const { duel } = state;
  const title = pickTitle(duel);
  const copy = resultCopyOf(duel);
  const isEq = duel.mode === 'extinguish';
  const labels = isEq ? EQ_HIT_LABELS : HIT_LABELS;
  const hits = uniqueSoftspotHits(duel);

  return h(
    'section',
    { class: `report report-${duel.result}` },
    h(
      'div',
      { class: 'report-head' },
      h('div', { class: `result-badge result-${duel.result}`, text: copy.headline }),
      h('p', { class: 'result-sub', text: copy.sub }),
    ),
    h(
      'div',
      { class: 'title-card' },
      h('span', { class: 'title-rank', text: title.rank }),
      h('div', {},
        h('div', { class: 'title-name', text: title.name }),
        h('p', { class: 'title-desc', text: title.desc }),
      ),
    ),
    h(
      'div',
      { class: 'stats' },
      stat('对手', [
      h('span', { class: 'avatar inline', 'aria-hidden': 'true' },
        h('span', { class: `icon i-${duel.persona.avatar}` }),
      ),
      ` ${duel.persona.name}`,
    ]),
      stat('回合数', `${duel.rounds.length} / ${MAX_ROUNDS}`),
      stat(isEq ? '心结命中' : '软肋命中', `${hits} / ${duel.persona.softspots.length}`),
      stat('自爆次数', `${duel.selfDestructs} / ${MAX_SELF_DESTRUCTS}`),
      stat('最终怒气', `${duel.anger} / 100`),
      stat('引擎', engineLabel()),
    ),
    h('h3', { class: 'section-title', text: '对线回放' }),
    h(
      'ol',
      { class: 'replay' },
      duel.rounds.map((round) => {
        const mine = round.stickerId ? stickerById(round.stickerId) : null;
        const theirs = round.aiStickerId ? stickerById(round.aiStickerId) : null;
        const replayTag = (s) => ` 【${s.emoji} ${s.label}】`;
        return h(
          'li',
          { class: 'replay-item' },
          h('div', { class: 'replay-me', text: `你：${round.userText}${mine ? replayTag(mine) : ''}` }),
          h('div', {
            class: 'replay-ai',
            text: `${duel.persona.name}：${round.aiReply}${theirs ? replayTag(theirs) : ''}`,
          }),
          h(
            'div',
            { class: `replay-tag tag-${round.hitType}` },
            round.hitType === 'softspot'
              ? h('span', { class: 'icon i-target', 'aria-hidden': 'true' })
              : round.hitType === 'self_destruct'
                ? h('span', { class: 'icon i-bolt', 'aria-hidden': 'true' })
                : null,
            `${labels[round.hitType] || '回合'} ${round.delta > 0 ? '+' : ''}${round.delta}`,
          ),
        );
      }),
    ),
    h(
      'div',
      { class: 'report-actions' },
      h('button', { class: 'btn primary', type: 'button', text: '再来一局', onclick: () => startDuel(duel.personaId) }),
      h('button', { class: 'btn', type: 'button', text: '换个对手', onclick: () => goSelect() }),
      h('button', { class: 'btn', type: 'button', text: '返回大厅', onclick: goLobby }),
      h('button', { class: 'btn', type: 'button', text: '保存战绩图', onclick: exportCard }),
    ),
  );
}

function stat(label, value) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h('span', { class: 'stat-value' }, value),
  );
}

function goSelect() {
  state.duel = null;
  state.screen = 'select';
  render();
}

/* ------------------------------------------------------------------ */
/* 战绩图导出：绘制逻辑在 lib/share-card.js（A3 传播化重做）             */
/* ------------------------------------------------------------------ */

function exportCard() {
  const { duel } = state;
  if (!duel) return;
  return exportDuelCard({ duel, copy: resultCopyOf(duel), engine: engineLabel() });
}

/* ------------------------------------------------------------------ */
/* 顶栏                                                                */
/* ------------------------------------------------------------------ */

function repaintEngine() {
  const badge = document.getElementById('engine-badge');
  if (badge) badge.textContent = engineLabel();
}

function openSettingsDialog() {
  openSettings({
    onPause: pauseTimer,
    onResume: resumeTimer,
    onChange: () => {
      repaintEngine();
      // 只有停在大厅/选人屏时才重绘 —— 对线中途重绘会清掉聊天记录
      if (state.screen === 'lobby' || state.screen === 'select') render();
    },
  });
}

function wireTopbar() {
  repaintEngine();

  // 注意：这段必须在下面 sound-toggle 的早退之前，否则声音按钮缺失会连带跳过设置按钮
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsDialog);

  const skinBtn = document.getElementById('skin-btn');
  skinBtn?.addEventListener('click', () => toggleSkinPopover(skinBtn));

  const themeBtn = document.getElementById('theme-toggle');
  themeBtn?.addEventListener('click', toggleTheme);
  onTheme((theme) => {
    if (!themeBtn) return;
    // 浅色时显示月亮（下一步去深色），深色时显示太阳
    themeBtn.replaceChildren(
      h('span', {
        class: `icon ${theme === 'light' ? 'i-dark_mode' : 'i-light_mode'}`,
        'aria-hidden': 'true',
      }),
    );
    themeBtn.setAttribute(
      'aria-label',
      theme === 'light' ? '切换到深色主题' : '切换到浅色主题',
    );
  });

  const toggle = document.getElementById('sound-toggle');
  if (!toggle) return;
  const paint = () => {
    const on = isSoundEnabled();
    toggle.replaceChildren(
      h('span', { class: `icon ${on ? 'i-volume_up' : 'i-volume_off'}`, 'aria-hidden': 'true' }),
      document.createTextNode('声音'),
    );
    toggle.setAttribute('aria-pressed', String(on));
  };
  toggle.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    paint();
    if (isSoundEnabled()) blip('reply');
  });
  paint();
}

initTheme();
initSkin();
wireTopbar();
render();
