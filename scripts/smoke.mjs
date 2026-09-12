// 冒烟测试：不开浏览器，直接跑引擎 + 本地大脑，验证四条路径都能走通。
// 用法：npm run smoke
import { PERSONAS } from '../src/data/personas.js';
import { ROUND_SECONDS, createDuel, recordTurn, uniqueSoftspotHits, stageOf, matchSoftspot } from '../src/lib/duel-engine.js';
import { loadRoundSeconds, saveRoundSeconds } from '../src/lib/duel-options.js';
import { categoryOf } from '../src/data/categories.js';
import { generateTurn, engineLabel, testConnection } from '../src/lib/llm.js';
import { saveSettings } from '../src/lib/settings.js';
import { pickTitle } from '../src/data/titles.js';
import { STICKERS, STICKER_IDS, matchSticker, stickerById, pickAiSticker } from '../src/data/stickers.js';
import { HIT_LABELS, EQ_HIT_LABELS } from '../src/data/fallbacks.js';
import {
  QR_URL,
  FALLBACK_QUOTE,
  pickGoldenQuote,
  quoteTagFor,
  buildQrMatrix,
} from '../src/lib/share-card.js';

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};

// 0. 对局选项契约：createDuel 携带回合时限（0=不限时），无存储环境默认不限时
if (createDuel(PERSONAS[0]).roundSeconds !== ROUND_SECONDS) {
  fail(`createDuel 默认应携带 ROUND_SECONDS=${ROUND_SECONDS}`);
}
if (createDuel(PERSONAS[0], { roundSeconds: 0 }).roundSeconds !== 0) {
  fail('createDuel 应接受 roundSeconds 选项（0=不限时）');
}
if (loadRoundSeconds() !== 0) fail(`无 localStorage 环境默认应不限时，实际 ${loadRoundSeconds()}`);
if (saveRoundSeconds(45) !== 0) fail('saveRoundSeconds 对非法值应收敛到 0');
console.log('✓ 对局选项：引擎携带 roundSeconds / 无存储默认不限时 / 非法值收敛');

async function play(personaId, lines, label, presetCount = 0) {
  const persona = PERSONAS.find((p) => p.id === personaId);
  const duel = createDuel(persona);
  console.log(`\n=== ${label} | ${persona.name} | ${engineLabel()} ===`);
  for (let i = 0; i < 8 && !duel.result; i += 1) {
    const text = lines[i] ?? '（沉默）';
    const turn = await generateTurn({ persona, duel, userText: text });
    const { record, result } = recordTurn(duel, {
      userText: text,
      aiReply: turn.reply,
      hitType: turn.hitType,
      quip: turn.quip,
      softspot: turn.softspot,
      usedPreset: i < presetCount,
      silent: text === '（沉默）',
    });
    console.log(
      `第${record.round}轮 [${record.hitType}] ${record.delta >= 0 ? '+' : ''}${record.delta} ` +
        `→ 怒气 ${record.angerAfter} (${stageOf(duel.anger).label}) | ${turn.reply}`
    );
    if (result) console.log('结果:', result);
  }
  console.log(
    `→ ${duel.result || 'draw'} | 回合 ${duel.rounds.length} | 软肋 ${uniqueSoftspotHits(duel)} ` +
      `| 自爆 ${duel.selfDestructs} | 称号「${pickTitle(duel).name}」`
  );
  return duel;
}

// 1. 演示路径：三个预设 + 一句自己的话，应该刚好破百
await play('qinqi', [
  '您家孩子现在在哪儿高就啊？',
  '姑姑这红包您先收着',
  '您先给我示范一下怎么成功呗',
  '但是您当年不也是这么过来的吗？',
], '演示路径', 3);

// 2. 只点预设，不补刀：应该停在 90 打平
await play('qinqi', [
  '您家孩子现在在哪儿高就啊？',
  '姑姑这红包您先收着',
  '您先给我示范一下怎么成功呗',
], '只点预设', 3);

// 3. 三个软肋各验一次：确认每套预设都能被自己的关键词认出来
for (const p of PERSONAS) {
  const duel = createDuel(p);
  const results = [];
  for (const text of p.presets) {
    const t = await generateTurn({ persona: p, duel, userText: text });
    results.push(`${text} ${t.hitType === 'softspot' ? '✓' : `✗(${t.hitType})`}`);
  }
  console.log(`关键词自检 ${p.name}: ${results.join(' | ')}`);
}

// 4. 骂人两次应该自爆判负
await play('laoban', ['你懂个屁', '你就是个废物'], '自爆路径');

/* ------------------------------------------------------------------ */
/* 5. 灭火局（情商房框架）：人设数据后续上，这里用假人设验引擎            */
/* ------------------------------------------------------------------ */

// 现有人设归组：网友/亲戚 → 杠精房，老板/摊主/甲方 → 谈判房
if (categoryOf(PERSONAS.find((p) => p.id === 'wangyou')).id !== 'gang') fail('杠精网友应归杠精房');
if (categoryOf(PERSONAS.find((p) => p.id === 'qinqi')).id !== 'gang') fail('阴阳怪气亲戚应归杠精房');
if (categoryOf(PERSONAS.find((p) => p.id === 'laoban')).id !== 'deal') fail('画饼老板应归谈判房');
if (categoryOf(PERSONAS.find((p) => p.id === 'tanzhu')).id !== 'deal') fail('砍价摊主应归谈判房');
if (categoryOf(PERSONAS.find((p) => p.id === 'jiafang')).id !== 'deal') fail('五彩斑斓甲方应归谈判房');
if (PERSONAS.length !== 18) fail(`人设应恰 18 个（5 原班 + B2 两房满 6 共 7 新 + B1 情商 6；B3 再增），实际 ${PERSONAS.length}`);

