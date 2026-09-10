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
import { HIT_LABELS, EQ_HIT_LABELS, SILENCE_TEXT } from './data/fallbacks.js';
import { pickTitle } from './data/titles.js';
import {
  MAX_ROUNDS,
  MAX_SELF_DESTRUCTS,
  ROUND_SECONDS,
  createDuel,
  currentRound,
  recordTurn,
  stageOf,
  uniqueSoftspotHits,
} from './lib/duel-engine.js';
import { engineLabel, generateTurn, isRemote } from './lib/llm.js';
import { blip, isSoundEnabled, setSoundEnabled } from './lib/audio.js';
import { h } from './lib/dom.js';
import { openSettings } from './ui/settings-dialog.js';
import { toggleSkinPopover } from './ui/skin-popover.js';
import { createLibraryView } from './ui/library.js';
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
  secondsLeft: ROUND_SECONDS,
  favorites: loadFavorites(),
  notes: loadNotes(),
};

/** 当前屏幕里需要原地更新的节点。 */
const refs = {};

/* ------------------------------------------------------------------ */
/* DOM 小工具                                                          */
/* ------------------------------------------------------------------ */

function scrollLogToBottom() {
  if (!refs.log) return;
  refs.log.scrollTop = refs.log.scrollHeight;
}

/* ------------------------------------------------------------------ */
/* 渲染入口                                                            */
/* ------------------------------------------------------------------ */

function render() {
  stopTimer();
  for (const key of Object.keys(refs)) delete refs[key];
  screenEl.replaceChildren();

  if (state.screen === 'lobby') screenEl.append(viewLobby());
  else if (state.screen === 'select') screenEl.append(viewSelect());
  else if (state.screen === 'duel') screenEl.append(viewDuel());
  else if (state.screen === 'report') screenEl.append(viewReport());
  else if (state.screen === 'library') screenEl.append(libraryView());
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
      lockedCard('好友擂台', '同一块屏幕，两个人，AI 当裁判。'),
    ),
    h('p', {
      class: 'footnote',
      text: '后面的房间正在装修，先把对面说破防再回来。',
    }),
    isRemote() ? null : connectHint(),
  );
}

/** 未落地模块的卡：可看不可点，不做死链。 */
function lockedCard(name, desc) {
  return h(
    'button',
    { class: 'module-card locked', type: 'button', disabled: true },
    h(
      'div',
      { class: 'module-top' },
      h('span', { class: 'module-name', text: name }),
      h('span', { class: 'module-badge', text: '即将开放' }),
    ),
    h('p', { class: 'module-desc', text: desc }),
  );
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
  state.duel = createDuel(persona);
  state.busy = false;
  state.secondsLeft = ROUND_SECONDS;
  state.screen = 'duel';
  render();
}

function viewDuel() {
  const { duel } = state;
  const persona = duel.persona;
  const stage = stageOf(duel.anger);

  refs.log = h('div', { class: 'log' });
  refs.log.append(bubbleAI(persona.opener));

  for (const round of duel.rounds) {
    refs.log.append(bubbleMe(round.userText));
    refs.log.append(bubbleAI(round.aiReply));
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
  refs.timerLabel = h('span', { class: 'timer-label' });

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
        h('span', { class: 'avatar small' },
          h('span', { class: `icon i-${persona.avatar}`, 'aria-hidden': 'true' }),
        ),
        h('div', {},
          h('div', { class: 'persona-name', text: persona.name }),
          h('div', { class: 'persona-tagline small', text: `「${persona.tagline}」` }),
        ),
      ),
      h('div', { class: 'duel-meta' }, refs.roundLabel, refs.timerLabel),
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
    h('div', { class: 'composer' }, presetRow, h('div', { class: 'input-row' }, refs.input, sendBtn)),
  );

  requestAnimationFrame(() => {
    // 进屏后一帧内就回大厅的话，refs 已被 render() 清空 —— 别碰了
    if (state.screen !== 'duel') return;
    scrollLogToBottom();
    refs.input?.focus();
  });
  // 新开局走满 30s；从大厅续局则接着剩余秒数走，不偷偷回满
  if (state.secondsLeft > 0 && state.secondsLeft < ROUND_SECONDS) {
    paintTimer();
    resumeTimer();
  } else {
    startTimer();
  }
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
  const sign = round.delta > 0 ? '+' : '';
  const tagIcon =
    round.hitType === 'softspot'
      ? h('span', { class: 'icon i-target', 'aria-hidden': 'true' })
      : round.hitType === 'self_destruct'
        ? h('span', { class: 'icon i-bolt', 'aria-hidden': 'true' })
        : null;
  return h(
    'div',
    { class: `quip quip-${round.hitType}` },
    h('span', { class: 'quip-tag' }, tagIcon, labels[round.hitType] || '回合'),
    h('span', { class: 'quip-text', text: `${round.quip || ''} ${sign}${round.delta}` }),
  );
}

/* ------------------------------------------------------------------ */
/* 回合流程                                                            */
/* ------------------------------------------------------------------ */

