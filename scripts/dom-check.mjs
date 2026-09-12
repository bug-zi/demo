// 用 jsdom 真跑一遍 UI：选人 → 对线 → 点预设 → 打完一局 → 报告。
// 只验证「不报错 + 界面长出来了」，不测像素。
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { SCENES } from '../src/data/comebacks.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';

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

// B2 起新关卡插入会平移下标，选卡一律按人设名定位
const pickCard = (name) => {
  const card = $$('.persona-card').find((c) => c.querySelector('.persona-name')?.textContent === name);
  if (!card) fail(`选卡失败：找不到人设「${name}」（当前选人屏是否挂载？）`);
  return card;
};

// 1. 大厅：初始屏，三张模块卡全解锁（主卡 + 资料库 + 擂台都可点）
if (!$('.lobby')) fail('初始屏应该是大厅，实际没有 .lobby');
const moduleCards = $$('.module-card');
if (moduleCards.length !== 3) fail(`大厅应有 3 张模块卡，实际 ${moduleCards.length}`);
if ($$('.module-card.locked').length !== 0) fail('三模块全解锁后大厅不该有锁定卡');
if (!$('.module-card.primary')) fail('应该有主卡（对线房）');
const libCard = $('.module-card.library');
if (!libCard) fail('资料库应该是真卡（.module-card.library），不是锁定卡');
if (libCard.disabled) fail('资料库卡应该可点');
const arenaCard = $('.module-card.arena');
if (!arenaCard) fail('擂台应该是真卡（.module-card.arena）');
if (arenaCard.disabled) fail('擂台卡应该可点');
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
if (!$('.lobby .screen-bg')) fail('大厅应有 A2 场景背景层');
console.log('✓ 大厅初始：3 模块卡全解锁（对线房/资料库/擂台）+ 接入提示');
if ($('#engine-badge').textContent !== '本地引擎') fail('徽章文案不对');

// 2. 主卡 → 选人屏；选人屏可返回大厅，返回后再进是全新选人
$('.module-card.primary').click();
if (!$('.select')) fail('点主卡后没有进入选人屏');
const selectBack = $('.select .back-btn');
if (!selectBack) fail('选人屏应该有「返回大厅」按钮');
selectBack.click();
if (!$('.lobby')) fail('选人屏「返回大厅」后应回到大厅');
$('.module-card.primary').click();
const groupsInit = $$('.category-group');
const cardsAll = groupsInit.slice(0, 3).flatMap((g) => [...g.querySelectorAll('.persona-card')]);
if (cardsAll.length !== 18) fail(`选人屏应有 18 张关卡卡（5 原班 + B2 两房满 6 + B1 情商 6），实际 ${cardsAll.length}`);
if (cardsAll.some((c) => c.classList.contains('locked') || c.disabled)) fail('全开放后 18 张卡应全部可点（新档有心，不应有锁定/禁用卡）');
console.log('✓ 大厅 ⇄ 选人屏往返：', $$('.persona-name').map((n) => n.textContent).slice(0, 6).join(' / '), '…');

// 2b. 选人屏按三房分组：全开放 + 推荐路线 —— 每房首关带「推荐」徽标
const groups = $$('.category-group');
if (groups.length !== 3) fail(`选人屏应有 3 个分组（杠精/谈判/情商），实际 ${groups.length}`);
const groupNames = groups.map((g) => g.querySelector('.category-name').textContent);
if (groupNames.join(',') !== '杠精房,谈判房,情商房') {
  fail('分组顺序应为 杠精房→谈判房→情商房，实际 ' + groupNames.join(','));
}
const gangCards2b = [...groups[0].querySelectorAll('.persona-card')];
const dealCards2b = [...groups[1].querySelectorAll('.persona-card')];
const eqCards2b = [...groups[2].querySelectorAll('.persona-card')];
if (gangCards2b.length !== 6 || dealCards2b.length !== 6 || eqCards2b.length !== 6) {
  fail(`分组卡数不对：杠精房 ${gangCards2b.length} / 谈判房 ${dealCards2b.length} / 情商房 ${eqCards2b.length}`);
}
if (gangCards2b.some((c) => c.classList.contains('locked'))
  || dealCards2b.some((c) => c.classList.contains('locked'))
  || eqCards2b.some((c) => c.classList.contains('locked'))) {
  fail('全开放后三间房都不该有锁定卡');
}
if (gangCards2b[0].querySelector('.persona-name').textContent !== '评论区圣人') {
  fail('杠精房首关应是评论区圣人（d1 新手关）');
}
if (dealCards2b[0].querySelector('.persona-name').textContent !== '二手车贩子') {
  fail('谈判房首关应是二手车贩子（d1 新手关）');
}
if (eqCards2b[0].querySelector('.persona-name').textContent !== '奶茶洒了的同事') {
  fail('情商房首关应是奶茶洒了的同事（d1）');
}
if (!eqCards2b[0].classList.contains('current')) fail('情商房首关应带推荐徽标');
if (eqCards2b[0].querySelector('.level-badge')?.textContent !== '推荐') fail('推荐徽标文案应为「推荐」');
for (const card of eqCards2b.slice(1)) {
  if (card.classList.contains('current') || card.querySelector('.persona-name').textContent === '???') {
    fail('情商房 2-6 关应露真名且不带推荐徽标');
  }
}
if (!$('.select .hero-title').textContent.includes('选个对手')) fail('选人屏主标题应覆盖三房语境');
console.log('✓ 选人屏三房分组：全开放 18 卡真名可点，每房首关带「推荐」');

