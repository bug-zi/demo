/**
 * 好友擂台视图：同 settings-dialog.js / library.js 的自包含定位。
 * main.js 挂载：createArenaView({ onBack, openSettings }) → { root, dispose }。
 *
 * 相位机在闭包：intro → scene(先答) → handoff → scene(后答) → judging → reveal
 *              →（还有轮：回 scene ｜ 打完了：judging → recap）。
 * 整相位重绘（root.replaceChildren）——相位内没有需要保焦的局部输入重绘。
 *
 * 两条硬约束：
 *   - 交接屏防偷看：handoff 相位是全新子树，上一份答案天然不在 DOM 里；
 *   - 离场即弃局：dispose() 清答题倒计时的 interval、置 disposed，
 *     在途的 AI 评分回来也不许再碰已脱离的节点（不留幽灵计时器 / 幽灵重绘）。
 *
 * 渲染铁律：全部经 h() 的 textContent，绝不拼 HTML。
 * 样式在 ./arena.css，由 index.html 以 <link> 加载（同 library.css 先例）。
 */
import { backBtn, h } from '../lib/dom.js';
import { SCENARIOS } from '../data/scenarios.js';
import { blip } from '../lib/audio.js';
import {
  ARENA_ANSWER_SECONDS,
  ARENA_MAX_CHARS,
  createArena,
  firstPlayerOf,
  recordAnswer,
  recordScores,
  arenaResult,
  arenaTotals,
} from '../lib/arena.js';
import { judgeArenaRound, arenaRecap } from '../lib/llm.js';

const other = (p) => (p === 'p1' ? 'p2' : 'p1');
const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);

