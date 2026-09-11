// 冒烟测试：不开浏览器，直接跑引擎 + 本地大脑，验证四条路径都能走通。
// 用法：npm run smoke
import { PERSONAS, getPersona } from '../src/data/personas.js';
import {
  createDuel,
  localHitType,
  localJudge,
  matchSoftspot,
  recordTurn,
  uniqueSoftspotHits,
  stageOf,
  blendDelta,
  clampJudge,
  JUDGE_MAX,
  STAGES,
  TABLE_DELTA,
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

// 2b. 上面那条只验了亲戚。把「只点预设」这条不变量推广到所有对手 ——
// 老板以前是 94 分，正好是没人盯着它才漏过去的那个。
// 走 recordTurn（同步、真实结算路径），不经过 generateTurn 的 350~800ms 假思考，
// 所以 5 个人设一起验也很便宜，还顺带盖住 localJudge 不会把预设的句子改价。
for (const p of PERSONAS) {
  const duel = createDuel(p);
  const hit = new Set();
  let presetSum = 0;
  for (const text of p.presets) {
    const spot = matchSoftspot(p, text);
    if (spot && !hit.has(spot.key)) {
      hit.add(spot.key);
      presetSum += spot.delta;
    }
    recordTurn(duel, {
      userText: text,
      aiReply: '',
      hitType: localHitType(p, text),
      quip: '',
      softspot: spot,
      usedPreset: true,
    });
  }
  if (duel.breakdown !== presetSum) {
    fail(`${p.name} 走结算后只点预设是 ${duel.breakdown}，手算 ${presetSum}（localJudge 动了预设的分？）`);
  }
  // 只点预设永远赢不了：这是「不找软肋就别想赢」这条设计的底线
  if (presetSum >= 100) fail(`${p.name} 光点预设就有 ${presetSum} 分，闭着眼都能赢`);
  // 预设把三个软肋全给的对手（除了带诱饵的甲方），合计必须正好 90
  if (hit.size === p.softspots.length && presetSum !== 90) {
    fail(`${p.name} 的预设覆盖了全部软肋，合计应该是 90，实际 ${presetSum}`);
  }
}
console.log(
  `✓ ${PERSONAS.length} 个对手：只点预设一律到不了 100（全中的那几个正好停在 90）`
);

// 2c. 甲方（★★★★★）—— 全游戏最难的那个，两条设计都得钉死：
//     ① 诱饵点了真的白扔一个回合，而且换来的是一句夸奖（笑点在这儿落地）
//     ② 老老实实找第三个软肋的话，四回合正好破百，且自由文本占两轮 → SSR
const jiafang = getPersona('jiafang');

const decoyText = '我这就去改，您别生气';
const decoy = await generateTurn({
  persona: jiafang,
  duel: createDuel(jiafang),
  userText: decoyText,
  usedPreset: true,
});
if (decoy.hitType !== 'miss') fail(`甲方的诱饵「${decoyText}」应该是 miss，实际 ${decoy.hitType}`);
if (decoy.reply !== jiafang.presetReplies[decoyText]) {
  fail('诱饵的回应没走 presetReplies，笑点丢了：' + decoy.reply);
}
console.log(`✓ 甲方的诱饵：白扔一个回合（miss），换来的是一句「${decoy.reply}」`);

const hard = await play('jiafang', [
  '这个需求写进合同了吗？',
  '预算是多少？',
  '您能给我个参考吗？',
  '但是您得先告诉我这个需求到底要什么',
], '★★★★★ 的最难路径', 2);
if (hard.result !== 'win') fail('甲方的正确打法应该能赢，实际 ' + hard.result);
if (hard.breakdown !== 100) fail('甲方这条路应该正好破百，实际 ' + hard.breakdown);
if (hard.rounds.length !== 4) fail('甲方这条路应该是四回合，实际 ' + hard.rounds.length);
if (hard.freeTextRounds !== 2) fail('甲方这条路应该有两次是自己打的字，实际 ' + hard.freeTextRounds);
if (pickTitle(hard).id !== 'swift') {
  fail('自己找出三个软肋赢下来该给 SSR，实际 ' + pickTitle(hard).id);
}
console.log('✓ 最难的对手自己找软肋赢下来 → SSR「' + pickTitle(hard).name + '」');

/* ------------------------------------------------------------------ */
/* 3. 人设数据自检                                                      */
/*                                                                     */
/* 这一段以前只 console.log，关键词改坏了、预设命不中软肋，测试照样全绿  */
/* 退出 0 —— 它恰好是唯一能拦住「关键词过宽 / 软肋配平错了」的地方。      */
/* 现在写成硬断言：加一个新对手，这里必须全过。                          */
/* ------------------------------------------------------------------ */

const STAGE_KEYS = STAGES.filter((s) => s.id !== 'breakdown').map((s) => s.id);

for (const p of PERSONAS) {
  const who = `人设 ${p.name}(${p.id})`;

  // 星级：main.js 里是 '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)，
  // repeat 对负数抛 RangeError —— 星级写错一个数字就能让选人屏白屏
  if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 5) {
    fail(`${who} 的星级应该是 1~5 的整数，实际 ${p.difficulty}`);
  }

  for (const field of ['name', 'avatar', 'tagline', 'intro', 'opener']) {
    if (!String(p[field] || '').trim()) fail(`${who} 的 ${field} 是空的`);
  }
  if (!Array.isArray(p.catchphrases) || p.catchphrases.length === 0) {
    fail(`${who} 没有口头禅（llm.js 会 catchphrases.join）`);
  }
  if (!Array.isArray(p.breakdown) || p.breakdown.length === 0) {
    fail(`${who} 没有破防台词（main.js 会遍历 breakdown）`);
  }
  for (const key of STAGE_KEYS) {
    if (!Array.isArray(p.stages?.[key]) || p.stages[key].length === 0) {
      fail(`${who} 缺 ${key} 阶段的台词`);
    }
  }

  // README 承诺的是「2–3 个软肋」，所以是 >= 2 而不是 === 3
  if (!Array.isArray(p.softspots) || p.softspots.length < 2) {
    fail(`${who} 的软肋少于 2 个`);
  }
  const keys = p.softspots.map((s) => s.key);
  if (new Set(keys).size !== keys.length) fail(`${who} 有重复的软肋 key：${keys.join(', ')}`);

  const words = new Map();
  for (const spot of p.softspots) {
    // 软肋没台词会静默降级到 stages[stage.id]（llm.js 的 ||），出问题看不出来
    const reactions = p.softspotReactions?.[spot.key];
    if (!Array.isArray(reactions) || reactions.length === 0) {
      fail(`${who} 的软肋 ${spot.key} 没有对应的反应台词`);
    }
    if (!Number.isFinite(spot.delta) || spot.delta <= 0) fail(`${who} 的 ${spot.key} delta 非法`);
    // 同一个人的两个软肋不能共用一个关键词（跨人设可以，匹配是按人设走的）
    for (const kw of spot.keywords) {
      if (words.has(kw)) fail(`${who} 的关键词「${kw}」同时属于 ${words.get(kw)} 和 ${spot.key}`);
      words.set(kw, spot.key);
    }
  }
  // 配平：< 100 才能保证「只点预设打平」，+12 >= 100 才能保证「找齐三个再补一句」赢
  const sum = p.softspots.reduce((a, s) => a + s.delta, 0);
  if (sum < 88 || sum > 99) {
    fail(`${who} 的软肋合计 ${sum}，必须落在 88~99（<100 才不会只点预设就赢，+12 要能破百）`);
  }
  if (sum !== 90) {
    fail(`${who} 的软肋合计是 ${sum}，demo 配平要求正好 90（三个预设刚好 90、补一句破百）`);
  }

  // 预设：每个都得有用，且不能两个预设撞同一个软肋
  // （同一个软肋连点会触发减半，合计只剩 2d，90 的配平直接崩）
  const spotOf = new Map();
  for (const text of p.presets) {
    const spot = matchSoftspot(p, text);
    const label = spot ? spot.key : localHitType(p, text);
    if (spot) {
      if (spotOf.has(spot.key)) fail(`${who} 的两个预设都命中 ${spot.key}：${spotOf.get(spot.key)} / ${text}`);
      spotOf.set(spot.key, text);
    }
    console.log(`  预设 ${p.name}: ${text} → ${spot ? `${spot.key} +${spot.delta}` : label}`);
  }
  // 至少 2 个预设是真软肋 —— 甲方的诱饵是故意留的（★★★★★ 得真难）
  if (spotOf.size < 2) fail(`${who} 只有 ${spotOf.size} 个预设命中软肋，至少要 2 个`);
  // 诱饵必须真的是无效输出，不能悄悄变成有效输出白送 12 分
  for (const text of p.presets) {
    if (!matchSoftspot(p, text) && localHitType(p, text) !== 'miss') {
      fail(`${who} 的诱饵预设「${text}」应该是 miss，实际 ${localHitType(p, text)}`);
    }
  }
  console.log(`✓ ${who} 数据自检通过（软肋 ${sum} 分 / 预设命中 ${spotOf.size} 个）`);
}

