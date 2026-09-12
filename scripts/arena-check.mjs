// 好友擂台检查：数据 / 引擎 / 评分适配 / 视图（jsdom，不 import main.js）。
// 用法：npm run arena-check
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.localStorage = window.localStorage;

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 1. 数据层 scenarios.js                                               */
/* ------------------------------------------------------------------ */

const { SCENARIOS, GENERIC_TRAPS } = await import('../src/data/scenarios.js');

if (!Array.isArray(SCENARIOS) || SCENARIOS.length < 5) {
  fail(`场景卡应 ≥5 张（spec 定 8），实际 ${SCENARIOS?.length}`);
}
if (SCENARIOS.length !== 8) fail(`按 spec 应恰 8 张场景卡，实际 ${SCENARIOS.length}`);
const ids = SCENARIOS.map((s) => s.id);
if (new Set(ids).size !== ids.length) fail('场景卡 id 必须唯一');
for (const s of SCENARIOS) {
  for (const field of ['id', 'title', 'setup', 'line', 'hint']) {
    if (typeof s[field] !== 'string' || !s[field].trim()) fail(`${s.id}.${field} 应为非空字符串`);
  }
  if (!Array.isArray(s.keywords) || s.keywords.length < 3) fail(`${s.id}.keywords 应 ≥3 条`);
  if (!Array.isArray(s.traps) || s.traps.length < 1) fail(`${s.id}.traps 应 ≥1 条`);
  for (const k of [...(s.keywords ?? []), ...(s.traps ?? [])]) {
    if (typeof k !== 'string' || !k.trim()) fail(`${s.id} 的keywords/traps 内有非字符串项`);
  }
}
if (!Array.isArray(GENERIC_TRAPS) || GENERIC_TRAPS.length < 4 || GENERIC_TRAPS.some((t) => !String(t).trim())) {
  fail('GENERIC_TRAPS 应为 ≥4 个非空字符串');
}
// 分点词不得撞题面：抄 title/setup/line 里的原词不该白得分（否则玩家复述场景就命中粗评关键词）
for (const s of SCENARIOS) {
  const copy = s.title + s.setup + s.line;
  for (const kw of s.keywords) {
    if (copy.includes(kw)) fail(`「${s.title}」的题面自带关键词「${kw}」—— 换一个只有好答案才会说的说法`);
  }
  for (const tr of s.traps) {
    if (copy.includes(tr)) fail(`「${s.title}」的题面自带雷词「${tr}」`);
  }
}
console.log(`✓ 数据层：8 张场景卡 schema 全过（${SCENARIOS.map((s) => s.title).join(' / ')}）`);

/* ------------------------------------------------------------------ */
/* 2. 引擎层 arena.js                                                   */
/* ------------------------------------------------------------------ */

const {
  ARENA_ROUNDS,
  ARENA_ANSWER_SECONDS,
  ARENA_MAX_CHARS,
  drawScenarios,
  createArena,
  firstPlayerOf,
  recordAnswer,
  recordScores,
  arenaTotals,
  arenaResult,
  localScore,
  localRecap,
} = await import('../src/lib/arena.js');

if (ARENA_ROUNDS !== 3) fail(`ARENA_ROUNDS 应为 3，实际 ${ARENA_ROUNDS}`);
if (ARENA_ANSWER_SECONDS !== 60) fail(`ARENA_ANSWER_SECONDS 应为 60，实际 ${ARENA_ANSWER_SECONDS}`);
if (ARENA_MAX_CHARS < 80) fail('ARENA_MAX_CHARS 应给足作答空间（≥80）');

// 抽卡：注入 rand=0 的部分洗牌 → 依序取前三张，不重复
const drawn0 = drawScenarios(SCENARIOS, 3, () => 0);
if (drawn0.map((s) => s.id).join(',') !== ids.slice(0, 3).join(',')) {
  fail('rand=0 应依序抽前三张：' + drawn0.map((s) => s.id).join(','));
}
if (new Set(drawn0.map((s) => s.id)).size !== 3) fail('抽出的场景卡不应重复');

