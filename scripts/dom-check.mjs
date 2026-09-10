// 用 jsdom 真跑一遍 UI：选人 → 对线 → 点预设 → 打完一局 → 报告。
// 只验证「不报错 + 界面长出来了」，不测像素。
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
// 浏览器里 localStorage 是个全局；jsdom 只把它挂在 window 上，得手动补
global.localStorage = window.localStorage;

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};

await import('../src/main.js');

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];

// 1. 选人屏
const cards = $$('.persona-card');
if (cards.length !== 3) fail(`选人屏应该有 3 张卡，实际 ${cards.length}`);
console.log('✓ 选人屏渲染出', cards.length, '个对手:', $$('.persona-name').map((n) => n.textContent).join(' / '));
if ($('#engine-badge').textContent !== '本地引擎') fail('徽章文案不对');

// 2. 配色主题：默认暗色，点一下切亮色并存下来，再点切回来
const themeBtn = $('#theme-btn');
if (!themeBtn) fail('顶栏没有主题按钮');
const root = window.document.documentElement;
if (root.dataset.theme !== 'dark') fail('默认应该是暗色，实际 ' + root.dataset.theme);
if (themeBtn.textContent !== '☀️') fail('暗色下按钮应该显示「切到亮色」的图标，实际 ' + themeBtn.textContent);
themeBtn.click();
if (root.dataset.theme !== 'light') fail('点一下应该切到亮色，实际 ' + root.dataset.theme);
if (window.localStorage.getItem('gang-ai:theme:v1') !== 'light') fail('主题没写进 localStorage');
if (themeBtn.textContent !== '🌙') fail('亮色下按钮应该显示「切到暗色」的图标，实际 ' + themeBtn.textContent);
themeBtn.click();
if (root.dataset.theme !== 'dark') fail('再点一下应该切回暗色，实际 ' + root.dataset.theme);
if (window.localStorage.getItem('gang-ai:theme:v1') !== 'dark') fail('切回暗色后 localStorage 没更新');
console.log('✓ 主题切换: 暗色 ⇄ 亮色，选择已持久化');

// 3. 难度选择：默认困难，点简单就切过去，并带进对局
const diffBtns = $$('.diff-seg .seg-btn');
if (diffBtns.length !== 3) fail(`难度应该有 3 档，实际 ${diffBtns.length}`);
if ($('.diff-seg .seg-btn.is-active').textContent !== '困难 45s') {
  fail('难度默认应该是困难 45s，实际 ' + $('.diff-seg .seg-btn.is-active').textContent);
}
diffBtns[2].click();
if ($('.diff-seg .seg-btn.is-active').textContent !== '简单 60s') fail('点简单没切过去');
if (!/每回合 60 秒/.test($('.diff-note').textContent)) {
  fail('难度说明没跟着变：' + $('.diff-note').textContent);
}
console.log('✓ 难度选择器:', $$('.diff-seg .seg-btn').map((b) => b.textContent).join(' / '));

// 4. 进入对线屏
cards[1].click(); // 阴阳怪气亲戚
if (!$('.duel')) fail('点卡片后没有进入对线屏');
const diffPill = $('.diff-pill');
if (!diffPill) fail('对线屏没显示当前难度');
if (diffPill.textContent !== '简单') fail('对线屏难度不对：' + diffPill.textContent);
if (!/^(60|59)s$/.test($('.timer-label').textContent)) {
  fail('选了简单，倒计时应该从 60 秒起步，实际 ' + $('.timer-label').textContent);
}
console.log('✓ 难度带进对局:', diffPill.textContent, $('.timer-label').textContent);
const opener = $('.bubble-ai').textContent;
if (!opener) fail('开场白没渲染');
console.log('✓ 对线屏开场:', opener);
if ($$('.preset-chip').length !== 3) fail('预设话术应该有 3 个');

// 5. 点预设 + 打字，把一局打完
const chips = $$('.preset-chip');
for (const chip of chips) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}

const anger = Number($('.anger-num').textContent);
console.log('✓ 三个软肋后怒气值:', anger, '| 阶段:', $('.stage-pill').textContent);
if (anger !== 90) fail(`三个软肋应该到 90，实际 ${anger}`);