// id 唯一：getPersona 返回第一个匹配，重复 id 会让后面那个人设永远选不到
const ids = PERSONAS.map((p) => p.id);
if (new Set(ids).size !== ids.length) fail('有重复的人设 id：' + ids.join(', '));

/* 复现句探针表。
 *
 * 「关键词过宽」这类 bug 没有任何通用断言能抓住 —— '好的'、'我请' 单独看都是
 * 合理的关键词，错的是行为。这张表是唯一的防线，也是给下一个写人设的人的说明书。
 * 格式：[人设 id, 玩家说, 期望命中的软肋 key（null = 不该算软肋）]
 */
const PROBES = [
  ['wangyou', '好的，那你解释一下你的逻辑', 'logic'], // 不是 shutup
  ['wangyou', '我要截图发群里', 'screenshot'],
  ['wangyou', '你说得对', 'shutup'],
  // 这条专门盯 '好的' 有没有被人改回去。「好的，那你解释一下你的逻辑」有 '逻辑'
  // 兜着，软肋顺序一调就对了，单靠它拦不住重新放宽；这句没有第二个关键词。
  ['wangyou', '好的，我先说两句', null],
  ['qinqi', '我请问你凭什么', null], // '我请' 不该吃掉这句话
  ['qinqi', '给您添麻烦了', null], // '给您' 同上
  ['qinqi', '您来我家吃饭', null], // '您来' 同上
  ['qinqi', '您家孩子现在在哪儿高就啊？', 'kid'],
  ['jiafang', '我这就去改，您别生气', null], // 诱饵
  ['jiafang', '这个需求写进合同了吗？', 'contract'],
];
for (const [id, text, expect] of PROBES) {
  const p = getPersona(id);
  if (!p) fail(`探针表引用了不存在的人设：${id}`);
  const actual = matchSoftspot(p, text)?.key ?? null;
  if (actual !== expect) {
    fail(`探针失败「${text}」：期望 ${expect ?? '不算软肋'}，实际 ${actual ?? '不算软肋'}`);
  }
}
console.log(`✓ 复现句探针 ${PROBES.length} 条全过（关键词过宽这类 bug 只能靠它拦）`);

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
// 老数值（软肋 32/28/30、hit 12、自爆 −12）全靠这条才没走样。
// 样本从人设数据推导，别写死：写死的话改了配平它就悄悄过期了
const deltas = [...new Set(PERSONAS.flatMap((p) => p.softspots.map((s) => s.delta)))];
for (const t of [...deltas, TABLE_DELTA.hit, TABLE_DELTA.miss, TABLE_DELTA.self_destruct]) {
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

/* ------------------------------------------------------------------ */
/* 9. 赛后称号                                                          */
/*                                                                     */
/* SSR 那条分支以前读的是 duel.softspotHits —— createDuel 从来没设过，  */
/* 于是谁都拿不到，而没测试盯着，它就那么死了很久。                      */
/* ------------------------------------------------------------------ */

const fakeDuel = (result, rounds, spots, freeText) => ({
  result,
  rounds: Array.from({ length: rounds }, () => ({})),
  softspotKeys: Array.from({ length: spots }, (_, i) => `k${i}`),
  freeTextRounds: freeText,
});

const titleCases = [
  ['win', 4, 3, 2, 'swift', '四轮内三个软肋全靠自己找'],
  ['win', 4, 3, 3, 'swift', '四轮内全自己打'],
  ['win', 4, 3, 1, 'master', '标准演示路径（3 预设 + 1 句自己的话）'],
  ['win', 5, 3, 3, 'master', '五轮才赢（条件是四轮之内）'],
  ['win', 6, 3, 3, 'master', '拖太久'],
  ['lose', 2, 0, 0, 'countered', '自爆两次'],
  ['draw', 8, 3, 0, 'scripted', '全程照预设念'],
  ['draw', 8, 1, 4, 'stubborn', '八轮没破防但说了自己的话'],
];
for (const [result, rounds, spots, freeText, expect, why] of titleCases) {
  const actual = pickTitle(fakeDuel(result, rounds, spots, freeText)).id;
  if (actual !== expect) fail(`称号「${why}」应该是 ${expect}，实际 ${actual}`);
}
console.log(`✓ 称号判定 ${titleCases.length} 种情形全对（SSR 现在可达，且只给真自己找软肋的）`);

// 三轮内破不了百，所以 rounds <= 3 那个旧条件本来就是死路 —— 把这个事实钉住，
// 免得以后有人觉得「四轮」太宽松，又把它改回去
const best3 = [...deltas].sort((a, b) => b - a).slice(0, 3)
  .reduce((sum, d) => sum + blendDelta(d, JUDGE_MAX), 0);
if (best3 >= 100) fail(`三轮上限居然能破百（${best3}），称号条件可以收紧了`);
console.log(`✓ 三个软肋、判断分拉满，三轮上限只有 ${best3} < 100 ——「三轮之内」确实不可能`);
