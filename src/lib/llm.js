/**
 * 对线「大脑」适配层。
 *
 * 三条路：
 *   1. 本地引擎（默认）——没有 key 时用，模板 + 关键词判定，永远跑得通。
 *   2. Claude —— Anthropic 官方 API，走官方 SDK。
 *   3. OpenAI 兼容 —— DeepSeek / 通义 / Kimi / 智谱 / Ollama / 自建网关，
 *      一律 `POST {baseUrl}/chat/completions`。
 *
 * 无论走哪条路，返回的都是同一个结构：
 *   { reply, hitType, quip, source, judgeScore? }
 * 上层（main.js / duel-engine.js）不关心是谁生成的。
 * judgeScore 只有远程那条路有 —— 本地那 20% 由 duel-engine 的 localJudge 出，
 * 那是引擎的活儿，不是「大脑」的。
 *
 * 配置来源，优先级从高到低：
 *   1. 用户在界面里填的（localStorage，见 settings.js）
 *   2. .env.local 里的 VITE_LLM_*（团队自己的 demo 配置）
 *   3. 什么都没有 → 本地引擎
 *
 * 注意：key 存在浏览器里，只适合本地演示 / 内网 demo。
 * 要正式上线得换成一个后端代理。
 */

import {
  GENERIC_REPLIES,
  HIT_QUIPS,
  SELF_DESTRUCT_REACTIONS,
  pick,
} from '../data/fallbacks.js';
import { clampJudge, localHitType, matchSoftspot, stageOf } from './duel-engine.js';
import { loadSettings } from './settings.js';

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const ENV_KEY = String(ENV.VITE_LLM_API_KEY || '').trim();
const ENV_BASE_URL = String(ENV.VITE_LLM_BASE_URL || '').trim();
const ENV_MODEL = String(ENV.VITE_LLM_MODEL || '').trim();
// 对局里每回合只有 30 秒，默认关掉思考换速度；想要更强的台词质量改成 adaptive
const THINKING = String(ENV.VITE_LLM_THINKING || 'disabled').trim();

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';
const LOCAL = { provider: 'local', apiKey: '', model: '', baseUrl: '' };

/**
 * 现在该用哪条路。每回合现读一次 —— localStorage 读很便宜，
 * 换来的是「用户改完立刻生效」，不用搞订阅。
 */
export function resolveConfig() {
  const saved = loadSettings();
  if (saved.provider !== 'local' && saved.apiKey) {
    return {
      provider: saved.provider,
      apiKey: saved.apiKey,
      model: saved.model || (saved.provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : ''),
      baseUrl: saved.baseUrl,
    };
  }
  if (ENV_KEY) {
    return {
      provider: 'anthropic',
      apiKey: ENV_KEY,
      model: ENV_MODEL || DEFAULT_ANTHROPIC_MODEL,
      baseUrl: ENV_BASE_URL,
    };
  }
  return { ...LOCAL };
}

export function isRemote() {
  return resolveConfig().provider !== 'local';
}