// 5.6 专属破防演出数据契约（A2/B1）：所有人设 finale 文案齐全；fire 房五人 kind 互不重复
//      （B1 起情商房复用五种 kind 做消气向表达，重复合法）；breakdown 台词仍需保留
const FINALE_KINDS = ['rapid', 'quit', 'recall', 'lights-off', 'read-none'];
const finaleKinds = new Set();
for (const p of PERSONAS) {
  const f = p.finale;
  if (!f || !FINALE_KINDS.includes(f.kind)) {
    fail(`${p.name} 应配置合法 finale.kind（${FINALE_KINDS.join('/')}），实际 ${JSON.stringify(f?.kind)}`);
  }
  if (!Array.isArray(f.lead) || f.lead.length === 0) fail(`${p.name} 的 finale.lead 应为非空台词数组`);
  if (typeof f.exitLine !== 'string' || !f.exitLine) fail(`${p.name} 的 finale.exitLine 应为非空文案`);
  if (f.kind === 'rapid' && f.lead.length < 4) fail('rapid 演出至少连发 4 条才有连环轰炸感');
  if (f.kind === 'recall' && !f.recallText) fail('recall 演出应配 recallText（那句要被撤回的话）');
  if (p.category !== 'eq') finaleKinds.add(f.kind);
}
if (finaleKinds.size !== 5) fail(`fire 房五人的破防演出应各配一种 kind，实际只有 ${[...finaleKinds].join(',')}`);
if (!PERSONAS.every((p) => Array.isArray(p.breakdown) && p.breakdown.length > 0)) {
  fail('breakdown 台词必须保留（破防期回复 + 通用演出降级）');
}
console.log('✓ 破防演出数据：fire 五人 kind 不重复 / 文案齐全（eq 复用消气向）/ breakdown 保留');

// 假情商人设：三个心结 delta 和 ≈ 90，与现有人设同标尺
const EQ_PERSONA = {
  id: 'eq-test',
  name: '灭火测试员',
  category: 'eq',
  softspots: [
    { key: 'listen', delta: 30, keywords: ['听你说'] },
    { key: 'own', delta: 32, keywords: ['我错了'] },
    { key: 'time', delta: 28, keywords: ['给你时间'] },
  ],
};

// 5.1 初始态：灭火局从满怒气开局，先看 mode 再比数值（防首回合误判）
const eq = createDuel(EQ_PERSONA);
if (eq.mode !== 'extinguish') fail('eq 人设应开出灭火局，实际 ' + eq.mode);
if (eq.anger !== 100) fail('灭火局初始怒气应为 100，实际 ' + eq.anger);
const firstRound = recordTurn(eq, { userText: '嗯。', aiReply: '……', hitType: 'miss', quip: '' });
if (firstRound.result) fail('灭火局怒气 100 时不该被 fire 规则误判成 win：' + firstRound.result);

// 5.2 安抚降怒 + 同心结递减
const r1 = recordTurn(eq, { userText: '我听你说', aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[0], quip: '' });
if (r1.delta !== -30 || r1.after !== 70) fail('心结命中应 -30 到 70，实际 ' + r1.delta + '/' + r1.after);
const r2 = recordTurn(eq, { userText: '我听你说', aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[0], quip: '' });
if (r2.delta !== -15) fail('重复戳同心结应减半 -15，实际 ' + r2.delta);
const r3 = recordTurn(eq, { userText: '我知道你不好受', aiReply: '……', hitType: 'hit', quip: '' });
if (r3.delta !== -12) fail('有效安抚应 -12，实际 ' + r3.delta);

// 5.3 降到阈值下判 win：磨到第 5 轮的稳赢给「灭火队员」
const r4 = recordTurn(eq, { userText: '我错了', aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[1], quip: '' });
if (r4.result !== 'win') fail('怒气降到阈值下应判 win（当前 ' + r4.after + '）');
if (pickTitle(eq).name !== '灭火队员') fail('五轮磨下来的灭火胜应给「灭火队员」，实际「' + pickTitle(eq).name + '」');

// 5.3b 四轮内快胜给「读心术大师」：三个心结找齐刚好够到胜线
const eqFast = createDuel(EQ_PERSONA);
const fastWin = [
  ['我听你说', 0],
  ['我错了', 1],
  ['给你时间', 2],
].map(([text, idx]) =>
  recordTurn(eqFast, { userText: text, aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[idx], quip: '' }),
);
const lastFast = fastWin[fastWin.length - 1];
if (lastFast.result !== 'win') fail('三个心结应降到胜线判 win（实际怒气 ' + lastFast.after + '）');
if (pickTitle(eqFast).name !== '读心术大师') fail('四轮内灭火胜应给「读心术大师」，实际「' + pickTitle(eqFast).name + '」');

// 5.4 八轮没哄好判 lose（灭火局没有平局）
const eq2 = createDuel(EQ_PERSONA);
for (let i = 0; i < 8; i += 1) {
  recordTurn(eq2, { userText: '嗯。', aiReply: '……', hitType: 'miss', quip: '' });
}
if (eq2.result !== 'lose') fail('八轮没哄好应判 lose，实际 ' + eq2.result);
if (pickTitle(eq2).name !== '火上浇油') fail('灭火失败应给「火上浇油」，实际「' + pickTitle(eq2).name + '」');

// 5.5 火上浇油：怒气反弹 +12，两次直接判负
const eq3 = createDuel(EQ_PERSONA);
const b1 = recordTurn(eq3, { userText: '你懂个屁', aiReply: '……', hitType: 'self_destruct', quip: '' });
if (b1.after !== 100) fail('满怒气下浇油应钉在 100，实际 ' + b1.after);
const b2 = recordTurn(eq3, { userText: '去死', aiReply: '……', hitType: 'self_destruct', quip: '' });
if (b2.result !== 'lose') fail('两次自爆应判 lose，实际 ' + b2.result);
// 从低怒气浇油看得清反弹方向
const eq4 = createDuel(EQ_PERSONA);
recordTurn(eq4, { userText: '我听你说', aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[0], quip: '' }); // → 70
const b3 = recordTurn(eq4, { userText: '你懂个屁', aiReply: '……', hitType: 'self_destruct', quip: '' });
if (b3.after !== 82) fail('低怒气浇油应反弹 +12 到 82，实际 ' + b3.after);
console.log('✓ 灭火局：初始 100 / 安抚降怒 / 同心结递减 / ≤20 判 win / 八轮判 lose / 浇油反弹');

/* ------------------------------------------------------------------ */
/* 5.7 引擎阻力参数（M2）：guard 玩家输出折扣 / drift 环境漂移          */
/* ------------------------------------------------------------------ */

const mk = (over = {}) => ({
  id: 'g-test',
  name: '阻力测试员',
  category: 'gang',
  softspots: [
    { key: 'a', delta: 30, keywords: ['戳甲'] },
    { key: 'b', delta: 88, keywords: ['戳乙'] },
    { key: 'c', delta: 15, keywords: ['戳丙'] },
  ],
  ...over,
});