// 2c. 新手关：打杠精房首关（评论区圣人 d1，无阻力）→ 通关后推荐移到下一关
const gangFirst2c = gangCards2b[0];
if (!gangFirst2c.classList.contains('current')) fail('2c 前置：评论区圣人应高亮为当前关');
gangFirst2c.click();
if (!$('.duel')) fail('2c 前置：应能进新手关对线');
if ($('.persona-name').textContent !== '评论区圣人') fail('2c 前置：对手应是评论区圣人');
if (!$('.duel .duel-head .avatar img.avatar-img')) fail('2c 前置：对线屏头部头像应渲染立绘 img');
if (!$('.duel .screen-bg')) fail('2c 前置：对线屏应有房间场景背景层');
if ($$('.preset-chip').length !== 3) fail('2c 前置：预设话术应 3 条');
$$('.preset-chip')[0].click();
await waitTurnSettled16();
$$('.preset-chip')[1].click();
await waitTurnSettled16();
$$('.preset-chip')[2].click();
await waitTurnSettled16();
for (let i = 0; i < 200 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.report')) fail('2c：新手关三预设应能过关进报告');
if (!$('.report img.spotlight')) fail('2c：点火胜局战报应有破防时刻插画位');
[...document.querySelectorAll('.report-actions .btn')].find((b) => b.textContent === '换个对手').click();
if (!$('.select')) fail('2c：应回选人屏');
const qinqiAfter2c = pickCard('阴阳怪气亲戚');
if (qinqiAfter2c.disabled) fail('2c：阴阳怪气亲戚应可点');
if (qinqiAfter2c.querySelector('.persona-name').textContent !== '阴阳怪气亲戚') fail('2c：应显示真名');
if (!qinqiAfter2c.classList.contains('current')) fail('2c：通关首关后推荐应移到阴阳怪气亲戚');
const gangCleared2c = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1')).cleared.gang;
if (JSON.stringify(gangCleared2c) !== JSON.stringify([0])) fail(`2c：通关账应为 [0]，实际 ${JSON.stringify(gangCleared2c)}`);
console.log('✓ 新手关：评论区圣人三预设过关 → 推荐移到亲戚 + 通关账 [0]');

// 2d. portrait 立绘：全开放后 18 张人设卡头像一律渲染 <img> 立绘
const openCards2d = $$('.persona-card');
if (openCards2d.length !== 18) fail(`2d 前置：应有 18 张人设卡，实际 ${openCards2d.length}`);
for (const card of openCards2d) {
  if (!card.querySelector('.avatar img.avatar-img')) fail('2d：人设卡的选人卡头像应渲染立绘 img');
}
const portraitSrc2d = pickCard('评论区圣人').querySelector('.avatar img.avatar-img')?.getAttribute('src') || '';
if (!portraitSrc2d.includes('/assets/art/portraits/shengren.png')) {
  fail(`2d：立绘 src 应指向 portraits/shengren.png，实际 ${portraitSrc2d}`);
}
console.log('✓ portrait 立绘：18 卡头像全量立绘（对局头部见 2c）');

// 3. 进入对线屏
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
if (!$('.duel')) fail('点卡片后没有进入对线屏');
const opener = $('.bubble-ai').textContent;
if (!opener) fail('开场白没渲染');
console.log('✓ 对线屏开场:', opener);
if ($$('.preset-chip').length !== 3) fail('预设话术应该有 3 个');
if ($('.timer-label')) fail('默认不限时的局不该有倒计时标签');
if ($('.pause-btn')) fail('不限时的局不该有暂停按钮');
console.log('✓ 默认不限时：无倒计时、无暂停按钮');

// 4. AI 打字期间跑路：退出回对线房，回合离场记账，恢复条一键续局补画（不报错）
const duelBack = $('.duel .back-btn');
if (!duelBack) fail('对线屏头部应该有「对线房」退出按钮');
if (duelBack.textContent.includes('大厅')) fail('对局退出按钮应指向对线房而非大厅');
const chips = $$('.preset-chip');
chips[0].click(); // 「您家孩子」→ 命中软肋 kid(32)
duelBack.click(); // 同步跟一刀：趁回合还没生成完，退到对线房
if (!$('.select')) fail('AI 打字中点「对线房」应立即回到对线房');
if (!$('.resume-strip')) fail('有活局时对线房应显示「回到对局」恢复条');
await new Promise((r) => setTimeout(r, 1500)); // 等回合在「离场」状态下记账完成
$('.resume-go').click();
if (!$('.duel')) fail('点恢复条「回到对局」应续局');
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

// 6. 对线中途退出：对线房恢复条一键续局；大厅角标路径也仍在（记录/怒气/轮次全在；默认不限时，无计时）
duelBack.click();
if (!$('.select')) fail('对线中点「对线房」应该回到对线房');
if (!$('.resume-go')) fail('对线房应显示「回到对局」恢复条');
$('.resume-go').click();
if (!$('.duel')) fail('点恢复条应回到对线屏续局');
if (Number($('.anger-num').textContent) !== 90) fail('续局后怒气值应保持 90');
if ($$('.bubble-me').length !== 3 || $$('.bubble-ai').length !== 4) {
  fail(`续局后对话记录不完整：我方 ${$$('.bubble-me').length} 条 / 对方 ${$$('.bubble-ai').length} 条`);
}
if ($('.round-label').textContent !== '第 4 / 8 轮') fail(`续局后轮次标签不对：${$('.round-label').textContent}`);
if ($('.timer-label')) fail('不限时局对线房往返后也不该冒出倒计时');
// 恢复路径二：对线房 → 大厅，主卡「进行中」角标续局依旧可用
duelBack.click();
$('.select .back-btn').click();
if (!$('.lobby')) fail('对线房「大厅」应回到大厅');
const liveBadge = $('.module-card.primary .module-badge');
if (!liveBadge || !/对局进行中/.test(liveBadge.textContent)) fail('进行中对局的主卡应有「对局进行中」角标');
$('.module-card.primary').click();
if (!$('.duel')) fail('点主卡应回到对线屏续局');
console.log('✓ 中断恢复：恢复条/大厅角标双路续局，记录/怒气/轮次全保留（默认不限时，无计时）');

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
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
for (const chip of $$('.preset-chip')) {
  chip.click();
  await new Promise((r) => setTimeout(r, 1200));
}
$('.input').value = '但是您当年不也是这么过来的吗？';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
$('.duel .back-btn').click(); // 同步离场：胜负判定在离场状态下落账
await new Promise((r) => setTimeout(r, 4000));
if (!$('.select')) fail('离场落账不应把玩家拽到报告屏，应停在对线房');
if ($('.resume-strip')) fail('已出结果的局不该再显示恢复条');
$('.select .back-btn').click();
if (!$('.lobby')) fail('已出结果的局应能经对线房回大厅');
if ($('.module-card.primary .module-badge')) fail('已出结果的局不该再显示进行中角标');
$('.module-card.primary').click();
if (!$('.select')) fail('已出结果的局，主卡应进选人而非续局');
console.log('✓ 离场落账：不跳报告，恢复条清空，主卡回选人');

// 9c. 对线房恢复条 + 换人静默替换：活局挂着时选新对手，直接开新局顶掉旧局
pickCard('阴阳怪气亲戚').click(); // 再开一局（与前后小节同一人设，好算账）
$('.input').value = '说点人话吧';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await waitTurnSettled16(); // 攒出一个活局
$('.duel .back-btn').click();
if (!$('.select') || !$('.resume-strip')) fail('9c：退出应回对线房且显示恢复条');
pickCard('阴阳怪气亲戚').click(); // 换人重开 = 静默替换
if (!$('.duel')) fail('9c：选人屏点对手应直接开新局');
if (Number($('.anger-num').textContent) !== 0) fail(`9c：新局怒气应从 0 起步（旧活局被替换），实际 ${$('.anger-num').textContent}`);
if ($$('.bubble-me').length !== 0 || $$('.bubble-ai').length !== 1) {
  fail(`9c：新局不应带旧局记录（仅开场白 1 条），实际我方 ${$$('.bubble-me').length} / 对方 ${$$('.bubble-ai').length}`);
}
$('.duel .back-btn').click();
if (!$('.select') || !$('.resume-strip')) fail('9c 收尾：新活局退回对线房应显示恢复条');
console.log('✓ 对线房恢复条 + 换人静默替换旧活局');

// 9b. 回合时限：30s 计时局 + 暂停按钮（冻结/继续/弹窗不偷暂停/大厅往返保持暂停）
window.localStorage.setItem('gang-ai:round-seconds:v1', '30');
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
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
// 对线房 → 大厅往返：暂停状态与冻结秒数都保持
$('.duel .back-btn').click();
if (!$('.select')) fail('计时局退出应回对线房');
if (!$('.resume-go')) fail('计时局活局应有恢复条');
$('.select .back-btn').click();
if (!$('.lobby')) fail('计时局应能经对线房回大厅');
$('.module-card.primary').click();
if (!$('.duel')) fail('计时局回大厅后应能续局');
if ($('.timer-label').textContent !== frozen) fail(`对线房/大厅往返应保持冻结秒数：前「${frozen}」后「${$('.timer-label').textContent}」`);
if ($('.pause-btn').textContent !== '继续') fail(`对线房/大厅往返应保持暂停状态（按钮=继续），实际「${$('.pause-btn').textContent}」`);
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
if (!$('.module-card.arena') || $('.module-card.arena').disabled) fail('擂台应保持真卡可点');
// 起一局再进资料库往返：进行中角标不受影响（打亲戚 —— 后面 14/15 节续用这局，无阻力参数好算账）
$('.module-card.primary').click();
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
$$('.preset-chip')[0].click();
$('.duel .back-btn').click();
if (!$('.select') || !$('.resume-strip')) fail('前置失败：对局退出应回对线房且有恢复条');
$('.select .back-btn').click();
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

// 15. 表情包：贴纸按钮/弹层/插入输入框、随文字发与纯贴纸回合、AI 回贴、战报回放
//     （14 节结束时人还在对线屏，留下一局活局：亲戚、第 3 轮、怒气 60 —— 直接续用）
if (!$('.duel')) fail('15 节前置：应仍在 14 节的对线屏');
const stickerBtn = $('.sticker-btn');
if (!stickerBtn) fail('输入行应有贴纸按钮');
if (!stickerBtn.querySelector('.i-add_reaction')) fail('贴纸按钮应用 add_reaction 图标');
stickerBtn.click();
const picker = $('.sticker-picker');
if (!picker) fail('点贴纸按钮应弹出贴纸选择层');
const cells = $$('.sticker-cell');
if (cells.length !== 12) fail(`贴纸弹层应有 12 格，实际 ${cells.length}`);
if (!cells[0].textContent.includes('😤') || !cells[0].textContent.includes('就这？')) {
  fail('贴纸格应含大 emoji 与吐槽小字');
}
cells[0].click();
if ($('.sticker-picker')) fail('选中后弹层应关闭');
if (!$('.input').value.includes('😤')) fail('点贴纸应把 emoji 插进输入框');
// 点外部也能关
stickerBtn.click();
document.body.click();
if ($('.sticker-picker')) fail('点外部应关闭贴纸弹层');
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); // 已关时再按 Esc 不报错