export function engineLabel() {
  const config = resolveConfig();
  if (config.provider === 'local') return '本地引擎';
  return `真实 AI · ${config.model || '未指定模型'}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 本地引擎                                                            */
/* ------------------------------------------------------------------ */

function localTurn({ persona, duel, userText, usedPreset }) {
  const stage = stageOf(duel.breakdown);
  const hitType = localHitType(persona, userText);
  const spot = hitType === 'softspot' ? matchSoftspot(persona, userText) : null;

  let reply;
  if (hitType === 'self_destruct') {
    reply = pick(SELF_DESTRUCT_REACTIONS);
  } else if (spot) {
    // 软肋台词优先；万一人设没写这条，退回当前阶段的台词
    reply = pick(persona.softspotReactions[spot.key] || persona.stages[stage.id]);
  } else if (usedPreset && persona.presetReplies?.[userText]) {
    // 诱饵预设：选项本身就是陷阱（甲方那个「我这就去改」），没有专属台词的话
    // 它只是白扔一个回合；有的话玩家能看清自己是怎么被哄的
    reply = persona.presetReplies[userText];
  } else if (stage.id === 'breakdown') {
    reply = pick(persona.breakdown);
  } else {
    reply = pick(persona.stages[stage.id]) || pick(GENERIC_REPLIES);
  }

  return {
    reply,
    hitType,
    softspot: spot,
    quip: HIT_QUIPS[hitType],
    source: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* 真实 AI —— 公共部分                                                  */
/* ------------------------------------------------------------------ */

const HIT_TYPES = ['softspot', 'hit', 'miss', 'self_destruct'];

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '这个角色说出口的一句话，不超过 80 个字' },
    hitType: {
      type: 'string',
      enum: HIT_TYPES,
      description: '玩家这句话对这个角色的效果',
    },
    score: {
      type: 'integer',
      description:
        '你独立给这句话打的杀伤力分（-15 ~ 35）：30 左右=正中软肋把你说不出话，' +
        '12 左右=有道理你有点难接，0=不痛不痒，负数=玩家自己在露怯。' +
        '这一项占最终破防值涨幅的 20%，跟 hitType 不必一致。',
    },
  },
  required: ['reply', 'hitType', 'score'],
  additionalProperties: false,
};

function buildSystemPrompt(persona, duel) {
  const stage = stageOf(duel.breakdown);
  const spots = persona.softspots
    .map((s) => `- ${s.label}（比如说到：${s.keywords.slice(0, 3).join('、')}）`)
    .join('\n');

  return [
    `你在一款叫「杠精陪练房」的游戏里扮演一个角色，正在和玩家对线。`,
    ``,
    `# 你的角色`,
    `名字：${persona.name}`,
    `设定：${persona.intro}`,
    `你的口头禅（可以自然地用）：${persona.catchphrases.join('、')}`,
    ``,
    `# 你的软肋（你心里知道，但绝不主动承认）`,
    spots,
    ``,
    `# 当前状态`,
    `破防值：${duel.breakdown}/100`,
    `情绪阶段：${stage.label}（0-35 礼貌，35-65 阴阳怪气，65-85 开始上头，85-100 已经破防）`,
    ``,
    `# 规则`,
    `1. 只说一句话，不超过 80 个字。不要动作描写，不要加引号，不要旁白。`,
    `2. 语气必须匹配当前情绪阶段。破防值越高越失控。`,
    `3. 绝对禁止脏话、侮辱性词汇、地域/性别/职业歧视。破防的表现是沉默、敷衍、想退出、拉黑，而不是骂人。`,
    `4. 判断玩家这句话对你的效果，选一个 hitType：`,
    `   - softspot：玩家戳中了上面列的软肋，你被噎住了`,
    `   - hit：说得有道理，你有点难接`,
    `   - miss：没什么力度，你可以轻松怼回去`,
    `   - self_destruct：玩家自己上头了（骂人、人身攻击、语无伦次），你反而占了上风`,
    `5. 再给这句话单独打一个 score（判断分），这是你对它杀伤力的独立判断，`,
    `   最终破防值涨幅 = 查表值 × 80% + 你的 score × 20%：`,
    `   - 30 左右：正中软肋，你真的被噎住了`,
    `   - 12 左右：说得有道理，你有点难接`,
    `   - 0 左右：不痛不痒，说完就过`,
    `   - 负数：玩家自己在露怯（复读、说废话、逻辑崩了、光顾着骂人）`,
    `   score 跟 hitType 不必一致：同样是 softspot，一句敷衍的和一句把人噎死的，分数该不一样。`,
    `6. 不要跳出角色。不要解释规则。不要提到自己是 AI。`,
    `7. 只输出 JSON，形如 {"reply": "...", "hitType": "...", "score": 30}，不要加任何别的字。`,
  ].join('\n');
}

