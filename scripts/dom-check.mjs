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

// 1. 大厅：初始屏，三张模块卡（主卡 + 资料库可点，一张锁定）
if (!$('.lobby')) fail('初始屏应该是大厅，实际没有 .lobby');
const moduleCards = $$('.module-card');
if (moduleCards.length !== 3) fail(`大厅应有 3 张模块卡，实际 ${moduleCards.length}`);
const lockedCards = $$('.module-card.locked');
if (lockedCards.length !== 1) fail(`应有一张锁定卡（擂台），实际 ${lockedCards.length}`);
if (lockedCards.some((c) => !c.disabled)) fail('锁定卡应该是 disabled，不可点');
if (!$('.module-card.primary')) fail('应该有主卡（对线房）');
const libCard = $('.module-card.library');
if (!libCard) fail('资料库应该是真卡（.module-card.library），不是锁定卡');
if (libCard.disabled) fail('资料库卡应该可点');
// 1b. 2.0 改名：嘴强王者 · TALK KING，主卡更名对线房
if (window.document.title !== '嘴强王者 · TALK KING') fail('页面标题应为「嘴强王者 · TALK KING」，实际「' + window.document.title + '」');
if (!$('.brand').textContent.includes('嘴强王者')) fail('顶栏品牌应为嘴强王者');
if ($('.brand .brand-en').textContent !== 'TALK KING') fail('英文副标应为 TALK KING，实际「' + $('.brand .brand-en').textContent + '」');
if ($('.module-card.primary .module-name').textContent !== '对线房') {
  fail('大厅主卡名应为「对线房」，实际「' + $('.module-card.primary .module-name').textContent + '」');
}
if (!$('.lobby .hero-sub').textContent.includes('对线房')) fail('大厅副标应点明「对线房」消歧');
console.log('✓ 2.0 改名：标题/品牌/主卡（对线房）');
if ($('.module-card.primary .module-badge')) fail('没有进行中对局时，主卡不该有角标');
if (!$('.connect-hint')) fail('未配置 AI 时大厅也应有接入提示');
console.log('✓ 大厅初始：3 模块卡，主卡 + 2 锁定卡 + 接入提示');
if ($('#engine-badge').textContent !== '本地引擎') fail('徽章文案不对');

// 2. 主卡 → 选人屏；选人屏可返回大厅，返回后再进是全新选人
$('.module-card.primary').click();
if (!$('.select')) fail('点主卡后没有进入选人屏');
const selectBack = $('.select .back-btn');
if (!selectBack) fail('选人屏应该有「返回大厅」按钮');
selectBack.click();
if (!$('.lobby')) fail('选人屏「返回大厅」后应回到大厅');
$('.module-card.primary').click();
const cards = $$('.persona-card:not(.locked)');
if (cards.length !== 5) fail(`选人屏应该有 5 张可玩卡，实际 ${cards.length}`);
console.log('✓ 大厅 ⇄ 选人屏往返：', $$('.persona-name').map((n) => n.textContent).join(' / '));

// 2b. 选人屏按三房分组：杠精房 2 卡 / 谈判房 3 卡 / 情商房锁定占位
const groups = $$('.category-group');
if (groups.length !== 3) fail(`选人屏应有 3 个分组（杠精/谈判/情商），实际 ${groups.length}`);
const groupNames = groups.map((g) => g.querySelector('.category-name').textContent);
if (groupNames.join(',') !== '杠精房,谈判房,情商房') {
  fail('分组顺序应为 杠精房→谈判房→情商房，实际 ' + groupNames.join(','));
}
const gangCount = groups[0].querySelectorAll('.persona-card:not(.locked)').length;
const dealCount = groups[1].querySelectorAll('.persona-card:not(.locked)').length;
if (gangCount !== 2 || dealCount !== 3) {
  fail(`分组卡数不对：杠精房 ${gangCount} / 谈判房 ${dealCount}`);
}
const eqLock = groups[2].querySelector('.persona-card.locked');
if (!eqLock || !eqLock.disabled || !/即将开放/.test(eqLock.textContent)) {
  fail('情商房应有 disabled 的「即将开放」占位卡');
}
if (!$('.select .hero-title').textContent.includes('选个对手')) fail('选人屏主标题应覆盖三房语境');
console.log('✓ 选人屏三房分组：杠精房 2 / 谈判房 3 / 情商房锁定占位');