// 15a. 文字+贴纸一起发：hit 12 + 首张贴纸 8 → 60+20=80，quip 带贴纸小注，AI 回贴
const realRandom = Math.random;
Math.random = () => 0; // 玩家先发贴纸 → AI 必回敬（replyToSticker 概率 0.5）
$('.input').value = '但是您这话说的，可是过年那会儿您明明不是这么讲的' + $('.input').value;
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 2500));
if (Number($('.anger-num').textContent) !== 80) fail(`hit+贴纸应变 80，实际 ${$('.anger-num').textContent}`);
if (!$$('.bubble-me').some((b) => b.textContent.includes('可是过年那会儿'))) fail('文字气泡应照常渲染');
const meStickers = $$('.sticker-row.me .sticker-bubble');
if (meStickers.length !== 1 || !meStickers[0].textContent.includes('😤')) fail('应渲染我方贴纸气泡');
if (!$$('.quip').pop().textContent.includes('贴纸')) fail('quip 行应带贴纸小注');
if ($$('.sticker-row.ai .sticker-bubble').length !== 1) fail('AI 收到贴纸后应回敬一张');
if ($('.input').value) fail('发送后输入框应清空');

// 15b. 纯贴纸回合：hitType 斗图、第 2 张减半（+4）→ 84
$('.sticker-btn').click();
$$('.sticker-cell')[0].click(); // 又是 smug —— 换图也拦不住递减
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 2500));
if (Number($('.anger-num').textContent) !== 84) fail(`第 2 张贴纸应 +4 到 84，实际 ${$('.anger-num').textContent}`);
if ($$('.sticker-row.me .sticker-bubble').length !== 2) fail('纯贴纸回合也应有我方贴纸气泡');
if (!$$('.quip').pop().textContent.includes('斗图')) fail('纯贴纸回合判定标签应为「斗图」');
if (!$$('.quip').pop().textContent.includes('贴脸开大')) fail('纯贴纸回合飘字应用斗图文案（贴脸开大），而非 miss 档的「没接住」');
Math.random = realRandom;

// 15c. 剩最后一个预设收局（demo 软肋 +30 → 114 钳到 100 胜）→ 战报回放带贴纸
$$('.preset-chip').filter((c) => !c.disabled)[0].click();
await new Promise((r) => setTimeout(r, 4200));
if (!$('.report')) fail('贴纸局应能正常打完进报告');
const replayItems = $$('.replay-item');
if (replayItems.length !== 5) fail(`本局应 5 个回合，实际 ${replayItems.length}`);
const stickerReplay = replayItems.find((r) => r.textContent.includes('【😤'));
if (!stickerReplay) fail('战报回放应把贴纸记成【emoji 文案】');
const aiStickerReplay = replayItems.filter((r) => r.querySelector('.replay-ai').textContent.match(/【(🙄|😤)/));
if (aiStickerReplay.length < 2) fail('AI 回敬的贴纸也应出现在回放里（应至少 2 条）');
console.log('✓ 表情包：弹层/插入/文字+贴纸/纯贴纸递减/AI 回贴/战报回放');

/* ------------------------------------------------------------------ */
/* 16. A2 情绪演出：阶段切换反馈 + 专属破防演出 + 玩家败北演出            */
/* ------------------------------------------------------------------ */

// 16a. 阶段切换反馈：亲戚局第 1 轮停在礼貌不报幕；第 2 轮跨 35 → 报幕行 + 三个动效类 + log 阶段染色
$$('.report-actions .btn').find((b) => b.textContent === '再来一局').click(); // 15 节的局是亲戚
if (!$('.duel')) fail('16a 前置：再来一局应直接开亲戚新局');
$$('.preset-chip')[0].click(); // kid(32)：0 → 32，仍礼貌
await new Promise((r) => setTimeout(r, 1200));
if ($$('.stage-line').length !== 0) fail('礼貌起步的第一轮不该有阶段报幕');
$$('.preset-chip')[1].click(); // hongbao(28)：32 → 60，跨 35 进阴阳
await new Promise((r) => setTimeout(r, 1200));
const stageLines = $$('.stage-line');
if (stageLines.length !== 1 || !/阴阳/.test(stageLines[0].textContent)) {
  fail(`跨 35 应报幕一次「进入阴阳期」，实际 ${stageLines.length} 条：${stageLines.map((l) => l.textContent).join('/')}`);
}
if (!$('.anger-fill').classList.contains('flash')) fail('跨阶段回合应给怒气条挂 flash 动效');
if (!$('.duel-head .avatar').classList.contains('shake')) fail('跨阶段回合应给对手头像挂 shake 动效');
if (!$('.stage-pill').classList.contains('pop')) fail('跨阶段回合应给阶段胶囊挂 pop 动效');
if ($('.log').dataset.stage !== 'sarcastic') fail(`log 应带 data-stage 驱动气泡变色，实际 ${$('.log').dataset.stage}`);
console.log('✓ 阶段切换：报幕行/怒气条闪红/头像抖动/胶囊弹跳/log 阶段染色');