function buildMessages(duel, userText) {
  const history = [];
  // 只带最近 6 回合，控制 token 也避免模型被早期的自己带跑偏
  for (const r of duel.rounds.slice(-6)) {
    history.push({ role: 'user', content: r.userText });
    // 助手的历史消息必须是 JSON。塞纯文本的话，模型看到自己前面在说大白话，
    // 就会跟着说大白话，把 system prompt 里那句「只输出 JSON」抛到脑后 ——
    // 上下文里的范例永远比指令有力。这里把它自己的历史也写成 JSON，示范给它看。
    history.push({
      role: 'assistant',
      content: JSON.stringify({ reply: r.aiReply, hitType: r.hitType, score: r.judgeDelta }),
    });
  }
  history.push({ role: 'user', content: userText });
  return history;
}

/** 有些兼容服务商不认 response_format，会在 JSON 外面裹一层 ``` 或加句废话。 */
function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('模型没有返回内容');
  try {
    return JSON.parse(raw);
  } catch {
    // 继续往下截
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`模型返回的不是 JSON（它说的是：${raw.slice(0, 80)}）`);
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error(`模型返回的 JSON 不完整（${raw.slice(0, 80)}）`);
  }
}

/** 把各家的返回都收敛成同一个 turn 结构。 */
function toTurn(parsed, persona, userText) {
  const hitType = HIT_TYPES.includes(parsed?.hitType) ? parsed.hitType : 'miss';
  return {
    reply: String(parsed?.reply || '').slice(0, 120),
    hitType,
    // 20% 那部分的原料。模型没给 / 给了个乱七八糟的值 → null，
    // recordTurn 会退回本地打分，不至于让这一回合少算一块
    judgeScore: clampJudge(parsed?.score),
    softspot: hitType === 'softspot' ? matchSoftspot(persona, userText) : null,
    quip: HIT_QUIPS[hitType],
    source: 'remote',
  };
}

/* ------------------------------------------------------------------ */
/* 真实 AI —— Claude                                                    */
/* ------------------------------------------------------------------ */

async function anthropicTurn(config, { persona, duel, userText }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    // 前端直连官方 API 必须开这个开关。仅用于 demo，key 会暴露给浏览器。
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: config.model || DEFAULT_ANTHROPIC_MODEL,
    // 台词本身很短，但开了 thinking 的话思考也算在这个额度里
    max_tokens: 2048,
    system: buildSystemPrompt(persona, duel),
    messages: buildMessages(duel, userText),
    thinking: { type: THINKING },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: TURN_SCHEMA },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('模型拒绝了这个请求');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('模型输出被 max_tokens 截断了');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('模型没有返回文本');

  return toTurn(extractJson(textBlock.text), persona, userText);
}

/* ------------------------------------------------------------------ */
/* 真实 AI —— OpenAI 兼容协议                                            */
/* ------------------------------------------------------------------ */

function openAiEndpoint(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('还没填 Base URL');
  return `${base}/chat/completions`;
}

// 台词只有几十个字，但推理型模型（deepseek-reasoner / R1 之类）的思考过程
// 跟答案共用这个额度：给 512 的话，历史一长思考就把额度吃光，content 直接空。
const OPENAI_MAX_TOKENS = 4096;

function openAiBody(config, { persona, duel, userText }, withJsonMode, reminder) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(persona, duel) },
    ...buildMessages(duel, userText),
  ];
  // 最后一招：模型把「只输出 JSON」当耳旁风时，把要求再顶到它眼前
  if (reminder) {
    messages.push({
      role: 'user',
      content: '（系统提醒：只输出 JSON，形如 {"reply":"...","hitType":"...","score":30}，不要加任何别的字。）',
    });
  }
  return {
    model: config.model,
    max_tokens: OPENAI_MAX_TOKENS,
    temperature: 0.9,
    ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages,
  };
}

const looksLikeJson = (text) => {
  const start = text.indexOf('{');
  return start !== -1 && text.lastIndexOf('}') > start;
};

/**
 * 200 但 content 为空时，把响应里的线索翻译成能直接照着做的原因。
 * 带上原始响应片段 —— 空 content 的花样太多（思考字段、代理改写、内容过滤），
 * 光说「空内容」没法定位，把证据直接摆出来最快。
 */