// 3. 进入对线屏
cards[1].click(); // 阴阳怪气亲戚
if (!$('.duel')) fail('点卡片后没有进入对线屏');
const opener = $('.bubble-ai').textContent;
if (!opener) fail('开场白没渲染');
console.log('✓ 对线屏开场:', opener);
if ($$('.preset-chip').length !== 3) fail('预设话术应该有 3 个');
if ($('.timer-label')) fail('默认不限时的局不该有倒计时标签');
if ($('.pause-btn')) fail('不限时的局不该有暂停按钮');
console.log('✓ 默认不限时：无倒计时、无暂停按钮');

// 4. AI 打字期间跑路：回合离场记账，回来补画（不报错）
const duelBack = $('.duel .back-btn');
if (!duelBack) fail('对线屏头部应该有「大厅」按钮');
const chips = $$('.preset-chip');
chips[0].click(); // 「您家孩子」→ 命中软肋 kid(32)
duelBack.click(); // 同步跟一刀：趁回合还没生成完，直接回大厅
if (!$('.lobby')) fail('AI 打字中点「大厅」应立即回到大厅');
const inflightBadge = $('.module-card.primary .module-badge');
if (!inflightBadge || !/对局进行中/.test(inflightBadge.textContent)) fail('离场时主卡应有对局角标');
await new Promise((r) => setTimeout(r, 1500)); // 等回合在「离场」状态下记账完成
$('.module-card.primary').click();
if (!$('.duel')) fail('离场后点主卡应续局');
if (Number($('.anger-num').textContent) !== 32) {
  fail(`离场期间的回合应已记账（怒气 32），实际 ${$('.anger-num').textContent}`);
}
if ($$('.bubble-me').length !== 1 || $$('.bubble-ai').length !== 2) {
  fail(`离场回合补画不完整：我方 ${$$('.bubble-me').length} / 对方 ${$$('.bubble-ai').length}`);
}
console.log('✓ AI 打字中离场：无报错，回来补画记账结果（怒气 32）');

// 5. 把剩下的预设打完
for (const chip of chips.slice(1)) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}

const anger = Number($('.anger-num').textContent);
console.log('✓ 三个软肋后怒气值:', anger, '| 阶段:', $('.stage-pill').textContent);
if (anger !== 90) fail(`三个软肋应该到 90，实际 ${anger}`);

// 6. 对线中途去大厅：角标 + 回来续局（记录/怒气/轮次全在；默认不限时，无计时）
duelBack.click();
if (!$('.lobby')) fail('对线中点「大厅」应该回到大厅');
const liveBadge = $('.module-card.primary .module-badge');
if (!liveBadge || !/对局进行中/.test(liveBadge.textContent)) fail('进行中对局的主卡应有「对局进行中」角标');
$('.module-card.primary').click();
if (!$('.duel')) fail('点主卡应回到对线屏续局');
if (Number($('.anger-num').textContent) !== 90) fail('续局后怒气值应保持 90');
if ($$('.bubble-me').length !== 3 || $$('.bubble-ai').length !== 4) {
  fail(`续局后对话记录不完整：我方 ${$$('.bubble-me').length} 条 / 对方 ${$$('.bubble-ai').length} 条`);
}
if ($('.round-label').textContent !== '第 4 / 8 轮') fail(`续局后轮次标签不对：${$('.round-label').textContent}`);
if ($('.timer-label')) fail('不限时局大厅往返后也不该冒出倒计时');
console.log('✓ 中断恢复：角标/记录/怒气/轮次全部保留（默认不限时，无计时）');