// 16b. 亲戚专属破防演出（quit）：头像变灰 + 「对方已退出群聊」（演出后才跳报告，轮询捕抓）
$$('.preset-chip')[2].click(); // demo(30)：60 → 90，上头
await new Promise((r) => setTimeout(r, 1200));
$('.input').value = '但是您当年不也是这么过来的吗？'; // hit(12)：90 → 100 破防
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
let sawGone = false;
let sawExit = false;
for (let i = 0; i < 100 && !$('.report'); i += 1) {
  if ($('.duel.ai-gone')) sawGone = true;
  if ($$('.system-line.exit').some((l) => l.textContent.includes('对方已退出群聊'))) sawExit = true;
  await new Promise((r) => setTimeout(r, 50));
}
if (!sawGone) fail('亲戚局破防应播放退群演出（.duel.ai-gone）');
if (!sawExit) fail('亲戚局收场文案应为「对方已退出群聊」');
if (!$('.report')) fail('破防演出放完应进报告屏');
console.log('✓ 亲戚破防演出：头像变灰 + 退出群聊');

// 16c. 网友专属破防演出（rapid）：连发短消息 + 「对方已开启好友验证」
// 回合必须逐手等落地（busy 期间 input 被禁用）：chip 回合没等完就打字，
// submitTurn 收尾会把排队的 input.value 清空，那句话就丢了
async function waitTurnSettled16() {
  for (let i = 0; i < 80 && $('.input')?.disabled; i += 1) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 100));
}
async function typeAndWait16(text) {
  $('.input').value = text;
  $('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitTurnSettled16();
}
$$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
pickCard('杠精网友').click(); // 杠精房第 3 关
// 3.0 阻力参数（d3：guard 0.95 / drift 2）：27 → 55 → 82 → 93 → 106 破防
$$('.preset-chip')[0].click();
await waitTurnSettled16();
await typeAndWait16('我要截图发群里，你自己看看');
await typeAndWait16('你这逻辑前后矛盾啊，自己品');
await typeAndWait16('你说得对，你说都对');
// 最后一击（106 破防）不等待 —— 轮询窗口会把 rapid 演出整个等完，收场行就漏拍了
$('.input').value = '我就是要截图发群里挂出来';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
let burstSeen = 0;
let sawVerify = false;
for (let i = 0; i < 200 && !(sawVerify && $('.report')); i += 1) {
  if (!sawVerify) {
    const exit = $$('.system-line.exit').find((l) => l.textContent.includes('对方已开启好友验证'));
    if (exit) {
      sawVerify = true;
      burstSeen = $$('.bubble-ai.burst').length;
    }
  }
  await new Promise((r) => setTimeout(r, 50));
}
if (!sawVerify) fail('网友局收场文案应为「对方已开启好友验证」');
if (burstSeen < 4) fail(`rapid 演出应连发至少 4 条短消息（.bubble-ai.burst），实际 ${burstSeen}`);
if (!$('.report')) fail('rapid 演出放完应进报告屏');
console.log(`✓ 网友破防演出：连发 ${burstSeen} 条 + 好友验证`);

// 16d. 玩家败北演出：两次自爆 → 自己最后一条气泡变灰 + 「你说不出话了」
$$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
$('.input').value = '你懂个屁'; // 自爆 1
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 1500));
$('.input').value = '你就是个废物'; // 自爆 2 → lose
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
let sawMutedMe = false;
let sawCantSpeak = false;
for (let i = 0; i < 100 && !$('.report'); i += 1) {
  if ($('.bubble-me.muted-me')) sawMutedMe = true;
  if ($$('.system-line').some((l) => l.textContent.includes('你说不出话了'))) sawCantSpeak = true;
  await new Promise((r) => setTimeout(r, 50));
}
if (!sawMutedMe) fail('败北时应把自己最后的气泡灰掉（.bubble-me.muted-me）');
if (!sawCantSpeak) fail('败北文案应出现「你说不出话了」');
if (!$('.report')) fail('败北演出放完应进报告屏');
console.log('✓ 败北演出：自己气泡变灰 + 你说不出话了');

/* ------------------------------------------------------------------ */
/* 17. 好友擂台：大厅解锁 + hot-seat 全流程（本地评分，未配 key）          */
/* ------------------------------------------------------------------ */

const backToLobby17 = $$('.report-actions .btn').find((b) => b.textContent === '返回大厅');
if (!backToLobby17) fail('17 节前置：报告屏应有「返回大厅」');
backToLobby17.click();
if (!$('.lobby')) fail('17 节前置：应回到大厅');

// 大厅：三张真卡，零锁定卡（擂台解锁是最后一块）
const lobbyCards17 = $$('.module-card');
if (lobbyCards17.length !== 3) fail(`大厅应有 3 张模块卡，实际 ${lobbyCards17.length}`);
if ($$('.module-card.locked').length !== 0) fail('擂台解锁后大厅不该再有锁定卡');
const arenaCard17 = $('.module-card.arena');
if (!arenaCard17 || arenaCard17.disabled) fail('擂台应是可点的真卡（.module-card.arena）');
if ($('.lobby .footnote').textContent.includes('装修')) fail('三模块全解锁后，大厅脚注不该再说「正在装修」');
arenaCard17.click();
if (!$('.arena')) fail('点擂台卡应进入擂台视图');
if (!$('.arena-intro')) fail('擂台开局应是 intro 相位');
if ($$('.arena-name-input').length !== 2) fail('intro 应有双方名字输入框');

// 命名开局 → 第 1 轮 P1 先答 → 场景卡 + 60 秒倒计时
$$('.arena-name-input')[0].value = '甲哥';
$$('.arena-name-input')[1].value = '乙姐';
$('.arena-start').click();
if (!$('.arena-round')) fail('开局应进第 1 轮答题相位');
if (!$('.scenario-line') || !$('.scenario-line').textContent.trim()) fail('场景原话应大字渲染');
if ($('.arena-timer')?.textContent !== '60s') fail(`答题倒计时应为 60s，实际「${$('.arena-timer')?.textContent}」`);
if (!$('.arena-round-meta').textContent.includes('甲哥')) fail('第 1 轮先答者应为甲哥（P1）');

// P1 提交 → 交接屏：交给乙姐、答案不泄漏
const p1Line17 = '这一句是我认真写的话一共十几个字呢';
$('.arena-input').value = p1Line17;
$('.arena-send').click();
if (!$('.arena-handoff')) fail('P1 提交后应进交接屏');
if (!$('.arena-handoff').textContent.includes('乙姐')) fail('交接屏应提示交给乙姐');
if (window.document.body.textContent.includes(p1Line17)) fail('交接屏不得泄漏先答者的答案');
$('.handoff-btn').click();

// P2 答题 → 本地评分揭晓（双侧 0-10 + 短评）
$('.arena-input').value = '嗯';
$('.arena-send').click();
await new Promise((r) => setTimeout(r, 900));
if (!$('.arena-reveal')) fail('双方答完应出评分揭晓');
if ($$('.reveal-card').length !== 2) fail(`揭晓应有两张答案卡，实际 ${$$('.reveal-card').length}`);
if ($$('.reveal-score').some((el) => !(Number(el.textContent) >= 0 && Number(el.textContent) <= 10))) {
  fail('分数应都在 0-10');
}
if ($$('.reveal-comment').some((el) => !el.textContent.trim())) fail('双方短评不应为空');
$('.arena-next').click();

