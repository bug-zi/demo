// 冒烟测试：不开浏览器，直接跑引擎 + 本地大脑，验证四条路径都能走通。
// 用法：npm run smoke
import { PERSONAS } from '../src/data/personas.js';
import { createDuel, recordTurn, uniqueSoftspotHits, stageOf } from '../src/lib/duel-engine.js';
import { generateTurn, engineLabel } from '../src/lib/llm.js';
import { pickTitle } from '../src/data/titles.js';

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