// 7. 补一句自己的话，收掉这一局
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 4000));
if (!$('.report')) fail('没进报告屏');
console.log('✓ 报告屏:', $('.result-badge').textContent, '|', $('.title-name').textContent);
console.log('  统计:', $$('.stat').map((s) => `${s.querySelector('.stat-label').textContent}=${s.querySelector('.stat-value').textContent}`).join(' '));
console.log('  回放条数:', $$('.replay-item').length);

// 8. 报告屏返回大厅：已结束的局不再显示角标，再点主卡进选人
const lobbyBtn = $$('.report-actions .btn').find((b) => b.textContent === '返回大厅');
if (!lobbyBtn) fail('报告屏应该有「返回大厅」按钮');
lobbyBtn.click();
if (!$('.lobby')) fail('报告屏「返回大厅」后应回到大厅');
if ($('.module-card.primary .module-badge')) fail('已结束的局，主卡不应再显示对局角标');
$('.module-card.primary').click();
if (!$('.select')) fail('已结束局再点主卡应进选人屏');
console.log('✓ 报告返大厅：角标清除，主卡回选人');

// 9. 出结果瞬间人不在对线屏：不跳报告，主卡直接回选人
$$('.persona-card:not(.locked)')[1].click();
for (const chip of $$('.preset-chip')) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
$('.duel .back-btn').click(); // 同步离场：胜负判定在离场状态下落账
await new Promise((r) => setTimeout(r, 4000));
if (!$('.lobby')) fail('离场落账不应把玩家拽到报告屏');
if ($('.module-card.primary .module-badge')) fail('已出结果的局不该再显示进行中角标');
$('.module-card.primary').click();
if (!$('.select')) fail('已出结果的局，主卡应进选人而非续局');
console.log('✓ 离场落账：不跳报告，主卡回选人');

// 9b. 回合时限：30s 计时局 + 暂停按钮（冻结/继续/弹窗不偷暂停/大厅往返保持暂停）
window.localStorage.setItem('gang-ai:round-seconds:v1', '30');
$$('.persona-card:not(.locked)')[1].click();
if (!$('.duel')) fail('设置 30s 后开局应进对线屏');
if ($('.timer-label').textContent !== '30s') fail(`计时局应从 30s 起跳，实际「${$('.timer-label').textContent}」`);
const pauseBtn = $('.pause-btn');
if (!pauseBtn) fail('计时局应该有暂停按钮');
if (pauseBtn.textContent !== '暂停') fail(`暂停按钮初始应为「暂停」，实际「${pauseBtn.textContent}」`);
pauseBtn.click();
if (pauseBtn.textContent !== '继续') fail(`暂停后按钮应变「继续」，实际「${pauseBtn.textContent}」`);
await new Promise((r) => setTimeout(r, 1600));
if ($('.timer-label').textContent !== '30s') fail(`暂停期间倒计时应冻结在 30s，实际「${$('.timer-label').textContent}」`);
pauseBtn.click(); // 继续
await new Promise((r) => setTimeout(r, 1600));
const moved = Number($('.timer-label').textContent.replace('s', ''));
if (!(moved > 0 && moved < 30)) fail(`继续后倒计时应走秒（0<s<30），实际 ${moved}s`);
pauseBtn.click(); // 再暂停，冻结住
const frozen = $('.timer-label').textContent;
// 手动暂停时开关一次设置弹窗：关弹窗的自动恢复不能把暂停偷走
$('#settings-btn').click();
if (!$('.modal')) fail('暂停中应能打开设置弹窗');
$('.modal-head .ghost-btn').click();
await new Promise((r) => setTimeout(r, 1500));
if ($('.timer-label').textContent !== frozen) fail(`关设置弹窗不应解除手动暂停：前「${frozen}」后「${$('.timer-label').textContent}」`);
if ($('.pause-btn').textContent !== '继续') fail(`关弹窗后暂停按钮应仍为「继续」，实际「${$('.pause-btn').textContent}」`);
// 大厅往返：暂停状态与冻结秒数都保持
$('.duel .back-btn').click();
if (!$('.lobby')) fail('计时局回大厅应正常');
$('.module-card.primary').click();
if (!$('.duel')) fail('计时局回大厅后应能续局');
if ($('.timer-label').textContent !== frozen) fail(`大厅往返应保持冻结秒数：前「${frozen}」后「${$('.timer-label').textContent}」`);
if ($('.pause-btn').textContent !== '继续') fail(`大厅往返应保持暂停状态（按钮=继续），实际「${$('.pause-btn').textContent}」`);
await new Promise((r) => setTimeout(r, 1500));
if ($('.timer-label').textContent !== frozen) fail('保持暂停期间倒计时不该自己走');
// 收掉这一局，别给后面的设置弹窗小节留活局
$('.pause-btn').click(); // 继续
for (const chip of $$('.preset-chip')) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 4000));
if (!$('.report')) fail('计时局应能正常打完进报告');
const timerLobbyBtn = $$('.report-actions .btn').find((b) => b.textContent === '返回大厅');
if (!timerLobbyBtn) fail('报告屏应该有「返回大厅」按钮');
timerLobbyBtn.click();
if (!$('.lobby')) fail('计时局收尾后应能返回大厅');
console.log('✓ 回合时限：30s 起跳/暂停冻结/继续走秒/弹窗不偷暂停/往返保持暂停');

