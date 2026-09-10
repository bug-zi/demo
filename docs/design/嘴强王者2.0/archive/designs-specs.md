# 嘴强王者 2.0 · 实现规格（designs-specs）

> 状态：已落地（260911 01:22，smoke/dom-check/build 全绿；spec 随即归档至 `archive/`）。实施唯一依据；验收清单见文末。
> 意图见 `design.md`；代码事实基于当前 `duel-engine.js` / `main.js` / `personas.js` / `titles.js` / `fallbacks.js` / `index.html`。

## 1. 分类登记表 `src/data/categories.js`（新文件）

```js
export const CATEGORIES = [
  { id: 'gang', name: '杠精房', mode: 'fire',       hint: '点火局 · 把 TA 说到破防' },
  { id: 'deal', name: '谈判房', mode: 'fire',       hint: '点火局 · 把 TA 说到破防' },
  { id: 'eq',   name: '情商房', mode: 'extinguish', hint: '灭火局 · 把 TA 哄到消气', locked: true },
];
export function categoryOf(persona) { /* 按 persona.category 查表；未标注兜底归杠精房（防漏标白屏） */ }
```

- 数组顺序即选人屏分组顺序；`mode` 决定引擎行为（见 §3）；`locked` 的分组渲染占位卡（见 §4）。
- hint 同时用于选人屏组头的模式说明。

## 2. 人设挂类 `src/data/personas.js`

- 每个 persona 增加字段 `category`：杠精网友、阴阳怪气亲戚 → `'gang'`；画饼老板 → `'deal'`。
- A1 两人设（砍价摊主/甲方）接入时挂 `'deal'`。**A1 与 2.0 互不阻塞**：谁先落地谁补字段。
- 情商类人设本轮不进 `personas.js`（`CATEGORIES` 中 eq 组 `locked: true` 兜住展示层）。

## 3. 灭火局引擎 `src/lib/duel-engine.js`

- 新常量：`export const EXTINGUISH_WIN_ANGER = 20;`（≤20 = 哄好；依据 STAGES 礼貌段 0–35，降到礼貌段深处才算真消气）。其余常量（MAX_ROUNDS/ROUND_SECONDS/MAX_SELF_DESTRUCTS/MAX_ANGER/ANGER_DELTA）**不动**。
- `createDuel(persona)`：新增 `mode` 字段——由 `categoryOf(persona).mode` 决定，无分类信息时 `'fire'`。初始怒气：`fire → 0`，`extinguish → MAX_ANGER`。
- `recordTurn()` 增量方向按 mode 翻转（数值表复用 ANGER_DELTA / 软肋 delta）：

  | hitType | fire | extinguish |
  |---|---|---|
  | softspot | +spot.delta | −spot.delta |
  | hit | +12 | −12 |
  | miss | 0 | 0 |
  | self_destruct | −12 | **+12（火上浇油，反弹）** |

  - 同一软肋重复命中递减（`softspotKeys` 逻辑）两模式共用；灭火局的「软肋」语义 = 对方的心结/在意点，字段结构（key/keywords/delta）复用，由未来 eq 人设数据定义。
  - 数值自洽性：eq 人设三个心结 delta 和 ≈ 90（与现有人设同标尺），找齐三个心结再补一句有效输出 = 100−90−12 → clamp 到 ≤20 命中胜线；纯 miss 永远赢不了——「不找心结就别想哄好」与点火局「不找软肋别想赢」同构。
- `judge(duel)` 按 `duel.mode` 分支：
  - 共通：`selfDestructs >= MAX_SELF_DESTRUCTS` → `'lose'`
  - fire：`anger >= MAX_ANGER` → `'win'`；`rounds >= MAX_ROUNDS` → `'draw'`（现行为不变）
  - extinguish：`anger <= EXTINGUISH_WIN_ANGER` → `'win'`；`rounds >= MAX_ROUNDS` → **`'lose'`（时间到没哄好）**——灭火局不存在 draw
  - ⚠️ 分支必须先看 mode：灭火局初始 anger=100，若沿用 fire 的 `anger >= MAX_ANGER → win` 首回合就误判。
- `STAGES`/`stageOf()` 不动：灭火局就是从「破防」往「礼貌」反向走，阶段标签天然成立，怒气条与阶段 pill 直接复用。

