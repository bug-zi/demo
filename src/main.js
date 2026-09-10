/**
 * 杠精陪练房 · 主状态机
 *
 * PERSONA_SELECT → DUEL(1..8) → REPORT → PERSONA_SELECT
 *
 * 所有模型产出都走 textContent 落地，绝不拼 HTML（见计划书 §6.5）。
 */

import { PERSONAS, getPersona } from './data/personas.js';
import { HIT_LABELS, SILENCE_TEXT } from './data/fallbacks.js';
import { pickTitle } from './data/titles.js';
import {
  MAX_ROUNDS,
  MAX_SELF_DESTRUCTS,
  createDuel,
  currentRound,
  recordTurn,
  stageOf,
  uniqueSoftspotHits,
} from './lib/duel-engine.js';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  getDifficulty,
  secondsOf,
} from './data/difficulty.js';
import { engineLabel, generateTurn, isRemote } from './lib/llm.js';
import { blip, isSoundEnabled, setSoundEnabled } from './lib/audio.js';
import {
  applyTheme,
  initTheme,
  loadTheme,
  nextTheme,
  paintThemeButton,
  saveTheme,
} from './lib/theme.js';
import { h } from './lib/dom.js';
import { openSettings } from './ui/settings-dialog.js';

const screenEl = document.getElementById('screen');

const state = {
  screen: 'select',
  duel: null,
  busy: false,
  timerId: null,
  difficulty: DEFAULT_DIFFICULTY,
  secondsLeft: secondsOf(DEFAULT_DIFFICULTY),
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

  if (state.screen === 'select') screenEl.append(viewSelect());
  else if (state.screen === 'duel') screenEl.append(viewDuel());
  else if (state.screen === 'report') screenEl.append(viewReport());
}

/* ------------------------------------------------------------------ */
/* 选人屏                                                              */
/* ------------------------------------------------------------------ */

function viewSelect() {
  return h(
    'section',
    { class: 'select' },
    h(
      'div',
      { class: 'select-head' },
      h('h1', { class: 'hero-title', text: '把对面说破防' }),
      h('p', {
        class: 'hero-sub',
        text: '选一个对手。你的目标不是把道理讲赢——是让他先绷不住。',
      }),
    ),
    difficultyControl(),
    h('div', { class: 'persona-grid' }, PERSONAS.map(personaCard)),
    h('p', {
      class: 'footnote',
      text: '每个人都有软肋，藏着的那种。但话说太冲，先破防的可能是你自己。',
    }),
    isRemote() ? null : connectHint(),
  );
}

/**
 * 难度选择器：只改每回合的输入时限，不动胜负规则。
 * 原地切 class 而不是重绘整屏 —— 重绘会把选人屏的滚动位置抖一下。
 */
function difficultyControl() {
  const note = h('p', { class: 'diff-note' });

  const paintNote = () => {
    const { seconds, note: text } = getDifficulty(state.difficulty);
    note.textContent = `每回合 ${seconds} 秒 —— ${text}`;
  };

  const buttons = DIFFICULTIES.map((item) =>
    h('button', {
      class: `seg-btn${state.difficulty === item.id ? ' is-active' : ''}`,
      type: 'button',
      text: `${item.label} ${item.seconds}s`,
      'aria-pressed': String(state.difficulty === item.id),
      onclick: () => {
        if (state.difficulty === item.id) return;
        state.difficulty = item.id;
        DIFFICULTIES.forEach((d, index) => {
          const active = d.id === item.id;
          buttons[index].classList.toggle('is-active', active);
          buttons[index].setAttribute('aria-pressed', String(active));
        });
        paintNote();
        blip('reply');
      },
    }),
  );

  paintNote();
  return h(
    'div',
    { class: 'diff' },
    h('span', { class: 'diff-head', text: '难度' }),
    h('div', { class: 'segmented diff-seg' }, buttons),
    note,
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
      h('span', { class: 'persona-avatar', text: persona.avatar }),
      h(
        'div',
        { class: 'persona-id' },
        h('div', { class: 'persona-name', text: persona.name }),
        h('div', {
          class: 'persona-stars',
          text: '★'.repeat(persona.difficulty) + '☆'.repeat(5 - persona.difficulty),
        }),
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
  state.secondsLeft = secondsOf(state.difficulty);
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

  refs.angerFill = h('div', { class: 'anger-fill', style: `width:${duel.anger}%` });
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
      h(
        'div',
        { class: 'duel-who' },
        h('span', { class: 'persona-avatar small', text: persona.avatar }),
        h('div', {},
          h('div', { class: 'persona-name', text: persona.name }),
          h('div', { class: 'persona-tagline small', text: `「${persona.tagline}」` }),
        ),
      ),
      h(
        'div',
        { class: 'duel-meta' },
        h('span', { class: 'diff-pill', text: getDifficulty(state.difficulty).label }),
        refs.roundLabel,
        refs.timerLabel,
      ),
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
    scrollLogToBottom();
    refs.input.focus();
  });
  startTimer();
  return root;
}