// 第 2 轮 P2 先答（先答权轮换）→ 打完全场
if (!$('.arena-round')) fail('第 2 轮应进新答题相位');
if (!$('.arena-round-meta').textContent.includes('乙姐')) fail('第 2 轮先答者应为乙姐（P2）');
async function finishRound17(firstText, secondText) {
  $('.arena-input').value = firstText;
  $('.arena-send').click();
  if (!$('.arena-handoff')) fail('先答提交后应进交接屏');
  $('.handoff-btn').click();
  $('.arena-input').value = secondText;
  $('.arena-send').click();
  await new Promise((r) => setTimeout(r, 900));
}
const p1Long17 = '我这边也是一句很稳很长的话不输任何人';
await finishRound17('嗯', p1Long17);
if (!$('.arena-reveal')) fail('第 2 轮应出揭晓');
$('.arena-next').click();
await finishRound17(p1Long17, '嗯');
$('.arena-next').click(); // 末轮按钮是「看终盘复盘」
await new Promise((r) => setTimeout(r, 900));

// 终盘复盘：引擎判胜 + 逐轮表 + 金句 + 本地粗评提示（未配 key）
if (!$('.arena-recap')) fail('三轮打完应出终盘复盘');
if (!$('.recap-winner').textContent.includes('甲哥') || !$('.recap-winner').textContent.includes('胜出')) {
  fail('胜者标题应为「甲哥 胜出」（本地评分 15:6）：' + $('.recap-winner').textContent);
}
if ($$('.recap-round-row').length !== 3) fail(`逐轮小表应 3 行，实际 ${$$('.recap-round-row').length}`);
if (!$('.golden-card') || !$('.golden-card').textContent.includes(p1Line17)) fail('金句卡应含甲哥的最高分句');
if (!$('.arena-hint') || !$('.arena-hint').textContent.includes('本地粗评')) fail('未接入 AI 时终盘应有「本地粗评」提示');

// 返回大厅：擂台离场即弃局，再进是全新一场
const arenaBack17 = $$('.arena-recap .btn').find((b) => b.textContent === '返回大厅');
if (!arenaBack17) fail('终盘应有「返回大厅」按钮');
arenaBack17.click();
if (!$('.lobby')) fail('擂台「返回大厅」应回大厅');
$('.module-card.arena').click();
if (!$('.arena-intro')) fail('再进擂台应是全新一场（离场即弃局）');
console.log('✓ 好友擂台：大厅解锁/交接屏防偷看/先答轮换/逐轮评分/终盘复盘/返回大厅');

/* ------------------------------------------------------------------ */
/* 18. 3.0 成长档案（M1）：名片卡 / 心池条 / 结算区 / 心=0 锁开局 / 演示模式 */
/* ------------------------------------------------------------------ */

// 18a. 大厅名片卡：Lv / 金币 / 生命 / 成就占位，数值与存档一致
// （17 节结尾停在擂台 intro 验证弃局 —— 先回大厅）
$$('.arena .back-btn')[0].click();
if (!$('.lobby')) fail('18a 前置：应从擂台回到大厅');
if (!$('.profile-strip')) fail('大厅应有成长名片卡（.profile-strip）');
const stripText = $('.profile-strip').textContent;
const coinsInLobby = Number(/金币 (\d+)/.exec(stripText)?.[1] ?? -1);
const heartsInLobby = Number(/生命 (\d+)\/5/.exec(stripText)?.[1] ?? -1);
if (!/^Lv\.\d+/.test(stripText)) fail(`名片卡应有等级 Lv.N，实际「${stripText}」`);
if (coinsInLobby < 0) fail(`名片卡应显示金币，实际「${stripText}」`);
if (!(heartsInLobby >= 0 && heartsInLobby <= 5)) fail(`名片卡应显示生命 x/5，实际「${stripText}」`);
const profileAtLobby = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1') ?? '{}');
if (profileAtLobby.hearts !== heartsInLobby) {
  fail(`名片卡心数（${heartsInLobby}）应与存档一致（${profileAtLobby.hearts}）`);
}
if (profileAtLobby.coins !== coinsInLobby) {
  fail(`名片卡金币（${coinsInLobby}）应与存档一致（${profileAtLobby.coins}）`);
}
if (!$('.profile-strip').textContent.includes('成就')) fail('名片卡应有成就进度占位');
console.log('✓ 名片卡：Lv/金币/生命/成就占位，与存档一致');

// 18b. 选人屏心池条：5 颗心 + 倒计时 + 补心按钮；按钮可用性与心数/金币挂钩
$('.module-card.primary').click();
if (!$('.select')) fail('18b 前置：应进选人屏');
if (!$('.hearts-bar')) fail('选人屏应有心池条（.hearts-bar）');
if ($$('.hearts-bar .heart').length !== 5) fail(`心池条应有 5 颗心，实际 ${$$('.hearts-bar .heart').length}`);
const filledHearts = $$('.hearts-bar .heart:not(.dim)').length;
if (filledHearts !== heartsInLobby) fail(`亮起的心应 ${heartsInLobby} 颗，实际 ${filledHearts}`);
if (!$('.hearts-eta')) fail('心池条应有恢复倒计时位（满员显示「满员」）');
const buyBtn18 = $('.hearts-buy');
if (!buyBtn18) fail('心池条应有「50 币补一颗」按钮');
if (buyBtn18.disabled !== (heartsInLobby >= 5)) fail('满心时补心按钮应禁用、缺心时可用');
if ($$('.persona-card.no-hearts').length !== 0) fail('有心时人设卡不应禁用');
console.log('✓ 心池条：5 心/倒计时/补心按钮，状态与存档一致');

