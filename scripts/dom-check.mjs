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

/* ------------------------------------------------------------------ */
/* 5. 设置弹窗：接入自己的 AI（放在最后，否则存了 key 后面会走网络）      */
/* ------------------------------------------------------------------ */

const gear = $('#settings-btn');
if (!gear) fail('顶栏没有齿轮按钮');
gear.click();

const modal = $('.modal');
if (!modal) fail('点齿轮没弹出设置窗');
if ($('.modal-backdrop').parentElement !== window.document.body) fail('弹窗应该挂在 body 上');
console.log('✓ 设置弹窗打开了，标题:', $('.modal-title').textContent);

const segs = $$('.seg-btn');
if (segs.length !== 3) fail(`服务商应该有 3 个选项，实际 ${segs.length}`);
if ($('.seg-btn.is-active').textContent !== '本地引擎') fail('默认应该选中本地引擎');
if ($('.key-row')) fail('本地引擎模式不该有 key 输入框');

// 切到 Claude
segs[1].click();
if (!/Claude/.test($('.seg-btn.is-active').textContent)) fail('没切到 Claude');
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

// 外观：弹窗里也能切主题
const themeSeg = $$('.theme-seg-btn');
if (themeSeg.length !== 2) fail(`外观应该有 2 个选项，实际 ${themeSeg.length}`);
const themeBeforeSeg = document.documentElement.dataset.theme;
themeSeg[0].click();
if (document.documentElement.dataset.theme !== 'light') fail('点浅色应切到 light');
themeSeg[1].click();
if (document.documentElement.dataset.theme !== 'dark') fail('点深色应切到 dark');
themeSeg[themeBeforeSeg === 'dark' ? 1 : 0].click(); // 恢复原主题
console.log('✓ 设置弹窗外观切换正常');

$('.modal-head .ghost-btn').click();
if ($('.modal')) fail('点 ✕ 应该关掉弹窗');
console.log('✓ 弹窗关闭');

/* ------------------------------------------------------------------ */
/* 6. 主题：顶栏切换 + localStorage 记忆                                */
/* ------------------------------------------------------------------ */

const themeBtn = $('#theme-toggle');
if (!themeBtn) fail('顶栏没有主题按钮');
const themeBefore = document.documentElement.dataset.theme;
if (themeBefore !== 'light' && themeBefore !== 'dark') {
  fail(`初始主题应为 light/dark，实际「${themeBefore}」`);
}
themeBtn.click();
const themeAfter = document.documentElement.dataset.theme;
if (themeAfter === themeBefore) fail('点击主题按钮后 data-theme 应该翻转');
if (window.localStorage.getItem('gang-ai:theme') !== themeAfter) {
  fail('主题选择应写入 localStorage');
}
themeBtn.click();
if (document.documentElement.dataset.theme !== themeBefore) fail('再点一次应切回原主题');
console.log('✓ 主题切换:', themeBefore, '→', themeAfter, '→', themeBefore);

/* ------------------------------------------------------------------ */
/* 7. 皮肤：状态层 + 选择弹层 + 与深浅解耦                              */
/* ------------------------------------------------------------------ */

const { getSkin, setSkin } = await import('../src/lib/theme.js');
if (getSkin() !== 'blossom') fail(`默认皮肤应为 blossom，实际「${getSkin()}」`);
setSkin('midnight');
if (document.documentElement.dataset.skin !== 'midnight') fail('setSkin 应设置 data-skin');
if (window.localStorage.getItem('gang-ai:skin') !== 'midnight') fail('皮肤选择应写入 localStorage');
setSkin('blossom');
if (document.documentElement.dataset.skin !== 'blossom') fail('应能切回 blossom');
console.log('✓ 皮肤状态层：默认/切换/持久化');

const skinBtn = $('#skin-btn');
if (!skinBtn) fail('顶栏没有皮肤按钮');
skinBtn.click();
const skinPop = $('.skin-popover');
if (!skinPop) fail('点皮肤按钮没弹层');
const skinCards = $$('.skin-card');
if (skinCards.length !== 2) fail(`皮肤卡应有 2 张，实际 ${skinCards.length}`);
const midnightCard = skinCards.find((c) => c.dataset.skinId === 'midnight');
if (!midnightCard) fail('没有午夜皮肤卡');
midnightCard.click();
if (document.documentElement.dataset.skin !== 'midnight') fail('点卡应切到 midnight');
if (!$('.skin-popover')) fail('点卡后弹层应保持打开（便于对比切换）');
if ($('.skin-card.is-active').dataset.skinId !== 'midnight') fail('active 卡应随切换更新');

// 解耦：midnight 下主题按钮仍可切深浅
const themeBefore2 = document.documentElement.dataset.theme;
$('#theme-toggle').click();
if (document.documentElement.dataset.theme === themeBefore2) fail('midnight 下主题按钮应仍可切换');
$('#theme-toggle').click();

// 切回 blossom 并用 Esc 关闭
skinCards.find((c) => c.dataset.skinId === 'blossom').click();
if (document.documentElement.dataset.skin !== 'blossom') fail('应切回 blossom');
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
if ($('.skin-popover')) fail('Esc 应关闭皮肤弹层');
console.log('✓ 皮肤弹层：两卡切换/解耦/高亮更新/Esc 关闭');

console.log('\n全部通过 ✅');
process.exit(0);