// 建局 + 先答权轮换
const names = { p1: '甲', p2: '乙' };
const game = createArena({ scenarios: SCENARIOS, names, rand: () => 0 });
if (game.roundCount !== ARENA_ROUNDS) fail('默认 roundCount 应为 3');
if (game.scenarioIds.length !== ARENA_ROUNDS) fail('建局应预抽 3 张场景');
if (game.names.p1 !== '甲' || game.names.p2 !== '乙') fail('建局应保存双方名字');
if (firstPlayerOf(0) !== 'p1' || firstPlayerOf(1) !== 'p2' || firstPlayerOf(2) !== 'p1') {
  fail('先答权应轮换：p1 → p2 → p1');
}

// 记答：trim、空答照记（弃权）
recordAnswer(game, 'p1', '  你好  ');
if (game.answers.p1[0] !== '你好') fail(`recordAnswer 应 trim，实际「${game.answers.p1[0]}」`);
recordAnswer(game, 'p1', '   ');
if (game.answers.p1[1] !== '') fail('空白作答应记为空串（弃权）');

// 本地粗评（确定性公式）
const sc = SCENARIOS[0];
const t1 = '这是一句很长很稳的话没有雷词'; // 14 字，无关键词无雷词 → base 4 + 长句 1 = 5
const r0 = localScore(sc, '');
if (r0.score !== 0 || !r0.comment.includes('没作答')) fail(`空答应 0 分带「没作答」，实际 ${JSON.stringify(r0)}`);
const rShort = localScore(sc, '嗯');
if (rShort.score > 2) fail(`短句（<4 字）应封顶 2 分，实际 ${rShort.score}`);
const r1 = localScore(sc, t1);
if (r1.score !== 5) fail(`无分点长句应为 5（4+1），实际 ${r1.score}`);
if (!r1.comment.includes('四平八稳')) fail('无分点应给「四平八稳」评语：' + r1.comment);
const r2 = localScore(sc, t1 + GENERIC_TRAPS[0]);
if (r2.score !== r1.score - 3) fail(`踩一个雷词应 -3（${r1.score}→${r2.score}）`);
if (!r2.comment.includes('上头')) fail('踩雷评语应含「上头」：' + r2.comment);
const r3 = localScore(sc, t1 + sc.keywords[0]);
if (r3.score !== r1.score + 2) fail(`命中一个关键词应 +2（${r1.score}→${r3.score}）`);
if (!r3.comment.includes('方向对')) fail('命中关键词评语应含「方向对」：' + r3.comment);
const r4 = localScore(sc, t1 + sc.keywords[0] + sc.keywords[1] + sc.keywords[2]);
if (r4.score !== 10) fail(`三个关键词应到顶（4+6+1=11 钳 10），实际 ${r4.score}`);
const r5 = localScore(sc, t1 + GENERIC_TRAPS[0] + GENERIC_TRAPS[1] + GENERIC_TRAPS[2]);
if (r5.score !== 0) fail(`三雷齐踩应垫底 0 分，实际 ${r5.score}`);
if (localScore(sc, t1).score !== localScore(sc, `${t1} `).score) fail('localScore 应确定性（同文本同分）');
console.log('✓ 引擎：抽卡 / 先答轮换 / 记答 / 本地粗评全带（0·2·5·±分·封顶钳底）');

// 记分与判胜
const g2 = createArena({ scenarios: SCENARIOS, names, rand: () => 0 });
const roundScores = [
  { p1: 9, p2: 3 },
  { p1: 2, p2: 2 },
  { p1: 5, p2: 3 },
];
for (const rs of roundScores) recordAnswer(g2, 'p1', `p1 第 ${roundScores.indexOf(rs) + 1} 轮的话`);
// ↑ indexOf 在 recordAnswer 之后仍可用（同步循环），换个稳妥写法
for (let i = 0; i < 3; i += 1) {
  recordAnswer(g2, 'p2', `p2 第 ${i + 1} 轮的话`);
}
if (arenaResult(g2) !== null) fail('未记满轮次时 arenaResult 应为 null');
for (let i = 0; i < 3; i += 1) {
  recordScores(g2, {
    p1: { score: roundScores[i].p1, comment: '评语一', source: 'local' },
    p2: { score: roundScores[i].p2, comment: '评语二', source: 'local' },
  });
}
if (arenaTotals(g2).p1 !== 16 || arenaTotals(g2).p2 !== 8) fail(`总分应 16:8，实际 ${JSON.stringify(arenaTotals(g2))}`);
const res = arenaResult(g2);
if (!res || res.winner !== 'p1') fail(`16:8 应判 p1 胜，实际 ${JSON.stringify(res)}`);
if (g2.scores[0].scenarioId !== g2.scenarioIds[0]) fail('记分应关联当轮场景 id');