/* ------------------------------------------------------------------ */
/* 10. 设置弹窗：接入自己的 AI（放在最后，否则存了 key 后面会走网络）      */
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

// 对局：回合时限四档，点击即时落盘（此刻 storage 是 9b 节种进去的 30）
const roundSeg = $$('.round-seg-btn');
if (roundSeg.length !== 4) fail(`「对局」应有 4 档（不限时/15s/30s/60s），实际 ${roundSeg.length}`);
const activeRound = $('.round-seg-btn.is-active');
if (!activeRound || activeRound.textContent !== '30s') fail(`active 档应为「30s」（9b 节设置过），实际「${activeRound?.textContent}」`);
roundSeg[0].click(); // 不限时
if (window.localStorage.getItem('gang-ai:round-seconds:v1') !== '0') {
  fail(`点「不限时」应落盘 '0'，实际「${window.localStorage.getItem('gang-ai:round-seconds:v1')}」`);
}
if ($('.round-seg-btn.is-active').textContent !== '不限时') fail('active 档应随点击更新为「不限时」');
console.log('✓ 对局时限档位：四档齐/active 反映现状/点击即时落盘');

$('.modal-head .ghost-btn').click();
if ($('.modal')) fail('点 ✕ 应该关掉弹窗');
console.log('✓ 弹窗关闭');

/* ------------------------------------------------------------------ */
/* 11. 主题：顶栏切换 + localStorage 记忆                                */
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
/* 12. 皮肤：状态层 + 选择弹层 + 与深浅解耦                              */
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

