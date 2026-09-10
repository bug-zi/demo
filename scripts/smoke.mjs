// 冒烟测试：不开浏览器，直接跑引擎 + 本地大脑，验证四条路径都能走通。
// 用法：npm run smoke
import { PERSONAS, getPersona } from '../src/data/personas.js';
import {
  createDuel,
  localHitType,
  localJudge,
  recordTurn,
  uniqueSoftspotHits,
  stageOf,
  blendDelta,
  clampJudge,
} from '../src/lib/duel-engine.js';
import { MAX_INPUT, clip, stripEmoji } from '../src/lib/text.js';
import { generateTurn, engineLabel, testConnection } from '../src/lib/llm.js';
import { saveSettings } from '../src/lib/settings.js';
import { pickTitle } from '../src/data/titles.js';

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};

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
        `→ 破防值 ${record.breakdownAfter} (${stageOf(duel.breakdown).label}) | ${turn.reply}`
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
// 加了 20% 的判断分之后这两条路径必须还成立 —— 配平是 demo 的命根子
const demo = await play('qinqi', [
  '您家孩子现在在哪儿高就啊？',
  '姑姑这红包您先收着',
  '您先给我示范一下怎么成功呗',
  '但是您当年不也是这么过来的吗？',
], '演示路径', 3);
if (demo.result !== 'win') fail('演示路径应该在第 4 轮破百，实际 ' + demo.result);
if (demo.breakdown !== 100) fail('演示路径赢了就该正好 100，实际 ' + demo.breakdown);

// 2. 只点预设，不补刀：应该停在 90 打平
const presetsOnly = await play('qinqi', [
  '您家孩子现在在哪儿高就啊？',
  '姑姑这红包您先收着',
  '您先给我示范一下怎么成功呗',
], '只点预设', 3);
if (presetsOnly.result !== 'draw') fail('只点预设应该打平，实际 ' + presetsOnly.result);
if (presetsOnly.breakdown !== 90) fail('只点预设应该正好停在 90，实际 ' + presetsOnly.breakdown);

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

delete global.localStorage;
delete global.fetch;

/* ------------------------------------------------------------------ */
/* 6. 主题：在既没有 localStorage 也没有 document 的纯 node 下不能炸       */
/* ------------------------------------------------------------------ */

const theme = await import('../src/lib/theme.js');
if (theme.loadTheme() !== 'dark') fail('没存过主题时应该回落到暗色');
if (theme.normalizeTheme('荧光粉') !== 'dark') fail('非法主题名应该被收敛掉');
if (theme.nextTheme('dark') !== 'light' || theme.nextTheme('light') !== 'dark') {
  fail('nextTheme 应该在两套之间来回切');
}
if (theme.applyTheme('light') !== 'light') fail('applyTheme 应该返回生效的主题');
console.log('✓ 主题：无 localStorage / 无 document 时不炸，非法值收敛到暗色');

/* ------------------------------------------------------------------ */
/* 7. 表情：只表达语气，不参与判定                                        */
/* ------------------------------------------------------------------ */

const p = getPersona('qinqi'); // 用有明确关键词软肋的那个，「您家孩子」是它的

// 9 个 emoji = 18 个 UTF-16 单元，正好撞上「够长了算有效输出」那条线。
// 不摘掉的话，点九下表情就白拿一次 +12 —— 比打字便宜太多，等于刷分器
if (stripEmoji('😏') !== '') fail('stripEmoji 没认出 emoji');
if (localHitType(p, '😏'.repeat(9)) !== 'miss') {
  fail('纯表情不该算有效输出，实际 ' + localHitType(p, '😏'.repeat(9)));
}
if (localHitType(p, '😏🙄😂🤣💀🤡👏🙃🫠') !== 'miss') fail('纯表情也不该自爆');
// 反过来，表情不能把真正的论点一起吃掉
if (localHitType(p, '您家孩子现在在哪儿高就啊？😏') !== 'softspot') fail('带表情的软肋句应该照样算软肋');
if (localHitType(p, '但是你自己上次也这么说的吧😅') !== 'hit') fail('带表情的论点应该照样算有效输出');
console.log('✓ 表情不参与判定：纯表情算 miss，带表情的软肋/论点照常算');

// clip 不能把 emoji 从中间劈开 —— 孤立代理项在界面上就是个「�」
const cutTail = clip('a' + '😏'.repeat(60), MAX_INPUT);
if (cutTail.length !== 99) fail('应该往后退一格避开代理对，实际长度 ' + cutTail.length);
for (const s of [cutTail, clip('😏'.repeat(60), MAX_INPUT), clip('短', MAX_INPUT)]) {
  if (/[\uD800-\uDBFF]$/.test(s)) fail('clip 切出了孤立的高代理项');
}
if (clip('说得对', MAX_INPUT) !== '说得对') fail('没超上限不该动原文');
console.log('✓ clip 按上限裁剪，不会把 emoji 劈成半个');

/* ------------------------------------------------------------------ */
/* 8. 破防值 = 查表 80% + 判断 20%                                       */
/* ------------------------------------------------------------------ */

const judgePersona = getPersona('qinqi');