function emptyContentReason(choice, data) {
  const finish = choice?.finish_reason;
  const message = choice?.message || {};
  // content/role 之外还有别的字段，往往就是答案被塞到了别处
  const extraKeys = Object.keys(message).filter((k) => k !== 'role' && k !== 'content');
  const thinkKey = extraKeys.find((k) => /reason|think/i.test(k));
  const raw = JSON.stringify(data || {}).slice(0, 160);

  let hint;
  if (finish === 'length') {
    hint = '输出被 max_tokens 截断了，多半是推理型模型把额度花在思考上';
  } else if (thinkKey) {
    hint = `答案被放进了 ${thinkKey} 字段，content 是空的`;
  } else if (!choice) {
    hint = '响应里没有 choices';
  } else if (extraKeys.length) {
    hint = `message 里只有 ${extraKeys.join('/')}，没有正文`;
  } else {
    hint = `模型真的返回了空内容（finish_reason: ${finish || '无'}）`;
  }
  return `${hint}｜原始响应：${raw}`;
}

async function postChat(config, payload) {
  return fetch(openAiEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

// 记下哪些服务商不认 response_format（键：baseUrl|model），别每回合都白试一次
const jsonModeUnsupported = new Set();
const modeKey = (config) => `${config.baseUrl}|${config.model}`;
const contentOf = (data) => String(data?.choices?.[0]?.message?.content || '');

async function openAiTurn(config, ctx) {
  if (!config.model) throw new Error('还没填模型名');

  const key = modeKey(config);
  const tryJsonMode = !jsonModeUnsupported.has(key);

  let response = await postChat(config, openAiBody(config, ctx, tryJsonMode));
  let data = response.ok ? await response.json() : null;

  // 不认 response_format 的服务商有两种表现：直接 400，或者 200 但 content 是空的。
  // 两种都去掉 response_format 重发一次；后者顺手记下来，之后不再试。
  const jsonModeFailed =
    tryJsonMode && (response.status === 400 || (response.ok && !contentOf(data).trim()));

  if (jsonModeFailed) {
    if (response.ok) jsonModeUnsupported.add(key);
    console.warn(`[杠精陪练房] ${config.model} 不吃 response_format，改用它自己的 JSON 输出。`);
    response = await postChat(config, openAiBody(config, ctx, false));
    data = response.ok ? await response.json() : null;
  }

  if (!response.ok) throw new Error(await describeHttpError(response));

  let choice = data?.choices?.[0];
  let content = String(choice?.message?.content || '').trim();

  // 说人话不说 JSON：再顶一次要求，多半就老实了
  if (content && !looksLikeJson(content)) {
    console.warn(`[杠精陪练房] ${config.model} 没按 JSON 回，追加一次提醒。它说的是：`, content.slice(0, 120));
    const strict = await postChat(config, openAiBody(config, ctx, false, true));
    if (strict.ok) {
      const strictData = await strict.json();
      const strictChoice = strictData?.choices?.[0];
      const strictContent = String(strictChoice?.message?.content || '').trim();
      if (looksLikeJson(strictContent)) {
        data = strictData;
        choice = strictChoice;
        content = strictContent;
      }
    }
  }

  if (!content) throw new Error(emptyContentReason(choice, data));
  return toTurn(extractJson(content), ctx.persona, ctx.userText);
}

/* ------------------------------------------------------------------ */
/* 错误信息翻译成人话                                                    */
/* ------------------------------------------------------------------ */

async function describeHttpError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || body?.message || '';
  } catch {
    // 不是 JSON 就算了，不纠结
  }
  const hint =
    {
      400: '请求被拒了，多半是模型名或参数不对',
      401: 'key 无效或已过期',
      403: '这个 key 没有该模型的权限',
      404: 'base URL 或模型名不对',
      429: '触发限流了，等一下再试',
      500: '服务商那边出错了',
      502: '服务商网关出错',
      503: '服务商暂时不可用',
    }[response.status] || `HTTP ${response.status}`;
  return detail ? `${hint}：${detail}` : hint;
}