// 5.7.1 guard 只折玩家主动输出：软肋 30→27、hit 12→11（四舍五入）
const guarded = createDuel(mk({ guard: 0.9 }));
const gd1 = recordTurn(guarded, { userText: '戳甲', aiReply: '……', hitType: 'softspot', softspot: guarded.persona.softspots[0], quip: '' });
if (gd1.delta !== 27) fail(`guard 0.9 应把软肋 30 折成 27，实际 ${gd1.delta}`);
const gd2 = recordTurn(guarded, { userText: '但是这句话本身有证据吗，请问', aiReply: '……', hitType: 'hit', quip: '' });
if (gd2.delta !== 11) fail(`guard 0.9 应把 hit 12 折成 11，实际 ${gd2.delta}`);

// guard 不作用于自爆 / 沉默（自爆保持 -12，沉默保持 0）
const gd3 = recordTurn(guarded, { userText: '你懂个屁', aiReply: '……', hitType: 'self_destruct', quip: '' });
if (gd3.delta !== -12) fail(`guard 不该碰自爆的 -12，实际 ${g3.delta}`);
const gd4 = recordTurn(guarded, { userText: '', aiReply: '……', hitType: 'miss', quip: '', silent: true });
if (gd4.delta !== 0) fail(`沉默回合增量应为 0，实际 ${g4.delta}`);

// 贴纸也吃 guard（全局递减之后再乘）
const gs = createDuel(mk({ guard: 0.9 }));
const gd5 = recordTurn(gs, { userText: '', aiReply: '……', hitType: 'miss', quip: '', sticker: stickerById('smug') });
if (gd5.delta !== Math.round(stickerById('smug').delta * 0.9)) {
  fail(`首张贴纸应过 guard 折成 ${Math.round(stickerById('smug').delta * 0.9)}，实际 ${g5.delta}`);
}
console.log('✓ guard：软肋/hit/贴纸按 0.9 折算四舍五入 / 自爆沉默豁免');

// 5.7.2 drift（fire 方向）：每回合结算前补付「新完成回合」的漂移间隔（不重复补已结回合）
const drifty = createDuel(mk({ drift: 2 }));
recordTurn(drifty, { userText: '戳甲', aiReply: '……', hitType: 'softspot', softspot: drifty.persona.softspots[0], quip: '' }); // +30 → 30
const d2 = recordTurn(drifty, { userText: '戳丙', aiReply: '……', hitType: 'softspot', softspot: drifty.persona.softspots[2], quip: '' });
if (d2.before !== 28) fail(`第 2 回合结算前应补 1 个间隔漂移（30→28），实际 ${d2.before}`);
if (d2.after !== 43) fail(`漂移后再结算 28+15=43，实际 ${d2.after}`);
const d3r = recordTurn(drifty, { userText: '戳甲', aiReply: '……', hitType: 'softspot', softspot: drifty.persona.softspots[0], quip: '' });
if (d3r.before !== 41) fail(`第 3 回合只应再补 1 个间隔（43→41，重复补会变 39），实际 ${d3r.before}`);
if (d3r.after !== 56) fail(`41+15=56，实际 ${d3r.after}`);

// 漂移贴地不穿：fire 漂到 0 为止；沉默回合照常吃漂移
const fireFloor = createDuel(mk({ drift: 30 }));
recordTurn(fireFloor, { userText: '但是这句话本身就有问题啊', aiReply: '……', hitType: 'hit', quip: '' }); // +12
const ff2 = recordTurn(fireFloor, { userText: '', aiReply: '……', hitType: 'miss', quip: '', silent: true });
if (ff2.before !== 0 || ff2.after !== 0) fail(`fire 漂移应贴地封 0，实际 ${ff2.before}/${ff2.after}`);
console.log('✓ drift fire：按间隔增量补漂 / 贴地封 0 / 沉默回合照吃');

// 5.7.3 drift（extinguish 方向）：向上漂（对方又上头），100 封顶
const eqDriftDef = mk({
  id: 'eq-drift',
  name: '上头测试员',
  category: 'eq',
  drift: 30,
  softspots: [{ key: 'a', delta: 30, keywords: ['哄'] }],
});
const eqd = createDuel(eqDriftDef);
recordTurn(eqd, { userText: '哄', aiReply: '……', hitType: 'softspot', softspot: eqDriftDef.softspots[0], quip: '' }); // 100→70（elapsed 0 不漂）
const ed2 = recordTurn(eqd, { userText: '嗯。', aiReply: '……', hitType: 'miss', quip: '' });
if (ed2.before !== 100 || ed2.after !== 100) fail(`灭火局第 2 回合结算前应漂回 100 封顶，实际 ${ed2.before}/${ed2.after}`);

// 灭火局 guard 在方向翻转后乘算：-30 → ×0.9 → -27
const eqGuardDef = mk({
  id: 'eq-guard',
  name: '灭火阻力员',
  category: 'eq',
  guard: 0.9,
  softspots: [{ key: 'a', delta: 30, keywords: ['哄'] }],
});
const eg = createDuel(eqGuardDef);
const eg1 = recordTurn(eg, { userText: '哄', aiReply: '……', hitType: 'softspot', softspot: eqGuardDef.softspots[0], quip: '' });
if (eg1.delta !== -27) fail(`灭火局翻转后再吃 guard 应 -27，实际 ${eg1.delta}`);
console.log('✓ drift extinguish：向上漂 + 100 封顶 / 灭火 guard 翻转后乘算');

// 5.7.4 漂移不吞胜局：只补既往回合（elapsed），当回合推送全额入账
// 次序错成「含当回合」的话：88-4=84 + 15 = 99，胜局就没了
const closer = createDuel(mk({ drift: 2 }));
recordTurn(closer, { userText: '戳乙', aiReply: '……', hitType: 'softspot', softspot: closer.persona.softspots[1], quip: '' }); // +88 → 88
const clinch = recordTurn(closer, { userText: '戳丙', aiReply: '……', hitType: 'softspot', softspot: closer.persona.softspots[2], quip: '' });
if (clinch.before !== 86) fail(`终盘结算前只补既往 1 回合漂移（88→86），实际 ${clinch.before}`);
if (clinch.after !== 100 || clinch.result !== 'win') fail(`最后一击 86+15 应破百判 win，实际 ${clinch.after}/${clinch.result}`);
console.log('✓ 漂移不吞胜局：elapsed 不含当回合，最后一击全额结算');