function bubbleAI(text) {
  const { duel } = state;
  return h(
    'div',
    { class: 'row row-ai' },
    h('span', { class: 'avatar-bubble', text: duel.persona.avatar }),
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
  const sign = round.delta > 0 ? '+' : '';
  return h(
    'div',
    { class: `quip quip-${round.hitType}` },
    h('span', { class: 'quip-tag', text: HIT_LABELS[round.hitType] || '回合' }),
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
    h('span', { class: 'avatar-bubble', text: state.duel.persona.avatar }),
    h('div', { class: 'bubble bubble-ai typing' }, h('i'), h('i'), h('i')),
  );
  refs.log.append(typing);
  scrollLogToBottom();

  let turn;
  try {
    turn = await generateTurn({ persona: state.duel.persona, duel: state.duel, userText });
  } catch (err) {
    console.error('[杠精陪练房] 生成失败：', err);
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
  // 颜色交给 CSS 变量 —— 换主题时怒气条要跟着变
  if (refs.angerFill) refs.angerFill.style.background = `var(--stage-${stage.id})`;
}

async function finish(result) {
  const { duel } = state;
  duel.result = result;
  stopTimer();

  if (result === 'win') {
    blip('breakdown');
    refs.log.append(h('div', { class: 'system-line', text: '—— 他绷不住了 ——' }));
    for (const line of duel.persona.breakdown) {
      refs.log.append(bubbleAI(line));
    }
    refs.log.append(h('div', { class: 'system-line', text: '对方已退出群聊' }));
  } else if (result === 'lose') {
    refs.log.append(h('div', { class: 'system-line', text: '—— 你先绷不住了 ——' }));
    refs.log.append(h('div', { class: 'system-line', text: '你被反杀了' }));
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
  state.secondsLeft = secondsOf(state.difficulty);
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

/** 打开设置弹窗时暂停倒计时 —— 保留 secondsLeft，别偷偷给玩家回满这一回合。 */
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

function viewReport() {
  const { duel } = state;
  const title = pickTitle(duel);
  const copy = RESULT_COPY[duel.result] || RESULT_COPY.draw;
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
      stat('对手', `${duel.persona.avatar} ${duel.persona.name}`),
      stat('回合数', `${duel.rounds.length} / ${MAX_ROUNDS}`),
      stat(
        '难度',
        `${getDifficulty(state.difficulty).label}（${secondsOf(state.difficulty)}s）`,
      ),
      stat('软肋命中', `${hits} / ${duel.persona.softspots.length}`),
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
            `${HIT_LABELS[round.hitType] || '回合'} ${round.delta > 0 ? '+' : ''}${round.delta}`,
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'report-actions' },
      h('button', { class: 'btn primary', type: 'button', text: '再来一局', onclick: () => startDuel(duel.personaId) }),
      h('button', { class: 'btn', type: 'button', text: '换个对手', onclick: () => goSelect() }),
      h('button', { class: 'btn', type: 'button', text: '保存战绩图', onclick: exportCard }),
    ),
  );
}

function stat(label, value) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h('span', { class: 'stat-value', text: value }),
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

/** 读一个 CSS 变量的当前值（会跟着 data-theme 变）。canvas 里画图用得上。 */
function cssVar(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || '#000000';
}

function exportCard() {
  const { duel } = state;
  if (!duel) return;
  const title = pickTitle(duel);
  const copy = RESULT_COPY[duel.result] || RESULT_COPY.draw;

  const W = 720;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // 直接从 CSS 变量取色，跟着当前主题走 —— 别在这儿再抄一份色值，加了主题就会对不上
  const ink = {
    bg: cssVar('--bg'),
    panel: cssVar('--panel-2'),
    text: cssVar('--text'),
    muted: cssVar('--muted'),
    accent: cssVar('--accent'),
    anger: cssVar('--anger'),
  };
  const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';

  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ink.anger;
  ctx.fillRect(0, 0, W, 8);

  ctx.fillStyle = ink.muted;
  ctx.font = `20px ${FONT}`;
  ctx.fillText('杠精陪练房 · GANG.AI', 60, 90);

  ctx.fillStyle = ink.text;
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText(copy.headline, 60, 190);

  ctx.fillStyle = ink.muted;
  ctx.font = `24px ${FONT}`;
  ctx.fillText(`对手：${duel.persona.name}`, 60, 240);

  ctx.fillStyle = ink.panel;
  ctx.fillRect(60, 290, W - 120, 190);
  ctx.fillStyle = ink.accent;
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(title.rank, 90, 340);
  ctx.fillStyle = ink.text;
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(title.name, 90, 395);
  ctx.fillStyle = ink.muted;
  ctx.font = `20px ${FONT}`;
  wrapText(ctx, title.desc, 90, 435, W - 220, 28);

  const rows = [
    ['回合数', `${duel.rounds.length} / ${MAX_ROUNDS}`],
    ['难度', `${getDifficulty(state.difficulty).label}（${secondsOf(state.difficulty)}s）`],
    ['软肋命中', `${uniqueSoftspotHits(duel)} / ${duel.persona.softspots.length}`],
    ['自爆次数', `${duel.selfDestructs} / ${MAX_SELF_DESTRUCTS}`],
    ['最终怒气', `${duel.anger} / 100`],
  ];
  let y = 550;
  ctx.font = `24px ${FONT}`;
  for (const [label, value] of rows) {
    ctx.fillStyle = ink.muted;
    ctx.fillText(label, 60, y);
    ctx.fillStyle = ink.text;
    ctx.fillText(value, 300, y);
    y += 52;
  }

  ctx.fillStyle = ink.muted;
  ctx.font = `20px ${FONT}`;
  wrapText(ctx, '软肋这东西，人人都有一根。', 60, 920, W - 120, 30);
  ctx.fillText(`引擎：${engineLabel()}`, 60, 960);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `杠精陪练房-${title.name}.png`;
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
      // 只有停在选人屏时才重绘 —— 对线中途重绘会清掉聊天记录
      if (state.screen === 'select') render();
    },
  });
}

function wireTopbar() {
  repaintEngine();

  // 注意：这段必须在下面 sound-toggle 的早退之前，否则声音按钮缺失会连带跳过设置按钮
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsDialog);

  const themeBtn = document.getElementById('theme-btn');
  initTheme(themeBtn);
  themeBtn?.addEventListener('click', () => {
    const theme = applyTheme(saveTheme(nextTheme(loadTheme())));
    paintThemeButton(themeBtn, theme);
    blip('reply');
  });

  const toggle = document.getElementById('sound-toggle');
  if (!toggle) return;
  const paint = () => {
    toggle.textContent = isSoundEnabled() ? '🔊 声音' : '🔇 声音';
    toggle.setAttribute('aria-pressed', String(isSoundEnabled()));
  };
  toggle.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    paint();
    if (isSoundEnabled()) blip('reply');
  });
  paint();
}

wireTopbar();
render();
