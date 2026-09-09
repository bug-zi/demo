/**
 * 对线「大脑」适配层。
 *
 * 两条路：
 *   1. 本地引擎（默认）——没有 API key 时用，模板 + 关键词判定，永远跑得通。
 *   2. 真实 Claude——配了 .env.local 就走这条路，模型自由发挥台词。
 *
 * 无论走哪条路，返回的都是同一个结构：
 *   { reply, hitType, quip, source }
 * 上层（main.js / duel-engine.js）不关心是谁生成的。
 *
 * 配置（放在 .env.local，已被 .gitignore 覆盖）：
 *   VITE_LLM_API_KEY=sk-ant-...
 *   VITE_LLM_MODEL=claude-opus-5          # 可选，默认 claude-opus-5
 *   VITE_LLM_BASE_URL=https://...         # 可选，走代理时填
 *   VITE_LLM_THINKING=adaptive            # 可选，默认 disabled（对局要快）
 *
 * 注意：key 会被打进前端产物，只适合本地演示 / 内网 demo。
 * 要正式上线得换成一个后端代理。
 */

import {
  GENERIC_REPLIES,
  HIT_QUIPS,
  SELF_DESTRUCT_REACTIONS,
  pick,
} from '../data/fallbacks.js';
import { localHitType, matchSoftspot, stageOf } from './duel-engine.js';

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const API_KEY = String(ENV.VITE_LLM_API_KEY || '').trim();
const BASE_URL = String(ENV.VITE_LLM_BASE_URL || '').trim();
const MODEL = String(ENV.VITE_LLM_MODEL || 'claude-opus-5').trim();
// 对局里每回合只有 30 秒，默认关掉思考换速度；想要更强的台词质量改成 adaptive
const THINKING = String(ENV.VITE_LLM_THINKING || 'disabled').trim();

export function isRemote() {
  return Boolean(API_KEY);
}

export function engineLabel() {
  return isRemote() ? `真实 AI · ${MODEL}` : '本地引擎';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 本地引擎                                                            */
/* ------------------------------------------------------------------ */

function localTurn({ persona, duel, userText }) {
  const stage = stageOf(duel.anger);
  const hitType = localHitType(persona, userText);
  const spot = hitType === 'softspot' ? matchSoftspot(persona, userText) : null;

  let reply;
  if (hitType === 'self_destruct') {
    reply = pick(SELF_DESTRUCT_REACTIONS);
  } else if (spot) {
    // 软肋台词优先；万一人设没写这条，退回当前阶段的台词
    reply = pick(persona.softspotReactions[spot.key] || persona.stages[stage.id]);
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
/* 真实 Claude                                                         */
/* ------------------------------------------------------------------ */

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '这个角色说出口的一句话，不超过 80 个字' },
    hitType: {
      type: 'string',
      enum: ['softspot', 'hit', 'miss', 'self_destruct'],
      description: '玩家这句话对这个角色的效果',
    },
  },
  required: ['reply', 'hitType'],
  additionalProperties: false,
};

function buildSystemPrompt(persona, duel) {
  const stage = stageOf(duel.anger);
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
    `怒气值：${duel.anger}/100`,
    `情绪阶段：${stage.label}（0-35 礼貌，35-65 阴阳怪气，65-85 开始上头，85-100 已经破防）`,
    ``,
    `# 规则`,
    `1. 只说一句话，不超过 80 个字。不要动作描写，不要加引号，不要旁白。`,
    `2. 语气必须匹配当前情绪阶段。怒气越高越失控。`,
    `3. 绝对禁止脏话、侮辱性词汇、地域/性别/职业歧视。破防的表现是沉默、敷衍、想退出、拉黑，而不是骂人。`,
    `4. 判断玩家这句话对你的效果，选一个 hitType：`,
    `   - softspot：玩家戳中了上面列的软肋，你被噎住了`,
    `   - hit：说得有道理，你有点难接`,
    `   - miss：没什么力度，你可以轻松怼回去`,
    `   - self_destruct：玩家自己上头了（骂人、人身攻击、语无伦次），你反而占了上风`,
    `5. 不要跳出角色。不要解释规则。不要提到自己是 AI。`,
  ].join('\n');
}

function buildMessages(duel, userText) {
  const history = [];
  // 只带最近 6 回合，控制 token 也避免模型被早期的自己带跑偏
  for (const r of duel.rounds.slice(-6)) {
    history.push({ role: 'user', content: r.userText });
    history.push({ role: 'assistant', content: r.aiReply });
  }
  history.push({ role: 'user', content: userText });
  return history;
}

async function remoteTurn({ persona, duel, userText }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  const client = new Anthropic({
    apiKey: API_KEY,
    ...(BASE_URL ? { baseURL: BASE_URL } : {}),
    // 前端直连官方 API 必须开这个开关。仅用于 demo，key 会暴露给浏览器。
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
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

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('模型没有返回文本');

  const parsed = JSON.parse(textBlock.text);
  const hitType = ['softspot', 'hit', 'miss', 'self_destruct'].includes(parsed.hitType)
    ? parsed.hitType
    : 'miss';

  return {
    reply: String(parsed.reply || '').slice(0, 120),
    hitType,
    softspot: hitType === 'softspot' ? matchSoftspot(persona, userText) : null,
    quip: HIT_QUIPS[hitType],
    source: 'remote',
  };
}

/* ------------------------------------------------------------------ */

/**
 * 生成对手的回应。远程失败一律静默降级到本地，玩家不会看到报错。
 *
 * @returns {Promise<{reply:string, hitType:string, softspot:object|null, quip:string, source:string}>}
 */
export async function generateTurn({ persona, duel, userText }) {
  if (isRemote()) {
    try {
      const turn = await remoteTurn({ persona, duel, userText });
      if (turn.reply) return turn;
    } catch (err) {
      console.warn('[杠精陪练房] 真实 AI 调用失败，已降级到本地引擎：', err?.message || err);
    }
  }
  await sleep(350 + Math.random() * 450);
  return localTurn({ persona, duel, userText });
}