// 5.7.5 未配 guard/drift 的人设行为与旧版完全一致
const plain = createDuel(mk());
const p1 = recordTurn(plain, { userText: '戳甲', aiReply: '……', hitType: 'softspot', softspot: plain.persona.softspots[0], quip: '' });
if (p1.delta !== 30) fail(`未配 guard 应全额 30，实际 ${p1.delta}`);
const p2 = recordTurn(plain, { userText: '戳丙', aiReply: '……', hitType: 'softspot', softspot: plain.persona.softspots[2], quip: '' });
if (p2.before !== 30 || p2.after !== 45) fail(`未配 drift 结算前后不应有漂移，实际 ${p2.before}/${p2.after}`);
console.log('✓ 默认参数：无 guard/drift 字段时引擎行为与 2.0 一致');


/* ------------------------------------------------------------------ */
/* 6. 表情包：登记表 / 解析 / 回合结算 / 全局递减 / AI 选贴               */
/* ------------------------------------------------------------------ */

// 6.0 登记表完整性：12 张、id 与 emoji 唯一、delta 在 ±8 内、字段齐
if (STICKERS.length !== 12) fail(`贴纸应恰 12 张，实际 ${STICKERS.length}`);
const stickerIds = STICKERS.map((s) => s.id);
const stickerEmojis = STICKERS.map((s) => s.emoji);
if (new Set(stickerIds).size !== 12) fail('贴纸 id 应唯一');
if (new Set(stickerEmojis).size !== 12) fail('贴纸 emoji 应唯一');
for (const s of STICKERS) {
  if (!s.id || !s.emoji || !s.label) fail(`贴纸字段不齐：${JSON.stringify(s)}`);
  if (Math.abs(s.delta) > 8) fail(`贴纸 delta 应在 ±8 内：${s.id} = ${s.delta}`);
}
if (!STICKERS.some((s) => s.delta > 0)) fail('至少要有嘲讽向（正 delta）贴纸');
if (JSON.stringify(STICKER_IDS) !== JSON.stringify(stickerIds)) fail('STICKER_IDS 应与登记表一致');
if (stickerById(stickerIds[0]).emoji !== stickerEmojis[0]) fail('stickerById 应能按 id 取贴纸');
console.log('✓ 贴纸登记表：12 张 / id·emoji 唯一 / delta ≤8 / 索引齐');

// 6.1 matchSticker：剥离已注册 emoji、取首个命中、未注册 emoji 留在文本里
if (matchSticker('').sticker !== null) fail('空文本不该匹配出贴纸');
const pure = matchSticker('😤');
if (!pure.sticker || pure.text !== '') fail('纯贴纸应剥离成空文本');
const mixed = matchSticker('你说得对😤但是呢');
if (!mixed.sticker || mixed.text !== '你说得对但是呢') fail('文字+贴纸应剥离干净：' + JSON.stringify(mixed));
const two = matchSticker('🙄😤');
if (two.sticker.id !== 'eyeroll' || two.text !== '') fail('多张贴纸应取字符串序第一张');
const unregistered = matchSticker('你好💖');
if (unregistered.sticker !== null || unregistered.text !== '你好💖') fail('未注册 emoji 应原样留在文本里');
console.log('✓ matchSticker：纯贴纸/混合/多贴纸取首/未注册不动');

// 6.2 纯贴纸回合：hitType 覆写为 sticker、delta 全额、不占 freeText、record 记全
const sd = createDuel(PERSONAS.find((p) => p.id === 'tanzhu'));
const smug = stickerById('smug');
const st1 = recordTurn(sd, {
  userText: '', aiReply: '……', hitType: 'miss', quip: '',
  sticker: smug, aiSticker: stickerById('clown'),
});
if (st1.record.hitType !== 'sticker') fail('纯贴纸回合 hitType 应为 sticker，实际 ' + st1.record.hitType);
if (st1.delta !== smug.delta || st1.after !== smug.delta) fail(`首张贴纸应全额 ${smug.delta}，实际 ${st1.delta} → ${st1.after}`);
if (st1.record.stickerId !== 'smug' || st1.record.stickerDelta !== smug.delta) fail('record 应记 stickerId/stickerDelta');
if (st1.record.aiStickerId !== 'clown') fail('record 应记 aiStickerId');
if (sd.freeTextRounds !== 0) fail('纯贴纸回合不该计入 freeTextRounds');
if (sd.stickersSent !== 1) fail(' stickersSent 应为 1，实际 ' + sd.stickersSent);

// 6.3 全局递减：第 2 张减半、第 3 张起归零（换不同贴纸也一样 —— 看穿的是套路不是图）
const st2 = recordTurn(sd, { userText: '', aiReply: '……', hitType: 'miss', quip: '', sticker: stickerById('skull') });
if (st2.delta !== Math.round(stickerById('skull').delta * 0.5)) fail(`第 2 张贴纸应减半，实际 ${st2.delta}`);
const st3 = recordTurn(sd, { userText: '', aiReply: '……', hitType: 'miss', quip: '', sticker: stickerById('tea') });
if (st3.delta !== 0) fail(`第 3 张贴纸起应归零，实际 ${st3.delta}`);
console.log('✓ 贴纸结算：纯贴纸回合 / record 字段 / 全局递减三档');

// 6.4 文字+贴纸：正常分类再叠加贴纸增量，计入 freeText
const fd = createDuel(PERSONAS.find((p) => p.id === 'tanzhu'));
const combo = recordTurn(fd, {
  userText: '但是你说的这个问题，可是有证据吗？', aiReply: '……', hitType: 'hit', quip: '',
  sticker: stickerById('smug'),
});
if (combo.delta !== 12 + smug.delta) fail(`hit+贴纸应叠加成 ${12 + smug.delta}，实际 ${combo.delta}`);
if (combo.record.stickerDelta !== smug.delta) fail('叠加回合的 stickerDelta 应单独可查');
if (fd.freeTextRounds !== 1) fail('文字+贴纸应计入 freeTextRounds');

// 6.5 自爆拦截：都语无伦次了，表情包救不回来（但仍占用张数）
const sd2 = createDuel(PERSONAS.find((p) => p.id === 'tanzhu'));
const bombed = recordTurn(sd2, { userText: '你懂个屁', aiReply: '……', hitType: 'self_destruct', quip: '', sticker: smug });
if (bombed.delta !== -12 || bombed.record.stickerDelta !== 0) fail(`自爆回合贴纸不该落地，实际 ${bombed.delta}`);
if (sd2.stickersSent !== 1) fail('自爆回合的贴纸仍应占用递减计数');