// 18c. 胜局结算区：d3 网友 = 经验 +60 / 首通金币 +110 / 不掉心
pickCard('杠精网友').click(); // 杠精房第 3 关
// 3.0 阻力参数（d3：guard 0.95 / drift 2）：27 → 55 → 82 → 93 → 106 破防，逐手等落地
$$('.preset-chip')[0].click();
await waitTurnSettled16();
await typeAndWait16('我要截图发群里，你自己看看');
await typeAndWait16('你这逻辑前后矛盾啊，自己品');
await typeAndWait16('你说得对，你说都对');
await typeAndWait16('我就是要截图发群里挂出来');
for (let i = 0; i < 100 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.report')) fail('18c 前置：应打进报告屏');
if (!$('.settlement')) fail('战报应有成长结算区（.settlement）');
const settleText = $('.settlement').textContent;
// 16c 节已首通过网友（gang:1），18c 是复刷局：经验照发 60，金币按首通 30% = 33
if (!/\+60/.test(settleText)) fail(`d3 胜局经验应 +60，实际「${settleText}」`);
if (!/金币\s*\+33/.test(settleText)) fail(`复刷胜局金币应 +33（110×0.3），实际「${settleText}」`);
const profileAfterWin = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1'));
const levelUpCount18 = $$('.settle-levelup').length;
if (profileAfterWin.coins - coinsInLobby !== 33 + levelUpCount18 * 100) {
  fail(`金币增量应为 33+升级奖（实际差 ${profileAfterWin.coins - coinsInLobby}，升级横幅 ${levelUpCount18} 条）`);
}
if (profileAfterWin.hearts !== heartsInLobby) fail('胜局不应掉心');
console.log('✓ 结算区（复刷胜）：经验 +60 / 金币 +33 / 心不变');

// 18d. 败局结算：掉 1 心
$$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进） // 亲戚
$('.input').value = '你懂个屁';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 1500));
$('.input').value = '你就是个废物';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
for (let i = 0; i < 100 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.settlement')) fail('败局战报也应有结算区');
if (!/心\s*-1/.test($('.settlement').textContent)) fail(`败局结算应显示 心 -1，实际「${$('.settlement').textContent}」`);
const profileAfterLose = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1'));
if (profileAfterLose.hearts !== profileAfterWin.hearts - 1) fail('败局应扣 1 心');
console.log('✓ 结算区（败）：心 -1 落账');

// 18e. 心=0 锁开局 + 演示模式兜底：连输到 0 心 → 人设卡全禁 → 演示模式解锁
async function quickLose18() {
  $$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
  pickCard('阴阳怪气亲戚').click(); // 杠精房第 2 关（全开放可直接进）
  $('.input').value = '你懂个屁';
  $('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  $('.input').value = '你就是个废物';
  $('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
  if (!$('.report')) fail('18e 前置：速败局应进报告');
}
for (let i = profileAfterLose.hearts; i > 0; i -= 1) await quickLose18();
let profileZero = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1'));
if (profileZero.hearts !== 0) fail(`连败后心数应为 0，实际 ${profileZero.hearts}`);
$$('.report-actions .btn').find((b) => b.textContent === '返回大厅').click();
$('.module-card.primary').click();
if (!$('.select')) fail('18e 前置：应进选人屏');
if ($$('.persona-card.no-hearts').length !== 18) fail(`心=0 时人设卡应全部禁用，实际 ${$$('.persona-card.no-hearts').length}`);
if ($$('.hearts-bar .heart:not(.dim)').length !== 0) fail('心=0 应全灰');
if (!$$('.persona-card.no-hearts')[0].disabled) fail('心=0 时人设卡应真实 disabled');
if (!$('.hearts-guide')) fail('心=0 应出现引导文案（等恢复/补心/演示模式）');
const buyAtZero = $('.hearts-buy');
if (!buyAtZero.disabled && profileZero.coins < 50) fail('金币不足 50 时补心按钮应禁用');

// 演示模式：设置里打开 → 心池条换演示徽章 + 人设卡解锁
$('#settings-btn').click();
const demoSeg = $$('.demo-seg-btn');
if (demoSeg.length !== 2) fail(`设置里应有演示模式两档（关/开），实际 ${demoSeg.length}`);
demoSeg[1].click();
if (!$('.hearts-bar .demo-badge')) fail('开演示模式后心池条应换成「演示模式」徽章');
if ($$('.persona-card.no-hearts').length !== 0) fail('演示模式下人设卡应解锁');
$('.modal-head .ghost-btn').click();
if (!$('.hearts-bar .demo-badge')) fail('关弹窗后演示徽章应保留');

// 收尾：关掉演示模式，回到心=0 锁定态（验证回落）
$('#settings-btn').click();
$$('.demo-seg-btn')[0].click();
$('.modal-head .ghost-btn').click();
if ($$('.persona-card.no-hearts').length !== 18) fail('关演示模式后应回到心=0 锁定态（18 张全禁）');
if ($('.hearts-bar .demo-badge')) fail('关演示模式后徽章应消失');
console.log('✓ 心=0 锁开局 + 演示模式兜底：锁/解/回落全通');

/* ------------------------------------------------------------------ */
/* 19. 房内关卡梯（全开放+推荐路线）：真名展示/跳关可进/推荐落位/复刷/进度  */
/* ------------------------------------------------------------------ */

// 前置：18e 结束时心=0、演示模式关、停在选人屏。开演示模式让 19 节能打局（不耗心）。
$('#settings-btn').click();
$$('.demo-seg-btn')[1].click();
$('.modal-head .ghost-btn').click();

// 19a. 全开放展示：房内按难度排梯，所有关露真名、可点；推荐徽标落在本房第一个未通关的关
const groups19 = $$('.category-group');
const gangCards19 = [...groups19[0].querySelectorAll('.persona-card')];
const dealCards19 = [...groups19[1].querySelectorAll('.persona-card')];
if (gangCards19.length !== 6 || dealCards19.length !== 6) {
  fail(`19a 前置：房内卡数应 杠精 6 / 谈判 6，实际 ${gangCards19.length}/${dealCards19.length}`);
}
const [, , , laobanCard19] = dealCards19;
if (laobanCard19.disabled || laobanCard19.classList.contains('locked')) fail('19a：全开放后未通关卡也应露真名可点');
if (laobanCard19.classList.contains('current')) fail('19a：非推荐卡不该带推荐徽标');
const brightLaoban19 = laobanCard19.querySelectorAll('.persona-stars .icon:not(.star-dim)').length;
if (brightLaoban19 !== 4) fail(`19a：老板卡应显示 4 星难度，实际 ${brightLaoban19}`);
// 梯序正本由 profile-check 的 ladderFor 断言负责；DOM 侧只验「全露真名 + 推荐落位」
if (dealCards19.some((c) => c.querySelector('.persona-name').textContent === '???')) {
  fail('19a：谈判房不应再有 ??? 卡');
}
if (!dealCards19[0].classList.contains('current')) fail('19a：谈判房推荐应落在首关（贩子，尚无通关）');
// 前置流程已通关杠精房前三关（圣人/亲戚/网友）→ 第一未通关（半瓶水）应带推荐徽标
const banping19 = pickCard('半瓶水大神');
if (!banping19.classList.contains('current')) fail('19a：半瓶水大神应为推荐关');
if (banping19.querySelector('.level-badge')?.textContent !== '推荐') fail('19a：推荐徽标文案应为「推荐」');
for (const name of ['阴阳怪气亲戚', '杠精网友']) {
  if (pickCard(name).classList.contains('current')) fail(`19a：${name} 已通关，不该再带推荐徽标`);
}
console.log('✓ 全开放展示：真名+星数 / 推荐落位（谈判=首关、杠精=第一个未通关）/ 已通关不带推荐');

// 19b. 跳关可进：不通关前置也能直接进任何一关（全开放核心语义）
laobanCard19.click();
if (!$('.duel')) fail('19b：未通关的压价老板也应能直接进对线');
$('.duel .back-btn').click();
if (!$('.select')) fail('19b：弃局退出应回对线房');

// 19c. 胜局写账 + 推荐移位：打完谈判首关（贩子 d1 三预设即胜），推荐移到砍价摊主
pickCard('二手车贩子').click();
if (!$('.duel')) fail('19c 前置：当前关应能进对线');
$$('.preset-chip')[0].click();
await waitTurnSettled16();
$$('.preset-chip')[1].click();
await waitTurnSettled16();
$$('.preset-chip')[2].click();
await waitTurnSettled16();
for (let i = 0; i < 200 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.report')) fail('19c 前置：贩子页应能正常打完进报告');
$$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
if (!$('.select')) fail('19c：换个对手应回选人屏');
const dealAfter19 = [...$$('.category-group')[1].querySelectorAll('.persona-card')];
const tanzhuAfter19 = dealAfter19[1];
if (!tanzhuAfter19.classList.contains('current')) fail('19c：通关贩子后推荐应移到砍价摊主');
if (tanzhuAfter19.disabled) fail('19c：砍价摊主应可点');
if (tanzhuAfter19.querySelector('.persona-name').textContent !== '砍价摊主') fail('19c：应显示真名');
if (!dealAfter19[0].classList.contains('cleared')) fail('19c：已通关卡应带 cleared 标记');
if (!/复刷/.test(dealAfter19[0].textContent)) fail('19c：已通关卡应有「复刷」标识（奖励 30%）');
console.log('✓ 胜局写账：推荐移到下一未通关，已通关带复刷标识');

// 19d. 复刷可进：点已通关的亲戚卡应能再开一局（复刷）。
// 打完离场（弃局语义：活局主卡=续局，回不到选人），干脆送两发自爆收场走报告 —— 演示模式输了不扣心
const qinqiCard19 = pickCard('阴阳怪气亲戚');
if (!/复刷/.test(qinqiCard19.textContent)) fail('19d：亲戚卡应带复刷标识');
qinqiCard19.click();
if (!$('.duel')) fail('19d：已通关卡应能进入复刷局');
$('.input').value = '你懂个屁';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => setTimeout(r, 2500));
$('.input').value = '你就是个废物';
$('.input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
for (let i = 0; i < 200 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.report')) fail('19d：复刷局应能正常打完进报告');
$$('.report-actions .btn').find((b) => b.textContent === '换个对手').click();
if (!$('.select')) fail('19d：应能回选人屏');

// 19e. 进度保留：通关账落盘，重进选人屏（重渲染）后推荐落位保持
const saved19 = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1'));
if (JSON.stringify(saved19.cleared.gang) !== JSON.stringify([0, 1, 2])) {
  fail(`19e：杠精房通关账应为 [0,1,2]，实际 ${JSON.stringify(saved19.cleared.gang)}`);
}
if (JSON.stringify(saved19.cleared.deal) !== JSON.stringify([0])) {
  fail(`19e：谈判房通关账应为 [0]，实际 ${JSON.stringify(saved19.cleared.deal)}`);
}
const tanzhuRecheck19 = pickCard('砍价摊主');
if (!tanzhuRecheck19.classList.contains('current')) fail('19e：重渲染后砍价摊主应保持推荐徽标');
console.log('✓ 复刷可进 + 进度落盘保留');

// 收尾：关演示模式，回到心=0 锁定态
$('#settings-btn').click();
$$('.demo-seg-btn')[0].click();
$('.modal-head .ghost-btn').click();
if ($$('.persona-card.no-hearts').length !== 18) fail('19 收尾：关演示模式应回到心=0 全卡禁用（18 张）');
console.log('✓ 闯关梯收尾：演示模式回落正常');

/* ------------------------------------------------------------------ */
/* 20. 成就墙（M4）：名片卡进墙 / 称号佩戴同步 / toast 通道 / 资料库挂勾   */
/* ------------------------------------------------------------------ */

// 前置：19 结束停在选人屏（心=0、演示关）。成就链路不开对局，直接走大厅入口。
$('.select .back-btn').click();
if (!$('.lobby')) fail('20 前置：应能回大厅');
const strip20 = $('.profile-strip');
if (!strip20) fail('20 前置：大厅应有名片卡');
strip20.click();
if (!$('.wall')) fail('20a：点名片卡应进成就墙（不再是「装修中」toast）');

// 20a. 墙结构：名片头 / 称号柜（9 格图鉴）/ 成就网格（36 格，隐藏未解锁 6 格 ???）
if (!$('.wall-card')) fail('20a：墙顶部应有名片头');
if (!/\d+\/36/.test($('.wall-card').textContent)) fail('20a：名片头应有成就进度 x/36');
const titleCells20 = $$('.title-cell');
if (titleCells20.length !== 9) fail(`20a：称号柜应有 9 格（全图鉴），实际 ${titleCells20.length}`);
const ownedCells20 = titleCells20.filter((c) => c.classList.contains('owned'));
if (ownedCells20.length < 1) fail('20a：前置对局胜局的赛后称号应已入册至少 1 枚');
const achvCards20 = $$('.achv-card');
if (achvCards20.length !== 36) fail(`20a：成就网格应有 36 格，实际 ${achvCards20.length}`);
if (![...document.querySelectorAll('.achv-badge')].some((el) => (el.getAttribute('src') || '').includes('/badges/first_win'))) {
  fail('20a：成就卡头部应带 A4 徽章图位（first_win 有徽章小样）');
}
if ($$('.achv-card.hidden-cell').length !== 6) fail('20a：隐藏成就应有 6 格');
const prof20a = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1') || '{}');
const hiddenLocked20 = ACHIEVEMENTS.filter((a) => a.hidden && !prof20a.achievements?.[a.id]).length;
if ($$('.achv-card.locked').filter((c) => c.textContent.includes('???')).length !== hiddenLocked20) {
  fail(`20a：未解锁的隐藏成就应显示 ???（预期 ${hiddenLocked20} 格）`);
}
$('.wall .back-btn').click();
if (!$('.lobby')) fail('20a：成就墙应能返回大厅');
$('.profile-strip').click();
if (!$('.wall')) fail('20a：名片卡再次点击应仍进墙');
console.log('✓ 成就墙进/出：名片卡直达 + 名片头进度 + 称号柜 9 格 + 成就 36 格（隐藏 6 格 ???）');

// 20b. 称号佩戴：柜里点已收集称号戴上 → 大厅名片卡同步；再点摘下 → 同步消失
// （墙内点击会整柜重绘，且往返大厅会重挂视图 —— 断言前一律现查，不拿旧实例节点）
const ownedCells20b = $$('.title-cell.owned');
if (!ownedCells20b.length) fail('20b 前置：称号柜应有已收集称号');
const equipName20 = ownedCells20b[0].querySelector('.title-name').textContent;
const equipId20 = ownedCells20b[0].getAttribute('data-title');
ownedCells20b[0].click();
const onCell20 = $$('.title-cell.on')[0];
if (!onCell20 || onCell20.getAttribute('data-title') !== equipId20) {
  fail('20b：点击已收集称号应佩戴（.on 且是同一枚）');
}
$('.wall .back-btn').click();
if (!$('.lobby')) fail('20b：应能回大厅验证佩戴同步');
if (!$('.profile-strip').textContent.includes(equipName20)) {
  fail(`20b：佩戴后大厅名片卡应显示称号「${equipName20}」`);
}
$('.profile-strip').click();
if ($$('.title-cell.on').length !== 1) fail('20b：回墙应能看到佩戴中的称号');
$$('.title-cell.on')[0].click();
if ($$('.title-cell.on').length !== 0) fail('20b：再点佩戴中的称号应摘下');
$('.wall .back-btn').click();
if ($('.profile-strip').textContent.includes(equipName20)) fail('20b：摘下后名片卡不应再显示称号');
console.log('✓ 称号佩戴：墙内点选/摘下 + 大厅名片卡同步');

// 20c. 资料库挂勾 + toast 队列：收藏 / 笔记 / 看场景 → 场景浏览触发扫描 → 右下角成就 toast
// 13 节已有 1 收藏 + 1 笔记 → 20a 进墙扫描时「淘到好货/落笔为强」已静默解锁并弹过 toast。
// 这里先清场，再用「攒到 10 收藏 + 看全 8 场景」两类新解锁验证弹窗、阈值与消散。
$('.module-card.library').click();
if (!$('.library')) fail('20c 前置：应能进资料库');
const favBtns20 = $$('.entry-card .fav-btn');
if (favBtns20.length < 12) fail('20c 前置：列表应有足够内置话术可收藏');
favBtns20[1].click(); // 收藏第二条（13 节已收第一条）；记账即时，解锁等下一次扫描
if (!$$('.entry-card .fav-btn')[1].classList.contains('on')) fail('20c：第二条话术应收藏成功');
$('.note-add-btn').click();
$('.nf-text').value = '20 节测试笔记：您先给我示范一下。';
$('.note-save-btn').click();
if (!$('.entry-card .mine-badge')) fail('20c：自建笔记应出现在列表最前');
for (let i = 0; i < 50 && $('.ach-toast-holder'); i += 1) await new Promise((r) => setTimeout(r, 100));
if ($('.ach-toast-holder')) fail('20c 前置：旧成就 toast 应已自动消散');
$(`.lib-chip[data-scene="${SCENES[0].id}"]`).click(); // 记账 online，但无待解锁 → 不弹
await new Promise((r) => setTimeout(r, 100));
if ($$('.ach-toast').length !== 0) fail('20c：无新解锁不该弹 toast（已领不重复）');
for (let i = 0; i < 8; i += 1) {
  const b = $$('.entry-card .fav-btn:not(.on)')[0];
  if (!b) fail('20c 前置：应有未收藏话术可继续收藏');
  b.click();
}
$(`.lib-chip[data-scene="${SCENES[1].id}"]`).click(); // 攒满 10 收藏 → 扫描解锁剪报家
await new Promise((r) => setTimeout(r, 100));
if (!$$('.ach-toast').some((t) => t.textContent.includes('剪报家'))) fail('20c：攒满 10 收藏应弹「剪报家」');
for (let i = 2; i < SCENES.length; i += 1) $(`.lib-chip[data-scene="${SCENES[i].id}"]`).click();
await new Promise((r) => setTimeout(r, 100));
if (!$$('.ach-toast').some((t) => t.textContent.includes('博览群书'))) fail('20c：看全 8 场景应弹「博览群书」');
await new Promise((r) => setTimeout(r, 3300)); // toast 3s 后自动消失
if ($$('.ach-toast').length !== 0) fail('20c：成就 toast 应在 3 秒后自动消失');
$(`.lib-chip[data-scene="${SCENES[0].id}"]`).click(); // 重复浏览已记录场景不再弹
await new Promise((r) => setTimeout(r, 200));
if ($$('.ach-toast').length !== 0) fail('20c：重复浏览不应重复弹 toast');
console.log('✓ toast 通道：切场景触发扫描解锁（剪报家/博览群书）+ 3s 自消 + 无解锁不重复弹');

// 20d. 墙上亮格：进墙（入口扫描）后三条新成就应已解锁点亮
$('.library .back-btn').click();
if (!$('.lobby')) fail('20d 前置：应能回大厅');
$('.profile-strip').click();
if (!$('.wall')) fail('20d 前置：应能进墙');
for (const name of ['淘到好货', '落笔为强', '剪报家', '博览群书']) {
  const cell = $$('.achv-card').find((c) => c.textContent.includes(name));
  if (!cell || !cell.classList.contains('unlocked')) fail(`20d：${name} 应在墙上解锁点亮`);
}
console.log('✓ 成就墙亮格：资料库三成就解锁点亮');

/* ------------------------------------------------------------------ */
/* 21. 情商房（B1）：灭火局完整对局 —— 开局 100 怒气 / 三心结哄到 ≤20 / 消气战报 */
/* ------------------------------------------------------------------ */

// 前置：20 结束停在成就墙，先回大厅。心=0 照旧开演示模式，不耗心。
$('.wall .back-btn').click();
if (!$('.lobby')) fail('21 前置：应能回大厅');
$('#settings-btn').click();
$$('.demo-seg-btn')[1].click();
$('.modal-head .ghost-btn').click();

$('.module-card.primary').click();
const eqCards21 = [...$$('.category-group')[2].querySelectorAll('.persona-card')];
if (eqCards21.length !== 6) fail(`21 前置：情商房应有 6 关，实际 ${eqCards21.length}`);
eqCards21[0].click(); // 奶茶洒了的同事（d1 教学关）
if (!$('.duel')) fail('21 前置：应能进情商房对线');
if ($('.persona-name').textContent !== '奶茶洒了的同事') fail('21 前置：对手应是奶茶同事');
const opener21 = $('.bubble-ai').textContent;
if (!opener21.includes('我的奶茶')) fail(`21：灭火局开场白应是怒气开局，实际「${opener21}」`);
if ($('.anger-num').textContent !== '100') fail(`21：灭火局怒气应 100 起步，实际 ${$('.anger-num').textContent}`);

// 三颗心结各中一次：30+28+26 → 100→70→42→16 ≤20 判胜（d1 无 guard/drift，三手即胜）
const chips21 = () => $$('.preset-chip');
chips21()[0].click();
await waitTurnSettled16();
chips21()[1].click();
await waitTurnSettled16();
chips21()[2].click();
await waitTurnSettled16();
for (let i = 0; i < 200 && !$('.report'); i += 1) await new Promise((r) => setTimeout(r, 50));
if (!$('.report')) fail('21：三颗心结全中应判胜进报告');
if ($('.result-badge').textContent !== 'TA 消气了') {
  fail(`21：灭火胜局标题应为「TA 消气了」，实际「${$('.result-badge').textContent}」`);
}
if ($('.title-card .title-name').textContent !== '读心术大师') {
  fail(`21：三轮双心结胜应得「读心术大师」，实际「${$('.title-card .title-name').textContent}」`);
}
if (!$('.settlement').textContent.includes('心 无变动')) fail('21：胜局心应无变动');
const saved21 = JSON.parse(window.localStorage.getItem('gang-ai:profile:v1'));
if (JSON.stringify(saved21.cleared.eq) !== JSON.stringify([0])) {
  fail(`21：情商房通关账应为 [0]，实际 ${JSON.stringify(saved21.cleared.eq)}`);
}
console.log('✓ 情商房完整对局：怒气开局 100 / 三心结哄到消气 / 消气战报 + 通关账落盘');

// 收尾：关演示模式，回大厅
[...document.querySelectorAll('.report-actions .btn')].find((b) => b.textContent === '返回大厅').click();
$('#settings-btn').click();
$$('.demo-seg-btn')[0].click();
$('.modal-head .ghost-btn').click();
$('.module-card.primary').click(); // 进选人屏，验证心=0 全卡禁用
if ($$('.persona-card.no-hearts').length !== 18) fail('21 收尾：关演示模式应回到心=0 全卡禁用（18 张）');

console.log('\n全部通过 ✅');
process.exit(0);