// 平局与本地复盘
const g3 = createArena({ scenarios: SCENARIOS, names, rand: () => 0 });
for (let i = 0; i < 3; i += 1) {
  recordAnswer(g3, 'p1', `甲的第 ${i + 1} 句`);
  recordAnswer(g3, 'p2', `乙的第 ${i + 1} 句`);
  recordScores(g3, {
    p1: { score: 4, comment: '评', source: 'local' },
    p2: { score: 4, comment: '评', source: 'local' },
  });
}
if (arenaResult(g3).winner !== 'draw') fail('总分相同应判 draw');
const recapLocal = localRecap(g3);
if (recapLocal.winner !== 'draw' || !recapLocal.summary.includes('互啄')) fail('本地复盘平局文案应含「互啄」：' + recapLocal.summary);

const recap2 = localRecap(g2);
if (recap2.winner !== 'p1' || recap2.source !== 'local') fail('本地复盘 winner 应与引擎一致');
if (!recap2.golden || recap2.golden.player !== 'p1' || recap2.golden.quote !== 'p1 第 1 轮的话') {
  fail(`金句应取全场最高分那句（p1 第 1 轮 9 分），实际 ${JSON.stringify(recap2.golden)}`);
}
if (!recap2.p1Comment.includes('9')) fail('p1 终评应提到其最高分：' + recap2.p1Comment);

const g4 = createArena({ scenarios: SCENARIOS, names, rand: () => 0 });
for (let i = 0; i < 3; i += 1) {
  recordAnswer(g4, 'p1', '零分');
  recordAnswer(g4, 'p2', '零分');
  recordScores(g4, {
    p1: { score: 0, comment: '评', source: 'local' },
    p2: { score: 0, comment: '评', source: 'local' },
  });
}
if (localRecap(g4).golden !== null) fail('全场 0 分时金句应为 null');
console.log('✓ 引擎：记分 / 总分 / 判胜判平 / 本地复盘（金句取最高，全 0 无金句）');

/* ------------------------------------------------------------------ */
/* 3. 评分适配 llm.js（假 localStorage + 假 fetch，OpenAI 兼容通道）      */
/* ------------------------------------------------------------------ */

const { saveSettings, clearSettings } = await import('../src/lib/settings.js');
const { judgeArenaRound, arenaRecap } = await import('../src/lib/llm.js');

const fakeStore = new Map();
global.localStorage = {
  getItem: (k) => (fakeStore.has(k) ? fakeStore.get(k) : null),
  setItem: (k, v) => fakeStore.set(k, String(v)),
  removeItem: (k) => fakeStore.delete(k),
};
saveSettings({ provider: 'openai', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://example.test/v1/' });

const ctx = { scenario: SCENARIOS[0], names, answers: { p1: '我说得很好也很稳', p2: '嗯' } };
let captured = null;
global.fetch = async (url, init) => {
  captured = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            p1: { score: 12, comment: '长'.repeat(80) },
            p2: { score: 3.6, comment: '接是接住了' },
          }),
        },
      }],
    }),
  };
};

const v1 = await judgeArenaRound(ctx);
if (v1.source !== 'remote') fail('配了 key 应走远程评分，实际 ' + v1.source);
if (v1.p1.score !== 10) fail(`越界分应钳到 10，实际 ${v1.p1.score}`);
if (v1.p2.score !== 4) fail(`3.6 应取整 4，实际 ${v1.p2.score}`);
if (v1.p1.comment.length !== 60) fail(`评语应截到 60 字，实际 ${v1.p1.comment.length}`);
if (captured.url !== 'https://example.test/v1/chat/completions') fail('评分请求地址不对：' + captured.url);
const sent = JSON.parse(captured.init.body);
if (sent.messages[0].role !== 'system' || !sent.messages[0].content.includes('评委')) {
  fail('评分 system prompt 应声明评委身份');
}
const lastUser = sent.messages[sent.messages.length - 1].content;
if (!lastUser.includes(ctx.scenario.line) || !lastUser.includes('甲') || !lastUser.includes('我说得很好也很稳')) {
  fail('评分 user message 应含场景原话与双方作答');
}
console.log('✓ 评分适配：远程逐轮评分（钳分/取整/截评语/prompt 要素）');