// 6.6 灭火局翻转：贴纸增量跟其余增量同方向整体翻转
const eqs = createDuel(EQ_PERSONA);
const eqSticker = recordTurn(eqs, { userText: '', aiReply: '……', hitType: 'miss', quip: '', sticker: smug });
if (eqSticker.delta !== -smug.delta || eqs.anger !== 100 - smug.delta) {
  fail(`灭火局贴纸应翻成 ${-smug.delta}，实际 ${eqSticker.delta} → ${eqs.anger}`);
}
console.log('✓ 贴纸叠加：hit+贴纸 / 自爆拦截 / 灭火局翻转');

// 6.7 判定标签：两套 mode 标签都得有「斗图」档
if (!HIT_LABELS.sticker || !EQ_HIT_LABELS.sticker) fail('HIT_LABELS/EQ_HIT_LABELS 都该有 sticker 档');

// 6.8 pickAiSticker：阶段概率 + 玩家先发则大概率回敬（注入 rand，确定性验证）
if (pickAiSticker('polite', 0) !== null) fail('礼貌阶段不该发贴纸');
if (!pickAiSticker('sarcastic', 0.1)) fail('阴阳阶段低 rand 应发贴纸');
if (pickAiSticker('sarcastic', 0.99) !== null) fail('高 rand 不该发贴纸');
if (!pickAiSticker('agitated', 0.25) || pickAiSticker('agitated', 0.35) !== null) fail('上头阶段阈值应在 0.3');
if (!pickAiSticker('breakdown', 0.4) || pickAiSticker('breakdown', 0.5) !== null) fail('破防阶段阈值应在 0.45');
if (!pickAiSticker('polite', 0.4, { replyToSticker: true })) fail('玩家先发贴纸时礼貌阶段也该大概率回敬');
if (pickAiSticker('polite', 0.6, { replyToSticker: true }) !== null) fail('回敬概率应是 0.5 而非必发');
if (!STICKERS.includes(pickAiSticker('agitated', 0))) fail('选出的贴纸应来自登记表');
console.log('✓ pickAiSticker：四阶段阈值 / 回敬加成 / 注入 rand 可确定化');



/* ------------------------------------------------------------------ */
/* 5. OpenAI 兼容通道：用假 localStorage + 假 fetch 验解析和降级          */
/* ------------------------------------------------------------------ */

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

saveSettings({
  provider: 'openai',
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://example.test/v1/',
});
if (!engineLabel().startsWith('真实 AI · test-model')) fail('徽章没跟着设置走：' + engineLabel());

const persona = PERSONAS[0];
let captured = null;
global.fetch = async (url, init) => {
  captured = { url, init };
  return {
    ok: true,
    status: 200,
    // 故意裹一层 ```json，验证 extractJson 能把围栏扒掉
    json: async () => ({
      choices: [{ message: { content: '```json\n{"reply":"你这话没道理","hitType":"hit"}\n```' } }],
    }),
  };
};

const remote = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (remote.source !== 'remote') fail('应该走远程，实际 ' + remote.source);
if (remote.hitType !== 'hit' || remote.reply !== '你这话没道理') {
  fail('远程返回没解析对：' + JSON.stringify(remote));
}
if (captured.url !== 'https://example.test/v1/chat/completions') fail('请求地址不对：' + captured.url);
if (captured.init.headers.authorization !== 'Bearer test-key') fail('没带 Authorization');
const sentBody = JSON.parse(captured.init.body);
if (sentBody.response_format?.type !== 'json_object') fail('没要求 JSON 输出');
if (sentBody.messages[0].role !== 'system') fail('system prompt 应该放第一条');
// 512 会被推理型模型的思考过程吃光，导致 200 但 content 为空（见 emptyContentReason）
if (sentBody.max_tokens < 2048) fail('max_tokens 太小，推理型模型会返回空内容：' + sentBody.max_tokens);
console.log('✓ OpenAI 兼容通道：请求地址 / 鉴权 / JSON 模式 / 围栏解析 全对');

// 网络炸了要降级到本地，不能把玩家卡住；但要带上人话的原因给界面显示
global.fetch = async () => {
  throw new TypeError('Failed to fetch');
};
const fellBack = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (fellBack.source !== 'local') fail('远程失败应该降级到本地，实际 ' + fellBack.source);
if (!/跨域/.test(fellBack.fallback || '')) fail('降级没带人话原因：' + fellBack.fallback);
console.log('✓ 远程失败降级到本地，原因:', fellBack.fallback);

// 模型回了空台词：以前这条路是无声降级，界面上看不出跟 AI 没关系
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '{"reply":"","hitType":"hit"}' } }] }),
});
const emptyReply = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (emptyReply.source !== 'local') fail('空台词应该降级到本地，实际 ' + emptyReply.source);
if (!/空台词/.test(emptyReply.fallback || '')) fail('空台词降级没带原因：' + emptyReply.fallback);
console.log('✓ 模型返回空台词时也降级，原因:', emptyReply.fallback);

// 空 content 会去掉 response_format 重试一次
let attempts = 0;
global.fetch = async () => {
  attempts += 1;
  return {
    ok: true,
    status: 200,
    json: async () =>
      attempts === 1
        ? { choices: [{ finish_reason: 'stop', message: { content: '' } }] }
        : { choices: [{ finish_reason: 'stop', message: { content: '{"reply":"重试成功","hitType":"hit"}' } }] },
  };
};
const retried = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (attempts !== 2) fail('空 content 应该重试一次，实际请求 ' + attempts + ' 次');
if (retried.source !== 'remote' || retried.reply !== '重试成功') fail('重试后应该拿到远程回复：' + JSON.stringify(retried));
console.log('✓ 空 content 会去掉 response_format 重试一次，重试成功即用远程结果');

// 历史里的助手消息必须是 JSON —— 塞纯文本的话模型会跟着说大白话，
// 「只输出 JSON」的指令就废了，这正是「聊几轮之后开始本地兜底」的根因
const historyDuel = createDuel(persona);
recordTurn(historyDuel, {
  userText: '第一句',
  aiReply: '你这话没道理',
  hitType: 'hit',
  quip: '',
  usedPreset: false,
});
global.fetch = async (url, init) => {
  captured = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '{"reply":"嗯","hitType":"miss"}' } }] }),
  };
};
await generateTurn({ persona, duel: historyDuel, userText: '第二句' });
const historyBody = JSON.parse(captured.init.body);
const assistantMsg = historyBody.messages.find((m) => m.role === 'assistant');
if (!assistantMsg) fail('历史里应该带助手消息');
let parsedHistory;
try {
  parsedHistory = JSON.parse(assistantMsg.content);
} catch {
  fail('助手历史不是 JSON：' + assistantMsg.content);
}
if (parsedHistory.reply !== '你这话没道理' || parsedHistory.hitType !== 'hit') {
  fail('助手历史 JSON 内容不对：' + assistantMsg.content);
}
console.log('✓ 历史里的助手消息是 JSON，模型不会跟着说大白话');