## 4. 选人屏分组 `src/main.js` `viewSelect()`

- 结构：`div.category-group`（组头：房名 + hint 小标）→ 组内 `div.persona-grid`（该组 personaCard），按 `CATEGORIES` 顺序渲染，替代现有单层 `PERSONAS.map(personaCard)`。
- 情商房（locked）：组头照常 + 一张锁定占位卡「即将开放」（复用大厅 `lockedCard` 的视觉语言与 disabled 语义，可提为通用函数），不隐藏整组、不做死链。
- 空分组不渲染（eq 当前靠 locked 占位，未来解锁后有人设即正常）。
- 选人屏文案改（覆盖三房语境）：
  - hero-title：`把对面说破防` → `选个对手开练`
  - hero-sub：→ `点火房把 TA 说到破防；灭火房把 TA 哄到消气。`
  - footnote 原文照留（软肋提示对两模式都成立）。
- 「← 大厅」返回、`connectHint()` 逻辑不动。

## 5. 大厅文案微调 `src/main.js` `viewLobby()`

- 主卡 module-name：`杠精陪练房` → `对线房`；desc：`选一个对手，把 TA 说到破防。` → `选个对手开练：点火破防，或灭火哄人。`
- hero-sub：`三间房都已亮灯，先从最热闹那间开始。` → `对线房三间都已亮灯，先从最热闹那间开始。`（消解「三间房」歧义：大厅三张卡是模块，对线房内三间才是分类房）
- 其余（锁定卡、角标、footnote、enterDuelModule 逻辑）不动。

## 6. 全局改名「嘴强王者 · TALK KING」

| 位置 | 现值 | 改为 |
|---|---|---|
| `index.html` `<title>` | `杠精陪练房 · GANG.AI` | `嘴强王者 · TALK KING` |
| `index.html` 顶栏品牌 | `杠精陪练房<span class="brand-en">GANG.AI</span>` | `嘴强王者<span class="brand-en">TALK KING</span>` |
| `main.js` 报告图水印（~L717） | `杠精陪练房 · GANG.AI` | `嘴强王者 · TALK KING` |
| `main.js` 下载文件名（~L765） | `杠精陪练房-${title.name}.png` | `嘴强王者-${title.name}.png` |
| `main.js`/`llm.js`/`settings.js` console 前缀 | `[杠精陪练房]` | `[嘴强王者]` |
| `llm.js` 系统 prompt（~L136） | `你在一款叫「杠精陪练房」的游戏里…` | `你在一款叫「嘴强王者」的游戏里…` |
| `main.js`/`styles.css` 头部注释 | 杠精陪练房 | 嘴强王者 |
| `package.json` | `name: gang-ai`、version、description | `name: zuiqiang-wangzhe`、`version: 2.0.0`、description 按三场景改写 |
| `README.md` | 标题/简介按 1.0 杠精叙事 | 标题 `嘴强王者 · TALK KING`，简介按三房+灭火局+2.0 重写，玩法段同步分类说明 |

**不动清单（不变量）**：

- localStorage 键 `gang-ai:theme` / `gang-ai:skin` / `gang-ai:settings:v1`（及资料库将用的 `gang-ai:notes`）**一律不改**——改键=清空玩家存量数据。
- 部署域名 gang.debugzi.com 不动（域名≠产品名）。
- 「话术健身房」不进任何 demo 文案（只活在 docs 叙事）；`创作计划书.md`、`logs/`、`draft/archive/` 等历史文档里的旧名不改。
- 验收口径：`grep -r "杠精陪练房"` 在 `src/`、`index.html`、`README.md`、`package.json` 清零。

## 7. 称号适配 `src/data/titles.js`

- `pickTitle(duel)` 先分流：`duel.mode === 'extinguish'` → EQ 表；否则走现有 TITLES 逻辑（fire 行为零变化）。
- 新增 `EQ_TITLES` 最小表（eq 人设落地后可扩，不扩不影响本轮）：

```js
[
  { id: 'eq-swift', name: '读心术大师', rank: 'SSR', desc: '四轮之内就把人哄好。你不是嘴甜，你是真的懂人。' },
  { id: 'eq-master', name: '灭火队员', rank: 'SR', desc: '稳稳把怒气降了下来，一句火上浇油的话没说。' },
  { id: 'eq-fail', name: '火上浇油', rank: 'N', desc: '越哄越炸。下次先听，再开口。' },
]
```