// 6. 补一句自己的话，收掉这一局
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 4000));
if (!$('.report')) fail('没进报告屏');
console.log('✓ 报告屏:', $('.result-badge').textContent, '|', $('.title-name').textContent);
console.log('  统计:', $$('.stat').map((s) => `${s.querySelector('.stat-label').textContent}=${s.querySelector('.stat-value').textContent}`).join(' '));
console.log('  回放条数:', $$('.replay-item').length);

/* ------------------------------------------------------------------ */
/* 7. 设置弹窗：接入自己的 AI（放在最后，否则存了 key 后面会走网络）      */
/* ------------------------------------------------------------------ */

const gear = $('#settings-btn');
if (!gear) fail('顶栏没有齿轮按钮');
gear.click();

const modal = $('.modal');
if (!modal) fail('点齿轮没弹出设置窗');
if ($('.modal-backdrop').parentElement !== window.document.body) fail('弹窗应该挂在 body 上');
console.log('✓ 设置弹窗打开了，标题:', $('.modal-title').textContent);

// 限定在弹窗里找，别把选人屏的难度按钮也算进来
const segs = $$('.modal-body .seg-btn');
if (segs.length !== 3) fail(`服务商应该有 3 个选项，实际 ${segs.length}`);
if ($('.modal-body .seg-btn.is-active').textContent !== '本地引擎') fail('默认应该选中本地引擎');
if ($('.key-row')) fail('本地引擎模式不该有 key 输入框');

// 切到 Claude
segs[1].click();
if (!/Claude/.test($('.modal-body .seg-btn.is-active').textContent)) fail('没切到 Claude');
const keyInput = $('.key-row input');
if (!keyInput) fail('切到 Claude 后没有 key 输入框');
if (keyInput.type !== 'password') fail('key 默认应该打码');

// 推理型模型警告：对话模型时不显示，一填推理模型就出现
// 注意：预设下拉也是 .input，别按 .input 的序号取，按字段标签取
const modelInput = $$('.modal-body .field')[2].querySelector('.input');
const warnNode = $('.field-warn');
if (!warnNode || !warnNode.hidden) fail('对话模型不该显示推理模型警告');
modelInput.value = 'deepseek-reasoner';
modelInput.dispatchEvent(new window.Event('input', { bubbles: true }));
if (warnNode.hidden) fail('填了推理型模型，警告应该出现');
modelInput.value = 'claude-opus-5';
modelInput.dispatchEvent(new window.Event('input', { bubbles: true }));
if (!warnNode.hidden) fail('换回对话模型，警告应该收起来');
console.log('✓ 推理型模型警告随输入实时切换');

keyInput.value = 'sk-ant-fake-key-for-test-0000';
keyInput.dispatchEvent(new window.Event('input', { bubbles: true }));
$$('.modal-actions .btn')[2].click(); // 保存

if ($('.modal')) fail('保存后弹窗应该关闭');
const label = $('#engine-badge').textContent;
if (!/^真实 AI · /.test(label)) fail(`保存后徽章应该变成真实 AI，实际「${label}」`);
console.log('✓ 保存后徽章:', label);

const stored = JSON.parse(window.localStorage.getItem('gang-ai:settings:v1'));
if (stored.provider !== 'anthropic' || stored.apiKey !== 'sk-ant-fake-key-for-test-0000') {
  fail('localStorage 里的设置不对');
}
console.log('✓ key 已写入 localStorage（provider=' + stored.provider + '）');

// 再打开一次，清除
$('#settings-btn').click();
const clearBtn = $$('.modal-actions .btn')[1];
clearBtn.click();
if ($('#engine-badge').textContent !== '本地引擎') fail('清除后徽章应该回到本地引擎');
if (window.localStorage.getItem('gang-ai:settings:v1')) fail('清除后 localStorage 应该被删掉');
console.log('✓ 清除后徽章:', $('#engine-badge').textContent);

$('.modal-head .ghost-btn').click();
if ($('.modal')) fail('点 ✕ 应该关掉弹窗');
console.log('✓ 弹窗关闭');

console.log('\n全部通过 ✅');
process.exit(0);