// 200 但 content 为空、finish_reason=length：推理型模型把额度花在思考上了
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: '让我想想……' } }],
  }),
});
const starved = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (starved.source !== 'local') fail('空 content 应该降级到本地，实际 ' + starved.source);
if (!/max_tokens/.test(starved.fallback || '')) fail('没识别出被截断：' + starved.fallback);
console.log('✓ content 为空时能指出被 max_tokens 截断:', starved.fallback);

// finish_reason=stop 但 content 为空、答案在别的字段里：得点名是哪个字段
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '', reasoning_content: '嗯……' } }],
  }),
});
const misrouted = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (!/reasoning_content/.test(misrouted.fallback || '')) fail('没点名答案在哪个字段：' + misrouted.fallback);
if (!/原始响应/.test(misrouted.fallback || '')) fail('降级信息里应该带原始响应：' + misrouted.fallback);
console.log('✓ 答案被塞进别的字段时能点名 + 带原始响应');

// 模型说大白话不说 JSON：追加一次提醒，提醒后给了 JSON 就用它
let proseAttempts = 0;
global.fetch = async (url, init) => {
  proseAttempts += 1;
  if (proseAttempts === 2) {
    const body = JSON.parse(init.body);
    const last = body.messages[body.messages.length - 1];
    if (!/只输出 JSON/.test(last.content)) fail('提醒应该顶在最后一条消息上：' + last.content);
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content:
              proseAttempts === 1 ? '你这话说的可就没道理了啊。' : '{"reply":"行行行","hitType":"miss"}',
          },
        },
      ],
    }),
  };
};
const reminded = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (proseAttempts !== 2) fail('应该只追加一次提醒，实际请求 ' + proseAttempts + ' 次');
if (reminded.source !== 'remote' || reminded.reply !== '行行行') {
  fail('提醒后应该用远程 JSON：' + JSON.stringify(reminded));
}
console.log('✓ 模型说大白话时追加一次提醒，提醒生效就用远程结果');

// 测试连接：成功 / 401 / 跨域，三种都要说人话
const cfg = { provider: 'openai', apiKey: 'k', model: 'm', baseUrl: 'https://example.test/v1' };

global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '好' } }] }) });
const okRes = await testConnection(cfg);
if (!okRes.ok) fail('测试连接应该成功：' + okRes.message);

global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) });
const authRes = await testConnection(cfg);
if (authRes.ok || !/key 无效/.test(authRes.message)) fail('401 没翻译成 key 无效：' + authRes.message);

global.fetch = async () => {
  throw new TypeError('Failed to fetch');
};
const corsRes = await testConnection(cfg);
if (corsRes.ok || !/跨域/.test(corsRes.message)) fail('跨域没被识别：' + corsRes.message);
console.log('✓ 测试连接：成功 / 401 / 跨域 三种结果都说人话');

// 6.9 远程贴纸：schema 枚举校验 + 非法 id 静默忽略 + prompt 里有贴纸说明
global.fetch = async (url, init) => {
  captured = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '{"reply":"就这？就这？","hitType":"hit","sticker":"smug"}' } }] }),
  };
};
const remoteSticker = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (remoteSticker.source !== 'remote' || remoteSticker.sticker?.id !== 'smug') {
  fail('远程返回的合法贴纸 id 应被采纳：' + JSON.stringify(remoteSticker.sticker));
}
const promptBody = JSON.parse(captured.init.body);
if (!/表情包/.test(promptBody.messages[0].content)) fail('system prompt 应介绍贴纸玩法');
if (!promptBody.messages[0].content.includes('smug')) fail('system prompt 应列出贴纸 id 清单');

global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '{"reply":"哼。","hitType":"miss","sticker":"不存在的id"}' } }] }),
});
const badSticker = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (badSticker.source !== 'remote' || badSticker.sticker) fail('非法贴纸 id 应被静默忽略，不误伤正主回复');
console.log('✓ 远程贴纸：合法 id 采纳 / 非法 id 忽略 / prompt 带贴纸清单');

// 6.10 贴纸进历史：玩家发过贴纸 → 下一条 user 消息带提示；AI 发过 → 助手 JSON 里带 sticker
const stickerHistory = createDuel(persona);
recordTurn(stickerHistory, {
  userText: '但是你说的有问题', aiReply: '有什么问题？', hitType: 'hit', quip: '',
  sticker: stickerById('smug'), aiSticker: stickerById('eyeroll'),
});
global.fetch = async (url, init) => {
  captured = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '{"reply":"嗯","hitType":"miss"}' } }] }),
  };
};
await generateTurn({ persona, duel: stickerHistory, userText: '第二句' });
const shBody = JSON.parse(captured.init.body);
const shUser = shBody.messages.find((m) => m.role === 'user' && m.content.includes('表情包'));
if (!shUser) fail('历史里的玩家贴纸应翻译成文字提示喂给模型');
const shAssistant = shBody.messages.find((m) => m.role === 'assistant');
const shParsed = JSON.parse(shAssistant.content);
if (shParsed.sticker !== 'eyeroll') fail('助手历史 JSON 应带上自己发过的贴纸：' + shAssistant.content);
// 本回合就带贴纸：最后一条 user 消息也要有提示
await generateTurn({ persona, duel: stickerHistory, userText: '第三句', userSticker: stickerById('tea') });
const curBody = JSON.parse(captured.init.body);
const lastUser = [...curBody.messages].reverse().find((m) => m.role === 'user');
if (!/表情包/.test(lastUser.content) || !lastUser.content.includes('第三句')) {
  fail('本回合贴纸提示应附在当前 user 消息上：' + lastUser.content);
}
console.log('✓ 贴纸历史：玩家侧提示 / 助手 JSON 带贴纸 / 当前消息提示');

// 6.11 本地引擎也发贴纸：玩家先发 → 劫持 rand=0 必回敬
saveSettings({ provider: 'local', apiKey: '', model: '', baseUrl: '' });
const realRandom = Math.random;
Math.random = () => 0;
const localSticker = await generateTurn({
  persona, duel: createDuel(persona), userText: '', userSticker: stickerById('smug'),
});
Math.random = realRandom;
if (!localSticker.sticker) fail('本地引擎在玩家先发贴纸时应大概率回敬（rand=0 必发）');
console.log('✓ 本地引擎贴纸：玩家先发时回敬（确定性 rand 验证）');