export function createArenaView({ onBack, openSettings, onArenaEnd }) {
  const root = h('section', { class: 'arena' });

  let disposed = false;
  let phase = 'intro'; // intro | scene | handoff | judging | reveal | recap
  let arena = null;    // 引擎整场状态；null = 还在 intro
  let answering = 'p1'; // scene 相位正在作答的人
  let lastVerdict = null; // reveal 相位要展示的本轮评分（fallback 原因也在这里）
  let ended = false;   // 终盘入账只报一次（onArenaEnd）
  let timerId = null;
  let secondsLeft = 0;
  const ui = {}; // 当前相位需要原地更新的节点（timer / input）

  /** 终盘一次性上报：win 按设备档口径记「分出胜负」（hot-seat 无主客，平局不算胜）。 */
  function reportEnd(recap) {
    if (ended || !onArenaEnd) return;
    ended = true;
    const result = arenaResult(arena);
    const best = arena.scores.reduce(
      (acc, r) => Math.max(acc, r.p1.score, r.p2.score),
      0,
    );
    onArenaEnd({ win: result.winner !== 'draw', bestRound: best, recap: !!recap });
  }

  /* ---- 计时器：只在 scene 相位活着，dispose 一律清 ---- */

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function paintTimer() {
    if (!ui.timer) return;
    ui.timer.textContent = `${secondsLeft}s`;
    ui.timer.classList.toggle('urgent', secondsLeft <= 10);
  }

  function startTimer() {
    stopTimer();
    secondsLeft = ARENA_ANSWER_SECONDS;
    paintTimer();
    timerId = setInterval(() => {
      secondsLeft -= 1;
      paintTimer();
      if (secondsLeft <= 0) {
        stopTimer();
        submitAnswer({ timeout: true }); // 到点自动交卷：有字交字，没字记弃权
      }
    }, 1000);
  }

  /* ---- 相位 ---- */

  function paintIntro() {
    phase = 'intro';
    arena = null;
    lastVerdict = null;
    ended = false; // 再来一局是新的一账
    stopTimer();
    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'div',
        { class: 'arena-head' },
        h('h1', { class: 'hero-title', text: '好友擂台' }),
        h('p', { class: 'hero-sub', text: '同一块屏幕，两个人，AI 当裁判。' }),
      ),
      h(
        'div',
        { class: 'arena-intro' },
        h(
          'div',
          { class: 'arena-rules' },
          h('p', { class: 'arena-rule', text: `① 每轮抽一张高压场景，两人先后作答（先答权轮换）` }),
          h('p', { class: 'arena-rule', text: `② 每答限时 ${ARENA_ANSWER_SECONDS} 秒，答完交接收起，别偷看` }),
          h('p', { class: 'arena-rule', text: '③ AI 评委逐轮打 0-10 分，三轮终盘复盘、评出金句' }),
        ),
        h(
          'div',
          { class: 'arena-players' },
          h('input', { class: 'arena-name-input', type: 'text', maxlength: '10', value: '玩家一', 'aria-label': '玩家一的名字' }),
          h('span', { class: 'arena-vs', text: 'VS' }),
          h('input', { class: 'arena-name-input', type: 'text', maxlength: '10', value: '玩家二', 'aria-label': '玩家二的名字' }),
        ),
        h(
          'div',
          { class: 'arena-actions' },
          h('button', { class: 'btn primary arena-start', type: 'button', text: '开始对战', onclick: startMatch }),
        ),
      ),
    );
  }

  function startMatch() {
    const inputs = [...root.querySelectorAll('.arena-name-input')];
    const pickName = (el, fallback) => (el?.value || '').trim().slice(0, 10) || fallback;
    const names = {
      p1: pickName(inputs[0], '玩家一'),
      p2: pickName(inputs[1], '玩家二'),
    };
    arena = createArena({ scenarios: SCENARIOS, names });
    paintScene();
  }

  /** 当前是第几轮（0 起）＝ 已落账的轮数。 */
  const currentRound = () => arena.scores.length;

  /** 本轮该谁作答：两边答数一样＝先答者还没答；不一样＝轮到后答者。 */
  function answeringNow() {
    const r = currentRound();
    return arena.answers.p1.length === arena.answers.p2.length ? firstPlayerOf(r) : other(firstPlayerOf(r));
  }

  function paintScene() {
    phase = 'scene';
    answering = answeringNow();
    const r = currentRound();
    const scenario = scenarioById(arena.scenarioIds[r]);

    ui.input = h('textarea', {
      class: 'arena-input',
      rows: '3',
      maxlength: String(ARENA_MAX_CHARS),
      placeholder: '你怎么接这句话？（Enter 交卷，Shift+Enter 换行）',
    });
    ui.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitAnswer({});
      }
    });
    ui.timer = h('span', { class: 'arena-timer', text: `${ARENA_ANSWER_SECONDS}s` });

    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'div',
        { class: 'arena-head' },
        h('h1', { class: 'hero-title', text: '好友擂台' }),
        h('p', { class: 'hero-sub', text: `第 ${r + 1} / ${arena.roundCount} 轮` }),
      ),
      h(
        'section',
        { class: 'arena-round' },
        h(
          'div',
          { class: 'arena-round-meta' },
          h('span', { class: 'round-chip', text: `第 ${r + 1} / ${arena.roundCount} 轮` }),
          h('span', { class: 'answerer-chip', text: `正在作答：${arena.names[answering]}` }),
        ),
        // 场景卡只亮 title/setup/line —— hint/keywords/traps 是评分口径，亮出来就是送分题
        h(
          'article',
          { class: 'scenario-card' },
          h('h2', { class: 'scenario-title', text: scenario.title }),
          h('p', { class: 'scenario-setup', text: scenario.setup }),
          h('p', { class: 'scenario-line', text: scenario.line }),
        ),
        h(
          'div',
          { class: 'answer-pane' },
          ui.input,
          h(
            'div',
            { class: 'answer-row' },
            ui.timer,
            h('button', { class: 'btn primary arena-send', type: 'button', text: '就这么回', onclick: () => submitAnswer({}) }),
          ),
        ),
      ),
    );
    startTimer();
  }

  function submitAnswer({ timeout = false } = {}) {
    if (phase !== 'scene') return; // 评分中/交接中的迟到回车不许再交卷
    const text = (ui.input?.value ?? '').trim();
    if (!text && !timeout) {
      ui.input?.focus();
      return;
    }
    stopTimer();
    blip('send');
    recordAnswer(arena, answering, text);

    if (answering === firstPlayerOf(currentRound())) {
      paintHandoff(other(answering));
    } else {
      judgeRound();
    }
  }

  function paintHandoff(nextPlayer) {
    phase = 'handoff';
    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'div',
        { class: 'arena-head' },
        h('h1', { class: 'hero-title', text: '好友擂台' }),
        h('p', { class: 'hero-sub', text: `第 ${currentRound() + 1} / ${arena.roundCount} 轮` }),
      ),
      h(
        'section',
        { class: 'arena-handoff' },
        h('p', { class: 'handoff-lead', text: '请把设备交给' }),
        h('p', { class: 'handoff-name', text: arena.names[nextPlayer] }),
        h('p', { class: 'handoff-note', text: '上一份答案已封存，别偷看。' }),
        h('button', { class: 'btn primary handoff-btn', type: 'button', text: '我坐好了，开始', onclick: paintScene }),
      ),
    );
  }

  async function judgeRound() {
    phase = 'judging';
    paintJudging('AI 评委正在打分…');
    const r = currentRound();
    try {
      const verdict = await judgeArenaRound({
        scenario: scenarioById(arena.scenarioIds[r]),
        names: arena.names,
        answers: { p1: arena.answers.p1[r], p2: arena.answers.p2[r] },
      });
      if (disposed) return; // 比赛已散场：评分照收但不许再碰界面
      lastVerdict = verdict;
      recordScores(arena, verdict);
      blip('reply');
      paintReveal();
    } catch (err) {
      console.error('[好友擂台] 评分彻底失败（本地兜底也没接住）：', err);
      if (disposed) return;
      // 理论上到不了：llm 层已兜底。真到了就给 0:0 粗评，比赛继续不卡死。
      lastVerdict = {
        p1: { score: 0, comment: '粗评：评委罢工了。', source: 'local' },
        p2: { score: 0, comment: '粗评：评委罢工了。', source: 'local' },
        source: 'local',
        fallback: '评分链路异常',
      };
      recordScores(arena, lastVerdict);
      paintReveal();
    }
  }

  function paintJudging(line) {
    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'div',
        { class: 'arena-head' },
        h('h1', { class: 'hero-title', text: '好友擂台' }),
        h('p', { class: 'hero-sub', text: `第 ${Math.min(currentRound() + 1, arena.roundCount)} / ${arena.roundCount} 轮` }),
      ),
      h(
        'section',
        { class: 'arena-judging' },
        h('p', { class: 'judging-line', text: line }),
        h('div', { class: 'thinking', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      ),
    );
  }

  function fallbackLine(reason) {
    return h(
      'div',
      { class: 'fallback-line' },
      h('span', { class: 'fallback-tag', text: '本地兜底' }),
      h('span', { text: `真实 AI 没接上：${reason}` }),
    );
  }

  function paintReveal() {
    phase = 'reveal';
    const sv = arena.scores[arena.scores.length - 1]; // 本轮刚落账的评分
    const r = sv.round - 1;
    const lead = sv.p1.score === sv.p2.score ? null : sv.p1.score > sv.p2.score ? 'p1' : 'p2';
    const done = arenaResult(arena);

    const card = (p) =>
      h(
        'article',
        { class: `reveal-card${lead === p ? ' lead' : ''}` },
        h('div', { class: 'reveal-name', text: arena.names[p] }),
        h('p', { class: 'reveal-text', text: arena.answers[p][r] || '（弃权）' }),
        h('div', { class: 'reveal-score', text: String(sv[p].score) }),
        h('p', { class: 'reveal-comment', text: sv[p].comment }),
      );

    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'div',
        { class: 'arena-head' },
        h('h1', { class: 'hero-title', text: '好友擂台' }),
        h('p', { class: 'hero-sub', text: `第 ${sv.round} / ${arena.roundCount} 轮 · 战报` }),
      ),
      h(
        'section',
        { class: 'arena-reveal' },
        h('div', { class: 'reveal-cards' }, card('p1'), card('p2')),
        lastVerdict?.fallback ? fallbackLine(lastVerdict.fallback) : null,
        h(
          'div',
          { class: 'arena-actions' },
          h('button', {
            class: 'btn primary arena-next',
            type: 'button',
            text: done ? '看终盘复盘' : '下一轮',
            onclick: done ? gotoRecap : paintScene,
          }),
        ),
      ),
    );
  }

  async function gotoRecap() {
    phase = 'judging';
    paintJudging('AI 评委正在写终盘复盘…');
    try {
      const recap = await arenaRecap({ arena, scenarios: SCENARIOS });
      if (disposed) return;
      paintRecap(recap);
    } catch (err) {
      console.error('[好友擂台] 复盘彻底失败（本地兜底也没接住）：', err);
      if (disposed) return;
      paintRecap(null);
    }
  }

  function paintRecap(recap) {
    phase = 'recap';
    reportEnd(recap);
    const result = arenaResult(arena);
    const totals = arenaTotals(arena);
    const winnerLine =
      result.winner === 'draw' ? '打平 · 菜鸡互啄' : `${arena.names[result.winner]} 胜出`;

    const rows = arena.scores.map((r) =>
      h('div', { class: 'recap-round-row', text: `第 ${r.round} 轮　${arena.names.p1} ${r.p1.score} : ${r.p2.score} ${arena.names.p2}` }),
    );

    const golden = recap?.golden
      ? h(
          'div',
          { class: 'golden-card' },
          h('span', { class: 'golden-tag', text: '全场金句' }),
          h('p', { class: 'golden-quote', text: `${arena.names[recap.golden.player]}：「${recap.golden.quote}」` }),
          h('p', { class: 'golden-why', text: recap.golden.why }),
        )
      : null;

    root.replaceChildren(
      backBtn('大厅', onBack),
      h(
        'section',
        { class: 'arena-recap' },
        h('p', { class: 'recap-winner', text: winnerLine }),
        h('p', { class: 'recap-totals', text: `${arena.names.p1} ${totals.p1} ： ${totals.p2} ${arena.names.p2}` }),
        h('div', { class: 'recap-rounds' }, rows),
        golden,
        recap
          ? h(
              'div',
              { class: 'recap-comments' },
              h('p', { class: 'recap-comment', text: `${arena.names.p1}：${recap.p1Comment}` }),
              h('p', { class: 'recap-comment', text: `${arena.names.p2}：${recap.p2Comment}` }),
              h('p', { class: 'recap-summary', text: recap.summary }),
            )
          : null,
        recap?.fallback ? fallbackLine(recap.fallback) : null,
        recap?.source === 'local'
          ? h(
              'div',
              { class: 'arena-hint' },
              h('span', { text: '未接入 AI：本场为本地粗评。' }),
              h('button', { class: 'hint-btn', type: 'button', text: '接入你的 AI →', onclick: openSettings }),
            )
          : null,
        h(
          'div',
          { class: 'arena-actions' },
          h('button', { class: 'btn primary arena-again', type: 'button', text: '再来一局', onclick: paintIntro }),
          h('button', { class: 'btn', type: 'button', text: '返回大厅', onclick: onBack }),
        ),
      ),
    );
  }

  /** 销毁：清掉答题倒计时，之后任何在途回调都变 no-op。main.js 每次重绘前调。 */
  function dispose() {
    disposed = true;
    stopTimer();
  }

  paintIntro();
  return { root, dispose };
}