// 非法评分（score 不是数）→ 整笔降级本地 + 带原因
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ p1: { score: '高', comment: 'x' }, p2: { score: 3, comment: 'y' } }) } }] }),
});
const v2 = await judgeArenaRound(ctx);
if (v2.source !== 'local' || !v2.fallback) fail('非法评分应整笔降级本地并带原因');
if (v2.p1.score !== localScore(ctx.scenario, ctx.answers.p1).score) fail('降级后应给本地粗评分');
// 网络炸 → 降级带人话原因
global.fetch = async () => { throw new TypeError('Failed to fetch'); };
const v3 = await judgeArenaRound(ctx);
if (v3.source !== 'local' || !v3.fallback) fail('网络失败应降级本地并带原因');
console.log('✓ 评分适配：非法分 / 网络失败都降级本地，不留死路');

// 终盘复盘：远程解析 + golden 非法置空 + 降级与引擎判定一致
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: '总评：甲稳乙飘。',
          p1Comment: '甲的终评',
          p2Comment: '乙的终评',
          golden: { player: 'p9', quote: 'x', why: 'y' },
          winner: 'p2',
        }),
      },
    }],
  }),
});
const rc1 = await arenaRecap({ arena: g2, scenarios: SCENARIOS });
if (rc1.source !== 'remote') fail('复盘应走远程，实际 ' + rc1.source);
if (rc1.golden !== null) fail('golden.player 非法应置 null');
if (rc1.winner !== 'p2') fail('远程复盘应保留模型判的 winner（仅参考）');
if (rc1.summary !== '总评：甲稳乙飘。') fail('远程 summary 应保留');
global.fetch = async () => { throw new TypeError('Failed to fetch'); };
const rc2 = await arenaRecap({ arena: g2, scenarios: SCENARIOS });
if (rc2.source !== 'local' || !rc2.fallback) fail('复盘失败应降级本地带原因');
if (rc2.winner !== 'p1') fail('降级复盘 winner 应与引擎判定一致（p1）');
clearSettings();
global.localStorage = window.localStorage;
delete global.fetch;
console.log('✓ 评分适配：远程复盘 / golden 收敛 / 降级对齐引擎判定');

/* ------------------------------------------------------------------ */
/* 4. 视图 ui/arena.js（jsdom + 真模块链，无 key → 本地评分）            */
/* ------------------------------------------------------------------ */

// 跟踪 interval：dispose 契约的可观测证据（离开时清掉答题倒计时，不留幽灵计时器）
const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;
const liveTimers = new Set();
global.setInterval = (fn, ms, ...args) => {
  const id = realSetInterval(fn, ms, ...args);
  liveTimers.add(id);
  return id;
};
global.clearInterval = (id) => {
  realClearInterval(id);
  liveTimers.delete(id);
};

const { createArenaView } = await import('../src/ui/arena.js');
let backCount = 0;
let settingsCount = 0;
const arenaEndEvents = [];
const view = createArenaView({
  onBack: () => { backCount += 1; },
  openSettings: () => { settingsCount += 1; },
  onArenaEnd: (ev) => arenaEndEvents.push(ev),
});
window.document.body.replaceChildren(view.root);
const $ = (sel) => view.root.querySelector(sel);
const $$ = (sel) => [...view.root.querySelectorAll(sel)];

// intro：默认名 + 自定义名
if (!$('.arena-intro')) fail('开局应是 intro 相位');
const nameInputs = $$('.arena-name-input');
if (nameInputs.length !== 2) fail(`应有双方名字输入框，实际 ${nameInputs.length}`);
if (nameInputs[0].value !== '玩家一' || nameInputs[1].value !== '玩家二') fail('名字默认值应为 玩家一/玩家二');
nameInputs[0].value = '甲哥';
nameInputs[1].value = '乙姐';
$('.arena-start').click();
if (!$('.arena-round')) fail('点开始后应进入第 1 轮答题相位');

