// 冒烟测试：不开浏览器，直接跑引擎 + 本地大脑，验证四条路径都能走通。
// 用法：npm run smoke
import { PERSONAS } from '../src/data/personas.js';
import { createDuel, recordTurn, uniqueSoftspotHits, stageOf } from '../src/lib/duel-engine.js';
import { categoryOf } from '../src/data/categories.js';
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

// 现有人设归组：网友/亲戚 → 杠精房，老板 → 谈判房
if (categoryOf(PERSONAS.find((p) => p.id === 'wangyou')).id !== 'gang') fail('杠精网友应归杠精房');
if (categoryOf(PERSONAS.find((p) => p.id === 'qinqi')).id !== 'gang') fail('阴阳怪气亲戚应归杠精房');
if (categoryOf(PERSONAS.find((p) => p.id === 'laoban')).id !== 'deal') fail('画饼老板应归谈判房');

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