// 6.12 Anthropic 通道：贴纸轮引入的 ctx 引用 bug 曾让这条路径一调用就 ReferenceError 静默降级 —— 假 fetch 锁住
saveSettings({ provider: 'anthropic', apiKey: 'sk-ant-fake-key-000000', model: '', baseUrl: '' });
global.fetch = async (url, init) => {
  captured = { url, init };
  // SDK 对 Response 形状挑剔（headers.entries / text / json 都要真有）——用真 Response 最稳
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: '{"reply":"还行。","hitType":"hit"}' }],
      stop_reason: 'end_turn',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
const anthropicVerdict = await generateTurn({ persona, duel: createDuel(persona), userText: '测试一下' });
if (anthropicVerdict.source !== 'remote' || anthropicVerdict.reply !== '还行。') {
  fail('Anthropic 通道应能出远程台词（曾因 ctx 引用 ReferenceError 被吞成本地降级）：' + JSON.stringify(anthropicVerdict));
}
if (anthropicVerdict.fallback) fail('Anthropic 通道成功时不该带降级原因：' + anthropicVerdict.fallback);
console.log('✓ Anthropic 通道：SDK 路径真走通且解析成功（ctx bug 回归锁）');

delete global.localStorage;
delete global.fetch;


/* ------------------------------------------------------------------ */
/* 7. 战绩图（A3 传播化）：金句选取 + 二维码矩阵                          */
/* ------------------------------------------------------------------ */

// 造一个只带 pickGoldenQuote 关心字段的假局：选取逻辑是对局数据形状的纯函数，
// 真引擎产出的 rounds 字段同名，7.6 再用真 recordTurn 对一次方向
const fakeDuel = (mode, rounds) => ({ mode, rounds });
const R = (userText, delta, hitType = 'hit') => ({ userText, aiReply: `回${delta}`, hitType, delta });
const SOFT = (userText, delta) => R(userText, delta, 'softspot');

// 7.1 点火局：取正伤害里 delta 最大且有文字的回合（miss/self_destruct 不参选）
const g1 = fakeDuel('fire', [
  R('你说的有证据吗', 0, 'miss'),
  R('这话跟你没关系吧', 12),
  SOFT('您家孩子在哪儿高就', 30),
  R('你懂个屁', -12, 'self_destruct'),
]);
const q1 = pickGoldenQuote(g1);
if (!q1 || q1.userText !== '您家孩子在哪儿高就' || q1.delta !== 30) {
  fail('点火局金句应选 delta 最大的有效回合：' + JSON.stringify(q1));
}

// 7.2 无文字回合（纯斗图/沉默）不参选，即便 delta 高
const g2 = fakeDuel('fire', [
  { userText: '', aiReply: '……', hitType: 'sticker', delta: 30, stickerId: 'smug' },
  R('这话跟你没关系吧', 12),
]);
const q2 = pickGoldenQuote(g2);
if (!q2 || q2.userText !== '这话跟你没关系吧') {
  fail('纯斗图/沉默回合不该当选金句：' + JSON.stringify(q2));
}

// 7.3 灭火局：存档 delta 已翻转，选最负（安抚最深）的一手
const g3 = fakeDuel('extinguish', [
  SOFT('我听你说', -30),
  R('我知道你不好受', -12),
  R('你懂个屁', 12, 'self_destruct'),
]);
const q3 = pickGoldenQuote(g3);
if (!q3 || q3.userText !== '我听你说' || q3.delta !== -30) {
  fail('灭火局金句应选 delta 最负的回合：' + JSON.stringify(q3));
}

// 7.4 全程没落在点上（全 miss/自爆/无文字）→ null，卡片走兜底文案
if (pickGoldenQuote(fakeDuel('fire', [R('嗯', 0, 'miss'), R('去死', -12, 'self_destruct')]))) {
  fail('没有有效命中的局不该选出金句');
}
if (pickGoldenQuote(fakeDuel('fire', [])) !== null) fail('空局应返回 null');
if (pickGoldenQuote(fakeDuel('extinguish', [R('嗯。', 0, 'miss'), { userText: '', aiReply: '……', hitType: 'sticker', delta: -8 }]))) {
  fail('灭火局全无效回合也应返回 null');
}
if (typeof FALLBACK_QUOTE !== 'string' || !FALLBACK_QUOTE) fail('FALLBACK_QUOTE 应是非空兜底文案');

// 7.5 标签文案：点火局带 +Δ，灭火局带翻转前的降幅
if (quoteTagFor(g1) !== '本局最痛一击 +30') fail('点火局标签文案不对：' + quoteTagFor(g1));
if (quoteTagFor(g3) !== '本局最暖心一击 怒气-30') fail('灭火局标签文案不对：' + quoteTagFor(g3));
if (quoteTagFor(fakeDuel('fire', [R('嗯', 0, 'miss')])) !== null) fail('无金句时标签应为 null');

// 7.6 真 recordTurn 对方向：灭火局翻转后的存档 delta 能被正确选中
const eqQuote = createDuel(EQ_PERSONA);
recordTurn(eqQuote, { userText: '我知道你不好受', aiReply: '……', hitType: 'hit', quip: '' }); // -12
const eqBest = recordTurn(eqQuote, { userText: '我听你说', aiReply: '……', hitType: 'softspot', softspot: EQ_PERSONA.softspots[0], quip: '' }); // -30
const q6 = pickGoldenQuote(eqQuote);
if (!q6 || q6.userText !== '我听你说' || q6.delta !== eqBest.delta) {
  fail('真引擎灭火局应选中 -30 的心结回合：' + JSON.stringify(q6));
}

// 7.7 二维码：链接常量 + 矩阵结构（合法尺寸、三角 finder pattern、确定性）
if (QR_URL !== 'https://gang.debugzi.com') fail('二维码应编码正式链接 gang.debugzi.com：' + QR_URL);
const m1 = buildQrMatrix(QR_URL);
if (!m1 || (m1.size - 21) % 4 !== 0 || m1.size < 21) fail('QR 尺寸应为 21+4k，实际 ' + m1?.size);
// finder pattern：左上/右上/左下三块 7×7 = 深色边环 + 3×3 实心核
const finderOk = (m, top, left) => {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (m.isDark(top + r, left + c) !== (ring || core)) return false;
    }
  }
  return true;
};
if (!finderOk(m1, 0, 0) || !finderOk(m1, 0, m1.size - 7) || !finderOk(m1, m1.size - 7, 0)) {
  fail('QR 三个角的 finder pattern 不完整');
}
const m2 = buildQrMatrix(QR_URL);
let same = m2.size === m1.size;
if (same) {
  for (let r = 0; r < m1.size && same; r += 1) {
    for (let c = 0; c < m1.size; c += 1) {
      if (m1.isDark(r, c) !== m2.isDark(r, c)) { same = false; break; }
    }
  }
}
if (!same) fail('同一链接两次生成的 QR 矩阵应一致');
console.log('✓ 战绩图：金句方向感知选取 / 斗图沉默排除 / 空局兜底 / 标签文案 / QR 矩阵结构');