// 第 1 轮：P1 先答、场景卡渲染、hint/keywords 不漏、60 秒倒计时
const drawnOf = (rootText) => SCENARIOS.find((s) => rootText.includes(s.title));
let roundText = view.root.textContent;
let drawn1 = drawnOf(roundText);
if (!drawn1) fail('答题屏应展示场景标题');
if (!$('.scenario-line') || !$('.scenario-line').textContent.trim()) fail('场景原话（line）应大字渲染');
if (!roundText.includes('甲哥')) fail('第 1 轮先答者应为 P1（显示其名字）');
if (roundText.includes(drawn1.hint)) fail('评分口径 hint 不得泄漏到 UI');
for (const kw of [...drawn1.keywords, ...drawn1.traps]) {
  if (roundText.includes(kw)) fail(`分点词不得泄漏到 UI：${kw}`);
}
if ($('.arena-timer')?.textContent !== '60s') fail(`答题倒计时应为 60s，实际「${$('.arena-timer')?.textContent}」`);
if ($('.arena-input').getAttribute('maxlength') !== String(ARENA_MAX_CHARS)) fail('答题框应限字数');

// 空提交不推进
$('.arena-input').value = '   ';
$('.arena-send').click();
if (!$('.arena-round')) fail('空提交不应推进相位');
const p1Answer = '我把这句话说得又长又稳不留把柄';
$('.arena-input').value = p1Answer;
$('.arena-send').click();

// 交接屏：P2 名字在、P1 答案不在（防偷看）
if (!$('.arena-handoff')) fail('P1 提交后应进交接屏');
if (!view.root.textContent.includes('乙姐')) fail('交接屏应提示交给 P2');
if (view.root.textContent.includes(p1Answer)) fail('交接屏不得出现 P1 的答案');
$('.handoff-btn').click();

// P2 作答 → 评分揭晓（本地评分确定性：P1 5 分 / P2 短句 2 分）
if (!$('.arena-round') || !view.root.textContent.includes('乙姐')) fail('交接后应是 P2 作答相位');
$('.arena-input').value = '嗯';
$('.arena-send').click();
await sleep(900);
if (!$('.arena-reveal')) fail('双方答完应出评分揭晓（本地评分 ≤900ms）');
const cards = $$('.reveal-card');
if (cards.length !== 2) fail(`揭晓应有两张答案卡，实际 ${cards.length}`);
const lead = $('.reveal-card.lead');
if (!lead || !lead.textContent.includes('甲哥')) fail('分高侧（P1）应挂 .lead');
if (!$$('.reveal-score').every((el) => /^[0-9]|10$/.test(el.textContent.trim()))) fail('双方分数应渲染为 0-10');
if ($$('.reveal-comment').some((el) => !el.textContent.trim())) fail('双方短评不应为空');

// 第 2 轮：P2 先答（轮换）+ 场景不重样
$('.arena-next').click();
if (!$('.arena-round')) fail('点下一轮应进入新场景');
if (!view.root.textContent.includes('乙姐')) fail('第 2 轮先答者应为 P2');
const drawn2 = drawnOf(view.root.textContent);
if (!drawn2 || drawn2.id === drawn1.id) fail('两轮场景不应重复');