- EQ 判定：win 且 rounds ≤ 4 且 `softspotKeys.length >= 2` → swift；win → master；lose（自爆或超时）→ fail；无 draw 分支（见 §3）。

## 8. 判定标签与飘字 `src/data/fallbacks.js`

- `HIT_LABELS`/`HIT_QUIPS` 为点火局措辞（「扎中软肋」「扎心了」）。灭火局由 UI 按 `duel.mode` 换用一套 EQ 标签（加在 fallbacks.js）：

```js
export const EQ_HIT_LABELS = { softspot: '说到心结', hit: '有效安抚', miss: '无效输出', self_destruct: '火上浇油' };
export const EQ_HIT_QUIPS  = { softspot: '说到位了', hit: '气消一点', miss: '没接住', self_destruct: '更炸了' };
```

- 通用台词（SELF_DESTRUCT_REACTIONS/GENERIC_REPLIES）本轮不拆模式——eq 人设落地时其专属 reaction 由人设数据自带。

## 8.1 结算与报告文案按 mode 分套（src/main.js）

- `RESULT_COPY` 旁增 EQ 版：win `{ headline: 'TA 消气了', sub: '你把这场架温柔地摁灭了。' }`、lose `{ headline: '没哄好', sub: '越哄越炸，或者时间到了。' }`；无 draw 分支。
- `finish()` 系统线 EQ 版：win → `—— TA 消气了 ——` + `persona.breakdown`（软化台词）+ `对话安静了下来`；lose → `—— 这局没哄好 ——`。fire 版文案不动。
- 报告/战绩图统计标签：fire `软肋命中` / eq `心结命中`（回放行 tag 用对应 mode 的标签表）。

## 9. 回归脚本

- `scripts/smoke.mjs` 新增「灭火局」节（headless，测试内构造带 `category:'eq'` 与三个 softspots 的假人设，不进 personas.js）：
  - 初始 anger=100、mode='extinguish'；
  - softspot 命中 → 怒气下降，重复同软肋 → 递减；
  - 怒气降到 ≤20 → `judge` 返回 win；
  - 8 轮 miss 打满 → lose（无 draw）；
  - self_destruct → 怒气 +12 反弹，两次 → lose；
  - fire 人设全流程回归（既有断言不动）。
- `scripts/dom-check.mjs`：
  - 选人屏断言更新：三个分组标题（杠精房/谈判房/情商房）出现；杠精房 2 卡、谈判房 1 卡；情商房锁定占位 disabled；
  - 既有对线/报告流程用 fire 人设走，断言原样保住。
- 灭火局 UI 流程本轮不测（无 eq 人设可点），引擎层由 smoke 覆盖。

## 验收清单

- [x] 选人屏按三房分组渲染，顺序 杠精→谈判→情商；情商房显示「即将开放」锁定占位（disabled、不跳转）
- [x] 人设归组正确：网友/亲戚→杠精房，画饼老板→谈判房（A1 接入后砍价摊主/甲方自动入谈判房）
- [x] 灭火局 headless 全绿：初始 100、安抚降怒、同软肋递减、≤20 判 win、8 轮未达判 lose、自爆反弹且两次判 lose
- [x] 点火局行为零变化：smoke 既有断言、dom-check 对线流程全绿
- [x] 灭火局称号走 EQ_TITLES（win 快/稳/lose 三档）；点火局称号与判定不变
- [x] 改名清零：`src/`、`index.html`、`README.md`、`package.json` 中「杠精陪练房」「GANG.AI」不再出现（docs 历史区除外）；顶栏/标题/水印/下载文件名/prompt/console 前缀统一「嘴强王者 · TALK KING」
- [x] 不变量保住：localStorage `gang-ai:*` 键未改（存量主题/皮肤/设置 reload 后仍在）；域名未动；「话术健身房」未进 demo 文案
- [x] `package.json` version = 2.0.0；README 简介按三房+灭火局重写
- [x] `npm run smoke` / `npm run dom-check` / `npm run build` 全绿
- [x] 落地时文档回写：CLAUDE.md 总览、`docs/project/00-总览.md`（+对线规则.md 若判定居变更）、README 玩法段