// 判断分等于查表值时，结果必须原样等于查表值 ——
// 老数值（软肋 32/28/30、hit 12、自爆 −12）全靠这条才没走样
for (const t of [34, 32, 30, 12, 0, -12]) {
  if (blendDelta(t, t) !== t) fail(`判断分跟查表值一致时应该原样保留 ${t}，实际 ${blendDelta(t, t)}`);
}
// 20% 真的在起作用：同样一个 hit，判断分高低给出不同的增量
if (blendDelta(12, 12) !== 12) fail('判断分 12 时应该还是 12');
if (blendDelta(12, 35) !== 17) fail('判断分拉满时应该到 17，实际 ' + blendDelta(12, 35));
if (blendDelta(12, -15) !== 7) fail('判断分垫底时应该掉到 7，实际 ' + blendDelta(12, -15));
console.log('✓ 80/20 配比：判断分与查表值一致时数值不变，偏离时最多上下浮动 20%');

// 夹死上下界：模型返回 999 不能一回合把破防值顶满，那是「模型抽风也坏不了游戏」的底线
if (clampJudge(999) !== 35) fail('判断分上限没夹住：' + clampJudge(999));
if (clampJudge(-999) !== -15) fail('判断分下限没夹住：' + clampJudge(-999));
if (clampJudge('abc') !== null || clampJudge(undefined) !== null) fail('非数字应该返回 null');
if (clampJudge(29.6) !== 30) fail('小数应该四舍五入');
console.log('✓ 判断分夹在 -15 ~ 35：模型返回 999 也只能撬动 20%');

// 本地判断分：用跟关键词无关的信号加减，但不动基准盘
const judgeDuel = createDuel(judgePersona);
if (localJudge(judgeDuel, '您家孩子现在在哪儿高就啊？', 32) !== 32) {
  fail('基准分应该就是查表值（不加减），实际 ' + localJudge(judgeDuel, '您家孩子现在在哪儿高就啊？', 32));
}
recordTurn(judgeDuel, { userText: '你懂个屁', aiReply: 'x', hitType: 'self_destruct', quip: '' });
if (localJudge(judgeDuel, '你懂个屁', -12) !== -15) {
  fail('复读 + 太短该扣到下限，实际 ' + localJudge(judgeDuel, '你懂个屁', -12));
}
if (localJudge(judgeDuel, '但是你自己上次也这么说的吧', 12) !== 16) {
  fail('引用了对方该加 4，实际 ' + localJudge(judgeDuel, '但是你自己上次也这么说的吧', 12));
}
if (localJudge(judgeDuel, '😏😏😏', 12) !== 12) fail('纯表情不该被本地判断扣分');
console.log('✓ 本地判断分：复读/太短扣分，引用对方加分，纯表情不奖不罚');

// 沉默是超时判的，不是玩家敷衍 —— 不该倒扣
const silentDuel = createDuel(judgePersona);
const silentTurn = recordTurn(silentDuel, {
  userText: '（沉默）', aiReply: 'x', hitType: 'miss', quip: '', silent: true,
});
if (silentTurn.delta !== 0) fail('沉默应该 0 分，实际 ' + silentTurn.delta);

// 远程的 score 要一路走到结算里。
// 这个假 localStorage 得能存能读 —— 只写不读的话 resolveConfig() 读回来是
// 默认的 local，generateTurn 直接走本地，测的就不是远程那条路了
const judgeStore = new Map();
global.localStorage = {
  getItem: (k) => (judgeStore.has(k) ? judgeStore.get(k) : null),
  setItem: (k, v) => judgeStore.set(k, String(v)),
  removeItem: (k) => judgeStore.delete(k),
};
saveSettings({ provider: 'openai', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://example.test/v1' });
const stubFetch = (content) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
});

global.fetch = stubFetch('{"reply":"行","hitType":"hit","score":30}');
const scored = await generateTurn({
  persona: judgePersona,
  duel: createDuel(judgePersona),
  userText: '但是你自己上次也这么说的吧',
});
if (scored.judgeScore !== 30) fail('远程的 score 没接住：' + scored.judgeScore);

global.fetch = stubFetch('{"reply":"行","hitType":"hit","score":999}');
const overscored = await generateTurn({
  persona: judgePersona,
  duel: createDuel(judgePersona),
  userText: '测试一下',
});
if (overscored.judgeScore !== 35) fail('超界的 score 应该被夹到 35，实际 ' + overscored.judgeScore);

global.fetch = stubFetch('{"reply":"行","hitType":"hit"}');
const unscored = await generateTurn({
  persona: judgePersona,
  duel: createDuel(judgePersona),
  userText: '测试一下',
});
if (unscored.judgeScore !== null) fail('模型没给 score 时应该是 null，实际 ' + unscored.judgeScore);
console.log('✓ 远程 score：拿到分就用，超界夹住，没给就交给本地判断分');

saveSettings({ provider: 'local', apiKey: '', model: '', baseUrl: '' });
delete global.localStorage;
delete global.fetch;

// score 得真的进到结算：光接住不落地等于没接
const remoteDuel = createDuel(judgePersona);
const remoteTurn = recordTurn(remoteDuel, {
  userText: '但是你自己上次也这么说的吧',
  aiReply: '行',
  hitType: 'hit',
  quip: '',
  judgeScore: 30,
});
if (remoteTurn.record.tableDelta !== 12 || remoteTurn.record.judgeDelta !== 30) {
  fail('结算里没记下 80/20 的两半：' + JSON.stringify(remoteTurn.record));
}
if (remoteTurn.delta !== 16) fail('查表 12、判断 30 应该得 16，实际 ' + remoteTurn.delta);
console.log('✓ 结算记录里留着两半（查表 +12 / 判断 +30），合起来 +16');