// 打完剩余流程（第 2 轮 P2 先答 → 第 3 轮 P1 先答；finishRound(先答文本, 后答文本)）
async function finishRound(firstText, secondText) {
  if (!$('.arena-round')) fail('finishRound 前置：应停在答题相位');
  $('.arena-input').value = firstText;
  $('.arena-send').click();
  if (!$('.arena-handoff')) fail('先答提交后应进交接屏');
  $('.handoff-btn').click();
  if (!$('.arena-round')) fail('交接确认后应回到答题相位');
  $('.arena-input').value = secondText;
  $('.arena-send').click();
  await sleep(900);
}
await finishRound('嗯', p1Answer);
if (!$('.arena-reveal')) fail('第 2 轮应出揭晓');
$('.arena-next').click();
await finishRound(p1Answer, '嗯');
$('.arena-next').click(); // 末轮按钮文案不同（看终盘复盘），类名共用
await sleep(900);
if (!$('.arena-recap')) fail('三轮打完应出终盘复盘');
if (!$('.recap-winner').textContent.includes('甲哥') || !$('.recap-winner').textContent.includes('胜出')) {
  fail('胜者标题应为「甲哥 胜出」（引擎判定 15:6）：' + $('.recap-winner').textContent);
}
if ($$('.recap-rounds > *').length !== 3) fail(`逐轮小表应 3 行，实际 ${$$('.recap-rounds > *').length}`);
if (!$('.golden-card') || !$('.golden-card').textContent.includes(p1Answer)) fail('金句卡应含全场最高分那句');
if (!$('.arena-hint') || !$('.arena-hint').textContent.includes('本地粗评')) fail('本地评分路径应有「本地粗评」提示行');
const hintBtn = $('.arena-hint button');
if (!hintBtn) fail('提示行应有「接入你的 AI」入口');
hintBtn.click();
if (settingsCount !== 1) fail('接入按钮应调 openSettings 回调');

// M4 终盘入账回调：整场恰好上报一次，win/bestRound/recap 与实况一致（P1 15:6 胜，全场最高 5 分，本地复盘已生成）
if (arenaEndEvents.length !== 1) fail(`终盘应恰好上报一次 onArenaEnd，实际 ${arenaEndEvents.length}`);
const endEv = arenaEndEvents[0];
if (endEv.win !== true) fail('P1 胜局场上 win 应为 true');
if (endEv.bestRound !== 5) fail(`bestRound 应为全场最高分 5，实际 ${endEv.bestRound}`);
if (endEv.recap !== true) fail('本地复盘已生成，recap 应为 true');

// 再来一局：回 intro、名字回默认
$('.arena-again').click();
if (!$('.arena-intro')) fail('再来一局应回 intro');
if (view.root.querySelector('.arena-name-input')?.value !== '玩家一') fail('再来一局应重置名字');

// 返回大厅回调
$('.back-btn').click();
if (backCount !== 1) fail('「← 大厅」应触发 onBack');
if (arenaEndEvents.length !== 1) fail('再来一局 / 返回大厅不应再次上报 onArenaEnd');

// dispose 契约：计时器活跃时销毁 → interval 清空
const view2 = createArenaView({ onBack: () => {}, openSettings: () => {} });
window.document.body.replaceChildren(view2.root);
view2.root.querySelector('.arena-start').click();
if (!view2.root.querySelector('.arena-round')) fail('第二场开局应进答题相位');
if (liveTimers.size !== 1) fail(`答题相位应恰 1 个倒计时 interval，实际 ${liveTimers.size}`);
view2.dispose();
if (liveTimers.size !== 0) fail(`dispose 后应清空 interval，实际剩 ${liveTimers.size}`);

// dispose 后在途评分回调不抛
const view3 = createArenaView({ onBack: () => {}, openSettings: () => {} });
window.document.body.replaceChildren(view3.root);
view3.root.querySelector('.arena-start').click();
view3.root.querySelector('.arena-input').value = p1Answer;
view3.root.querySelector('.arena-send').click();
view3.root.querySelector('.handoff-btn')?.click();
if (view3.root.querySelector('.arena-input')) {
  view3.root.querySelector('.arena-input').value = '嗯';
  view3.root.querySelector('.arena-send').click();
}
view3.dispose();
await sleep(700); // 在途 judgeArenaRound 返回时视图已销毁 —— 不该抛
console.log('✓ 视图：全相位流 / 交接屏防偷看 / 先答轮换 / 分点不泄漏 / dispose 契约');

// 渲染铁律：源码无 innerHTML
const viewSrc = readFileSync(new URL('../src/ui/arena.js', import.meta.url), 'utf8');
if (viewSrc.includes('innerHTML')) fail('ui/arena.js 不得使用 innerHTML');
const engineSrc = readFileSync(new URL('../src/lib/arena.js', import.meta.url), 'utf8');
if (engineSrc.includes('innerHTML')) fail('lib/arena.js 不得使用 innerHTML');

global.setInterval = realSetInterval;
global.clearInterval = realClearInterval;
console.log('\n全部通过 ✅');
process.exit(0);