// 13. 话术资料库（Phase B 接线）：大厅解锁进入、筛选/收藏/自建落 localStorage、返回、对局角标不受影响
libCard.click();
if (!$('.library')) fail('点资料库卡应进入 .library 视图');
if ($$('.entry-card').length < 100) fail(`资料库应渲染上百张卡（120 内置），实际 ${$$('.entry-card').length}`);
$$('[data-scene="family"]')[0].click();
const familyCards = $$('.entry-card').length;
if (familyCards !== 15) fail(`场景筛选（亲戚饭桌）应 15 张，实际 ${familyCards}`);
$$('[data-scene="all"]')[0].click(); // 复位，自建句才能出现在列表里
// 收藏落 localStorage：存的必须是点星那张卡的 id
const starId = $('.entry-card').dataset.id;
$('.entry-card .fav-btn').click();
const favArr = JSON.parse(window.localStorage.getItem('gang-ai:favorites:v1') ?? '[]');
if (favArr.length !== 1 || favArr[0] !== starId) {
  fail(`收藏应写入点星卡的 id（${starId}），实际 ${JSON.stringify(favArr)}`);
}
// 自建落 localStorage
$('.note-add-btn').click();
$('.nf-text').value = '验收用的自建句';
$('.note-save-btn').click();
const notesRaw = JSON.parse(window.localStorage.getItem('gang-ai:notes:v1') ?? '[]');
if (notesRaw.length !== 1 || notesRaw[0].text !== '验收用的自建句') fail(`自建应写入 localStorage，实际 ${window.localStorage.getItem('gang-ai:notes:v1')}`);
if (!$$('.entry-card').some((c) => c.textContent.includes('验收用的自建句'))) fail('保存后列表应出现自建句');
// 返回大厅
$('.library .back-btn').click();
if (!$('.lobby')) fail('资料库「← 大厅」应回大厅');
if (!$('.module-card.locked')) fail('擂台应仍是锁定卡');
// 起一局再进资料库往返：进行中角标不受影响
$('.module-card.primary').click();
$$('.persona-card:not(.locked)')[1].click();
$$('.preset-chip')[0].click();
$('.duel .back-btn').click();
const badgeBefore = $('.module-card.primary .module-badge')?.textContent ?? '';
if (!/对局进行中/.test(badgeBefore)) fail('前置失败：回大厅应有进行中角标');
$('.module-card.library').click();
if (!$('.library')) fail('对局中应也能进资料库');
$('.library .back-btn').click();
const badgeAfter = $('.module-card.primary .module-badge')?.textContent ?? '';
if (badgeAfter !== badgeBefore) fail(`资料库往返后角标应不变，前「${badgeBefore}」后「${badgeAfter}」`);
console.log('✓ 话术资料库：解锁进入/筛选/收藏/自建落盘/返回/角标不受影响');

// 14. 不限时局回归：发完一言后原地干等不该弹（沉默），开关设置弹窗也不该
//     （回归场景：startTimer/resumeTimer 没挡住 0 秒局，1 秒后幽灵超时把剩余回合级联烧成沉默）
$('.module-card.primary').click(); // 续上 13 节留下的活局（那一发还在离场记账中）
if (!$('.duel')) fail('续局应能回到对线屏');
await new Promise((r) => setTimeout(r, 1200)); // 先等 13 节那发落账补画完（它开局点的我方气泡不重建，基线 me=0/ai=2）
$$('.preset-chip')[1].click(); // 打出第 2 回合
await new Promise((r) => setTimeout(r, 2600)); // 等回合生成完，再干等远超 1 秒 —— 幽灵计时器会在这窗口里开火
const silenceBubbles = $$('.bubble-me').filter((b) => b.textContent === '（沉默）');
if (silenceBubbles.length !== 0) {
  fail(`不限时局干等不该冒出（沉默）回合，实际冒了 ${silenceBubbles.length} 个`);
}
if ($$('.bubble-me').length !== 1) fail(`干等后我方发言应只有 1 条（这里新发的），实际 ${$$('.bubble-me').length}`);
if ($$('.bubble-ai').length !== 3) fail(`对方发言应为 3 条（开场白 + 2 回合），实际 ${$$('.bubble-ai').length}`);
if ($('.round-label').textContent !== '第 3 / 8 轮') fail(`干等后轮次应停在第 3 轮，实际「${$('.round-label').textContent}」`);
if ($('.input').disabled) fail('不限时局干等不该锁输入框 —— 应等玩家说话');
// 开关一次设置弹窗：关弹窗触发的 onResume 也不许武装幽灵倒计时
$('#settings-btn').click();
if (!$('.modal')) fail('不限时局也应能打开设置弹窗');
$('.modal-head .ghost-btn').click();
await new Promise((r) => setTimeout(r, 1600));
const silenceAfterDialog = $$('.bubble-me').filter((b) => b.textContent === '（沉默）');
if (silenceAfterDialog.length !== 0) {
  fail(`关设置弹窗后不该冒出（沉默）回合，实际冒了 ${silenceAfterDialog.length} 个`);
}
if ($$('.bubble-me').length !== 1) fail(`关弹窗后我方发言仍应 1 条，实际 ${$$('.bubble-me').length}`);
console.log('✓ 不限时局：干等/关设置弹窗都不弹（沉默），轮次不推进，输入框可用');

console.log('\n全部通过 ✅');
process.exit(0);
