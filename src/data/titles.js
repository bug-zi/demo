/** 赛后称号。判定顺序从上到下，先命中先给。 */

export const TITLES = [
  {
    id: 'swift',
    name: '人形自走破防器',
    desc: '四轮之内让对手当场闭麦。你不是来吵架的，你是来拆房的。',
    rank: 'SSR',
  },
  {
    id: 'master',
    name: '阴阳大师',
    desc: '五轮之内稳稳拿下，刀刀不致命但刀刀见血。',
    rank: 'SR',
  },
  {
    id: 'stubborn',
    name: '嘴笨但坚持',
    desc: '八轮打完，对方毫发无伤，但你也没退场。这本身就是一种胜利。',
    rank: 'R',
  },
  {
    id: 'countered',
    name: '被反杀的人',
    desc: '你还没把对方说急，自己先上头了。下次记得：吵架最重要的是别自爆。',
    rank: 'N',
  },
  {
    id: 'scripted',
    name: '弹幕型选手',
    desc: '全程照着预设话术念，一句自己的话都没说。评委表示：有点东西，但不多。',
    rank: 'R',
  },
];

/** 灭火局（情商房）称号：lose 含自爆与超时，灭火局没有平局。判定先命中先给。 */

export const EQ_TITLES = [
  {
    id: 'eq-swift',
    name: '读心术大师',
    desc: '四轮之内就把人哄好。你不是嘴甜，你是真的懂人。',
    rank: 'SSR',
  },
  {
    id: 'eq-master',
    name: '灭火队员',
    desc: '稳稳把怒气降了下来，一句火上浇油的话没说。',
    rank: 'SR',
  },
  {
    id: 'eq-fail',
    name: '火上浇油',
    desc: '越哄越炸。下次先听，再开口。',
    rank: 'N',
  },
];

/**
 * @param {object} duel 对局数据
 * @returns {object} 称号对象
 */
export function pickTitle(duel) {
  if (duel.mode === 'extinguish') {
    const byId = (id) => EQ_TITLES.find((t) => t.id === id);
    if (duel.result === 'win') {
      if (duel.rounds.length <= 4 && duel.softspotKeys.length >= 2) return byId('eq-swift');
      return byId('eq-master');
    }
    return byId('eq-fail');
  }

  const byId = (id) => TITLES.find((t) => t.id === id);

  if (duel.result === 'lose') return byId('countered');

  if (duel.result === 'win') {
    const rounds = duel.rounds.length;
    if (rounds <= 4 && duel.softspotKeys.length >= 2) return byId('swift');
    if (rounds <= 5) return byId('master');
    // 破防了但拖得久，也不算嘴笨
    return byId('master');
  }

  // 平局：八轮没破防
  // 一句自己的话都没说，全靠预设 + 沉默，那就是弹幕型选手
  if (duel.rounds.length > 0 && duel.freeTextRounds === 0) return byId('scripted');
  return byId('stubborn');
}