async function submitTurn(rawText, { preset = false, timeout = false } = {}) {
  if (state.busy || !state.duel || state.duel.result) return;

  const text = String(rawText || '').trim().slice(0, 100);
  if (!text && !timeout) {
    refs.input?.focus();
    return;
  }

  state.busy = true;
  stopTimer();

  const userText = text || SILENCE_TEXT;

  refs.log.append(bubbleMe(userText));
  if (refs.input) refs.input.value = '';
  if (refs.sendBtn) refs.sendBtn.disabled = true;
  if (refs.input) refs.input.disabled = true;
  scrollLogToBottom();
  blip('send');

  const typing = h('div', { class: 'row row-ai' },
    h('span', { class: 'avatar small' },
      h('span', { class: `icon i-${state.duel.persona.avatar}`, 'aria-hidden': 'true' }),
    ),
    h('div', { class: 'bubble bubble-ai typing' }, h('i'), h('i'), h('i')),
  );
  refs.log.append(typing);
  scrollLogToBottom();

  let turn;
  try {
    turn = await generateTurn({ persona: state.duel.persona, duel: state.duel, userText });
  } catch (err) {
    console.error('[嘴强王者] 生成失败：', err);
    turn = { reply: '……', hitType: 'miss', quip: '', softspot: null };
  }

  typing.remove();

  const { record, result } = recordTurn(state.duel, {
    userText,
    aiReply: turn.reply,
    hitType: turn.hitType,
    quip: turn.quip,
    softspot: turn.softspot,
    usedPreset: preset,
    silent: timeout,
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
  if (turn.fallback) refs.log.append(fallbackLine(turn.fallback));
  refs.log.append(quipLine(record));
  updateAngerUI();
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
}

async function finish(result) {
  const { duel } = state;
  const isEq = duel.mode === 'extinguish';
  duel.result = result;
  stopTimer();

  if (result === 'win') {
    blip('breakdown');
    if (isEq) {
      refs.log.append(h('div', { class: 'system-line', text: '—— TA 消气了 ——' }));
      for (const line of duel.persona.breakdown) {
        refs.log.append(bubbleAI(line));
      }
      refs.log.append(h('div', { class: 'system-line', text: '对话安静了下来' }));
    } else {
      refs.log.append(h('div', { class: 'system-line', text: '—— 他绷不住了 ——' }));
      for (const line of duel.persona.breakdown) {
        refs.log.append(bubbleAI(line));
      }
      refs.log.append(h('div', { class: 'system-line', text: '对方已退出群聊' }));
    }
  } else if (result === 'lose') {
    if (isEq) {
      refs.log.append(h('div', { class: 'system-line', text: '—— 这局没哄好 ——' }));
    } else {
      refs.log.append(h('div', { class: 'system-line', text: '—— 你先绷不住了 ——' }));
      refs.log.append(h('div', { class: 'system-line', text: '你被反杀了' }));
    }
  } else {
    refs.log.append(h('div', { class: 'system-line', text: '—— 八轮打完，谁也没破防 ——' }));
  }
  scrollLogToBottom();

  await new Promise((r) => setTimeout(r, 1400));
  state.screen = 'report';
  render();
}

/* ------------------------------------------------------------------ */
/* 计时器                                                              */
/* ------------------------------------------------------------------ */

function startTimer() {
  stopTimer();
  state.secondsLeft = ROUND_SECONDS;
  paintTimer();
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
  if (state.screen !== 'duel' || !state.duel || state.duel.result) return;
  state.timerId = setInterval(tick, 1000);
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
      duel.rounds.map((round) =>
        h(
          'li',
          { class: 'replay-item' },
          h('div', { class: 'replay-me', text: `你：${round.userText}` }),
          h('div', { class: 'replay-ai', text: `${duel.persona.name}：${round.aiReply}` }),
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
        ),
      ),
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
/* 战绩图导出                                                          */
/* ------------------------------------------------------------------ */

function exportCard() {
  const { duel } = state;
  if (!duel) return;
  const title = pickTitle(duel);
  const copy = resultCopyOf(duel);
  const isEq = duel.mode === 'extinguish';

  const W = 720;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // 跟着当前主题走：颜色全部读 CSS 令牌，别在这里再写死一套
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const C = {
    bg: token('--canvas-bg'),
    bar: token('--stage-breakdown'),
    muted: token('--muted'),
    text: token('--text'),
    card: token('--surface-deep'),
    rank: token('--accent-strong'),
  };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.bar;
  ctx.fillRect(0, 0, W, 8);

  ctx.fillStyle = C.muted;
  ctx.font = '20px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('嘴强王者 · TALK KING', 60, 90);

  ctx.fillStyle = C.text;
  ctx.font = 'bold 56px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(copy.headline, 60, 190);

  ctx.fillStyle = C.muted;
  ctx.font = '24px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`对手：${duel.persona.name}`, 60, 240);

  ctx.fillStyle = C.card;
  ctx.fillRect(60, 290, W - 120, 190);
  ctx.fillStyle = C.rank;
  ctx.font = 'bold 22px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title.rank, 90, 340);
  ctx.fillStyle = C.text;
  ctx.font = 'bold 40px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title.name, 90, 395);
  ctx.fillStyle = C.muted;
  ctx.font = '20px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(ctx, title.desc, 90, 435, W - 220, 28);

  const rows = [
    ['回合数', `${duel.rounds.length} / ${MAX_ROUNDS}`],
    ['软肋命中', `${uniqueSoftspotHits(duel)} / ${duel.persona.softspots.length}`],
    ['自爆次数', `${duel.selfDestructs} / ${MAX_SELF_DESTRUCTS}`],
    ['最终怒气', `${duel.anger} / 100`],
  ];
  const exportRows = isEq ? rows.map((r) => (r[0] === '软肋命中' ? ['心结命中', r[1]] : r)) : rows;
  let y = 550;
  ctx.font = '24px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  for (const [label, value] of exportRows) {
    ctx.fillStyle = C.muted;
    ctx.fillText(label, 60, y);
    ctx.fillStyle = C.text;
    ctx.fillText(value, 300, y);
    y += 52;
  }

  ctx.fillStyle = C.muted;
  ctx.font = '20px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(ctx, '软肋这东西，人人都有一根。', 60, 880, W - 120, 30);
  ctx.fillText(`引擎：${engineLabel()}`, 60, 950);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `嘴强王者-${title.name}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  let cursorY = y;
  for (const char of String(text)) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
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