function describeError(err) {
  const status = err?.status;
  if (status === 401 || status === 403) return 'key 无效或没有权限';
  if (status === 404) return 'base URL 或模型名不对';
  if (status === 429) return '触发限流了，等一下再试';

  const message = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return '连不上：可能是跨域被浏览器拦了，或者地址/网络不通。OpenAI 官方 API 就不允许浏览器直连。';
  }
  return message || '未知错误';
}

/* ------------------------------------------------------------------ */

/**
 * 生成对手的回应。远程失败一律降级到本地，不打断对局。
 *
 * 降级时会带上 `fallback`（人话的失败原因），界面把它显示成一行小字 ——
 * 否则「这回合到底是 AI 说的还是模板说的」在游戏里根本看不出来。
 *
 * `usedPreset` 只有本地引擎用得上：它决定要不要走 persona.presetReplies
 * （诱饵预设的专属回应）。远程通道由模型自己接话。
 *
 * @param {{persona:object, duel:object, userText:string, usedPreset?:boolean}} ctx
 * @returns {Promise<{reply:string, hitType:string, softspot:object|null, quip:string, source:string, fallback?:string}>}
 */
export async function generateTurn({ persona, duel, userText, usedPreset = false }) {
  const config = resolveConfig();
  if (config.provider !== 'local') {
    const ctx = { persona, duel, userText, usedPreset };
    try {
      const turn =
        config.provider === 'anthropic'
          ? await anthropicTurn(config, ctx)
          : await openAiTurn(config, ctx);
      if (turn.reply) return turn;
      // 模型回了个空字符串，JSON 解析没抛错但没法用
      console.warn('[杠精陪练房] 真实 AI 返回了空台词，已降级到本地引擎');
      return { ...localTurn(ctx), fallback: '模型返回了空台词' };
    } catch (err) {
      // 完整错误留给控制台，界面只显示翻译过的一句话。
      // 带上渠道和模型名 —— 排查时第一句要问的就是「哪条路、哪个模型」。
      console.warn(
        `[杠精陪练房] 真实 AI 调用失败（${config.provider} / ${config.model || '默认模型'}），已降级到本地引擎：`,
        err,
      );
      return { ...localTurn(ctx), fallback: describeError(err) };
    }
  }
  await sleep(350 + Math.random() * 450);
  return localTurn({ persona, duel, userText, usedPreset });
}

/**
 * 设置界面上的「测试连接」：发一个最小请求，把结果翻译成人话。
 * 不抛异常，永远返回 { ok, message, ms }。
 *
 * @param {{provider:string, apiKey:string, model:string, baseUrl:string}} config
 */
export async function testConnection(config) {
  if (!config?.apiKey) return { ok: false, message: '还没填 API Key' };
  if (config.provider === 'openai' && !config.model) {
    return { ok: false, message: '还没填模型名' };
  }

  const started = Date.now();
  const ms = () => Date.now() - started;
  const ping = '只回复一个字：好';

  // 空内容也算没连上 —— 否则推理型模型（思考吃掉全部额度）会被报成「连上了」
  const verdict = (text) =>
    String(text || '').trim()
      ? { ok: true, message: `连上了，模型回了「${String(text).trim().slice(0, 12)}」`, ms: ms() }
      : {
          ok: false,
          message: '连上了，但模型返回空内容 —— 多半是推理型模型把输出额度花在思考上了，换个对话模型',
          ms: ms(),
        };

  try {
    if (config.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        dangerouslyAllowBrowser: true,
        maxRetries: 0,
      });
      const response = await client.messages.create({
        model: config.model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 64,
        messages: [{ role: 'user', content: ping }],
      });
      return verdict(response.content.find((b) => b.type === 'text')?.text);
    }

    const response = await postChat(config, {
      model: config.model,
      max_tokens: 64,
      messages: [{ role: 'user', content: ping }],
    });
    if (!response.ok) return { ok: false, message: await describeHttpError(response), ms: ms() };

    const data = await response.json();
    return verdict(data?.choices?.[0]?.message?.content);
  } catch (err) {
    return { ok: false, message: describeError(err), ms: ms() };
  }
}