/* ==================================================================== */
/* 8. 人设数据完整性（3.0 B1 起）：所有 persona 逐字段过检，加人即受约束   */
/* ==================================================================== */
{
  const CATEGORIES_LEGAL = ['gang', 'deal', 'eq'];
  const ids = new Set();
  for (const p of PERSONAS) {
    for (const field of ['id', 'name', 'category', 'avatar', 'tagline', 'intro', 'opener']) {
      if (typeof p[field] !== 'string' || !p[field]) fail(`[数据完整性] ${p.id || '?'} 缺字段 ${field}`);
    }
    if (ids.has(p.id)) fail(`[数据完整性] 人设 id 重复：${p.id}`);
    ids.add(p.id);
    if (!CATEGORIES_LEGAL.includes(p.category)) fail(`[数据完整性] ${p.id} category 非法：${p.category}`);
    if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 5) {
      fail(`[数据完整性] ${p.id} difficulty 应为 1-5 整数`);
    }
    if (!Array.isArray(p.catchphrases) || p.catchphrases.length < 2) fail(`[数据完整性] ${p.id} catchphrases 应 ≥2 条`);
    if (!Array.isArray(p.presets) || p.presets.length < 3) fail(`[数据完整性] ${p.id} presets 应 ≥3 条（进攻/迂回/试探）`);

    // 软肋 ×3：delta 域 + keywords 量（含口语/标点变体，只做包含匹配）
    if (!Array.isArray(p.softspots) || p.softspots.length !== 3) fail(`[数据完整性] ${p.id} 软肋应恰 3 条`);
    const keys = new Set();
    for (const s of p.softspots) {
      if (!s.key || !s.label) fail(`[数据完整性] ${p.id} 软肋缺 key/label`);
      if (keys.has(s.key)) fail(`[数据完整性] ${p.id} 软肋 key 重复：${s.key}`);
      keys.add(s.key);
      if (!Number.isFinite(s.delta) || s.delta < 20 || s.delta > 40) {
        fail(`[数据完整性] ${p.id} 软肋 ${s.key} delta 应在 20-40 域，实际 ${s.delta}`);
      }
      if (!Array.isArray(s.keywords) || s.keywords.length < 6) {
        fail(`[数据完整性] ${p.id} 软肋 ${s.key} keywords 应 ≥6 个变体，实际 ${s.keywords?.length}`);
      }
      for (const kw of s.keywords) {
        if (typeof kw !== 'string' || kw.length < 2) fail(`[数据完整性] ${p.id} 软肋 ${s.key} 存在过短关键词：${kw}`);
      }
    }

    // stages 三键 + softspotReactions 三键齐（llm.js 按 key 兜底，缺 key 会漏到 stage 池）
    for (const stage of ['polite', 'sarcastic', 'agitated']) {
      if (!Array.isArray(p.stages?.[stage]) || p.stages[stage].length < 1) {
        fail(`[数据完整性] ${p.id} stages.${stage} 应为非空台词数组`);
      }
    }
    for (const s of p.softspots) {
      const r = p.softspotReactions?.[s.key];
      if (!Array.isArray(r) || r.length < 1) fail(`[数据完整性] ${p.id} softspotReactions 缺 ${s.key}（不许缺 key）`);
    }

    // breakdown：fire 房一次性破防词，情商房是暴怒常规池（开局语言，须够量）
    if (!Array.isArray(p.breakdown) || p.breakdown.length < 1) fail(`[数据完整性] ${p.id} breakdown 不可为空`);
    if (p.category === 'eq' && (p.breakdown.length < 6 || p.breakdown.length > 8)) {
      fail(`[数据完整性] ${p.id}（情商房）breakdown 应为 6-8 条暴怒池，实际 ${p.breakdown.length}`);
    }

    // finale：kind 合法 + 文案齐全（文案方向按房自检，EQ 用消气向表达）
    if (p.finale) {
      const f = p.finale;
      if (!['rapid', 'quit', 'recall', 'lights-off', 'read-none'].includes(f.kind)) {
        fail(`[数据完整性] ${p.id} finale.kind 非法：${f.kind}`);
      }
      if (!Array.isArray(f.lead) || f.lead.length === 0) fail(`[数据完整性] ${p.id} finale.lead 应非空`);
      if (typeof f.exitLine !== 'string' || !f.exitLine) fail(`[数据完整性] ${p.id} finale.exitLine 应非空`);
      if (f.kind === 'recall' && !f.recallText) fail(`[数据完整性] ${p.id} recall 演出应配 recallText`);
      if (f.kind === 'rapid' && f.lead.length < 4) fail(`[数据完整性] ${p.id} rapid 演出至少连发 4 条`);
    }

    // 预设必须命中三个互异软肋（旧的「命中即算过」自检挡不住串键 —— B2 抓过「截图水印」误串 evidence）
    const presetKeys = new Set();
    for (const text of p.presets) {
      const spot = matchSoftspot(p, text);
      if (!spot) fail(`[数据完整性] ${p.id} 预设未命中任何软肋：${text}`);
      else presetKeys.add(spot.key);
    }
    if (presetKeys.size !== p.softspots.length) {
      fail(`[数据完整性] ${p.id} 预设应命中 3 个互异软肋，实际 [${[...presetKeys].join(',')}]`);
    }

    // 阻力参数域（缺省 = 1.0/0 合法）
    if (p.guard !== undefined && (p.guard < 0.7 || p.guard > 1.3)) fail(`[数据完整性] ${p.id} guard 越界：${p.guard}`);
    if (p.drift !== undefined && (p.drift < 0 || p.drift > 5)) fail(`[数据完整性] ${p.id} drift 越界：${p.drift}`);
  }
  const eqCount = PERSONAS.filter((p) => p.category === 'eq').length;
  console.log(`✓ 人设数据完整性：${PERSONAS.length} 人设逐字段过检（情商房 ${eqCount} 人）`);
}
