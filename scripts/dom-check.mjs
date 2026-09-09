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

// 2. 进入对线屏
cards[1].click(); // 阴阳怪气亲戚
if (!$('.duel')) fail('点卡片后没有进入对线屏');
const opener = $('.bubble-ai').textContent;
if (!opener) fail('开场白没渲染');
console.log('✓ 对线屏开场:', opener);
if ($$('.preset-chip').length !== 3) fail('预设话术应该有 3 个');

// 3. 点预设 + 打字，把一局打完
const chips = $$('.preset-chip');
for (const chip of chips) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}

const anger = Number($('.anger-num').textContent);
console.log('✓ 三个软肋后怒气值:', anger, '| 阶段:', $('.stage-pill').textContent);
if (anger !== 90) fail(`三个软肋应该到 90，实际 ${anger}`);

// 4. 补一句自己的话，收掉这一局
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 4000));
if (!$('.report')) fail('没进报告屏');
console.log('✓ 报告屏:', $('.result-badge').textContent, '|', $('.title-name').textContent);
console.log('  统计:', $$('.stat').map((s) => `${s.querySelector('.stat-label').textContent}=${s.querySelector('.stat-value').textContent}`).join(' '));
console.log('  回放条数:', $$('.replay-item').length);
console.log('\n全部通过 ✅');
process.exit(0);
