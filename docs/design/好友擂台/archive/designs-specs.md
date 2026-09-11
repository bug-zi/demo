# 好友擂台 · 实现规格

> 状态：已落地（260911；arena-check / smoke / dom-check / library-check / build 全绿，四态令牌采样 + 真浏览器全流程冒烟 + 390px 检查通过；spec 随即归档至 `archive/`，落地记录见文末 §11）。

## 1. 文件清单与模块定位

| 层 | 文件 | 新/改 |
|---|---|---|
| 数据 | `src/data/scenarios.js` | 新——8 张高压场景卡 |
| 引擎 | `src/lib/arena.js` | 新——hot-seat 记分引擎（纯函数，无 DOM、无 llm import） |
| 评分适配 | `src/lib/llm.js` | 改——加 `judgeArenaRound` / `arenaRecap` 双路；顺带抽公共请求核 + 修 `ctx` bug |
| 视图 | `src/ui/arena.js` | 新——`createArenaView`，同 `settings-dialog.js`/`library.js` 的自包含定位 |
| 样式 | `src/ui/arena.css` | 新——纯令牌，index.html `<link>` 加载 |
| 检查 | `scripts/arena-check.mjs` | 新——四节：数据 / 引擎 / 评分适配 / 视图 |
| 接线 | `src/main.js`、`index.html`、`package.json`、`scripts/dom-check.mjs` | 改 |

规则进 `arena.js`、话术内容进 `scenarios.js`、模型集成进 `llm.js`、DOM 编排进视图（模块内）——与仓库数据分层纪律一致。

## 2. 数据层 `src/data/scenarios.js`

```js
export const GENERIC_TRAPS = ['滚', '废物', '傻', '屁', '白痴', '脑残'];
export const SCENARIOS = [ { id, title, setup, line, hint, keywords, traps }, ... ];
```

- **8 张卡**（idea 最低线 ≥5，留人工删改余量），id 用英文 slug（`dinner-salary` / `client-midnight` / `boss-promise` / `market-bargain` / `dorm-1am` / `advisor-push` / `comment-war` / `courier-lost`）。
- 字段：`title` 场景名（短）；`setup` 情境铺垫一句话；`line` 对方压过来的原话（玩家要回应的对象，UI 大字展示）；`hint` 评分口径（只进 AI prompt，**UI 永不展示**——漏了就等于送分题）；`keywords` 本地粗评加分线索（4-5 个短语）；`traps` 场景雷词（2-4 个），与 `GENERIC_TRAPS` 合并参与扣分。
- 内容与 app 宇宙对齐（亲戚饭桌 / 甲方 / 画饼 / 砍价 / 宿舍 / 导师 / 网友杠精 / 快递），文风红线同 personas：毒舌可以有，脏话与歧视词零容忍。
- 数据校验（arena-check 第 1 节强制）：id 唯一、五文本字段非空、keywords/traps 为非空字符串数组且 keywords ≥3 条、总数 ≥5。

## 3. 引擎层 `src/lib/arena.js`

常量：`ARENA_ROUNDS = 3`、`ARENA_ANSWER_SECONDS = 60`、`ARENA_MAX_CHARS = 120`（答题输入 maxlength）。

```js
createArena({ scenarios, names, roundCount = ARENA_ROUNDS, rand = Math.random })
// → { names:{p1,p2}, roundCount, scenarioIds:[...], answers:{p1:[],p2:[]}, scores:[] }
```

- `drawScenarios(scenarios, count, rand)`：Fisher-Yates 部分洗牌抽 `roundCount` 张不重复卡；rand 可注入（测试确定性）。
- **先答权轮换**：第 r 轮（0 起）先答者 = `r % 2 === 0 ? 'p1' : 'p2'`——连续后答不吃亏，hot-seat 公平性靠它。
- `recordAnswer(arena, player, text)`：trim 后追加（空串照记 = 弃权），返回 arena。
- `recordScores(arena, verdict)`：verdict 形如 `{ p1:{score,comment,source,fallback?}, p2:{…} }`，按 `scores.length` 落第几轮，存 `{ round, scenarioId, p1, p2 }`。
- `arenaTotals(arena)` → `{ p1, p2 }`；`arenaResult(arena)`：未满 `roundCount` 轮返回 `null`，满了按总分判 `{ winner: 'p1'|'p2'|'draw', totals }`（**胜者判定唯一正本在这里，AI 说了不算**）。
- `localScore(scenario, text)`（本地粗评，确定性，无随机）：

```
t = trim(text)；t 为空 → score 0，comment「粗评：没作答，这轮白给。」
base 4；+2/每命中 keyword（去重，封顶 +6）；−3/每命中 trap（场景雷词 ∪ GENERIC_TRAPS，封顶 −9）；
len ≥ 12 再 +1；len < 4 时 score 封顶 2；最终 clamp 0..10 取整。
comment（优先级：trap > keyword > 平稳）：
  trap 命中 →「粗评：上头了（首个 trap 词），评委扣分。」
  keyword 命中 →「粗评：碰到「首个 keyword」，方向对。」
  否则 →「粗评：四平八稳，没踩到分点。」
返回 { score, comment, hits, traps }
```

- `localRecap(arena)`：`{ summary, p1Comment, p2Comment, golden, winner, source:'local' }`——winner 取 `arenaResult()`；golden = 全场单轮最高分的那句（同分取更早轮，全 0 → null），`{ player, quote, why:'全场最高分的一句。' }`；summary / pNComment 用模板（胜者 / 平局两套），文案自带「本地粗评」字样。

## 4. 评分适配 `src/lib/llm.js`

### 4.1 顺手修（先行独立红绿）

`anthropicTurn(config, { persona, duel, userText })` 解构了参数却引用 `ctx.userSticker`（src/lib/llm.js:261）——Anthropic 路径一调用即 ReferenceError，被 generateTurn 吞成本地降级；smoke 只测 OpenAI 通道所以一直绿着。**修法**：签名补解构 `userSticker` 并透传 `buildMessages(duel, userText, userSticker)`。**验证**：smoke 第 5 节尾加一组——假 localStorage 配 anthropic + 假 fetch 回 Anthropic messages 形状（`{ content:[{type:'text',text:'{"reply":…}'}], stop_reason:'end_turn' }`），断言 `source === 'remote'`（SDK 走全局 fetch，可截获）。

### 4.2 公共请求核抽取（行为零变化，smoke 5 节为回归闸门）

- `anthropicJson(config, { system, messages, schema, maxTokens })` → 解析后的 JSON 对象。装下客户端创建 / `output_config.format.json_schema` / thinking / stop_reason 检查 / `extractJson`；`anthropicTurn` 改调它。
- `openAiJson(config, { system, messages, reminder, temperature = 0.9 })` → 解析后的 JSON 对象。装下 response_format 重试（`jsonModeUnsupported` 记忆）+ 非 JSON 提醒重试 + `describeHttpError` / `emptyContentReason`；`openAiTurn` 改调它。
- 两函数仅供本文件使用（不导出）。`openAiTurn` 对外语义（toTurn 结果）与现状逐字节等价。

### 4.3 新增导出：`judgeArenaRound` / `arenaRecap`

```js
judgeArenaRound({ scenario, names, answers })
// → { p1:{score,comment}, p2:{score,comment}, source:'remote'|'local', fallback?:string }
arenaRecap({ arena, scenarios })
// → { summary, p1Comment, p2Comment, golden:{player,quote,why}|null, winner, source, fallback? }
```

- **远程双路**：provider anthropic → `anthropicJson`（schema 见下）；openai → `openAiJson`（reminder 传 JSON 样例）。失败 / 空结果 → 本地兜底 + `fallback` 人话原因（`describeError`），与 `generateTurn` 同构。
- **逐轮评分 schema**（`ARENA_ROUND_SCHEMA`）：

```js
{ type:'object', properties:{ p1:{type:'object',properties:{score:{type:'number'},comment:{type:'string'}},required:['score','comment'],additionalProperties:false}, p2:{…同} }, required:['p1','p2'], additionalProperties:false }
```

system prompt 要点：嘴强王者的擂台评委身份；0-10 打分口径（0-2 破防失态 / 3-4 没接住 / 5-6 平稳 / 7-8 有理有据有梗 / 9-10 一击必杀）；comment ≤30 字毒舌但公道、对象是话术不是人；两边独立可同分；只输出 JSON。user message：场景 title/setup/line/hint + 双方名字与作答（空答写「（弃权）」）。
- **终盘复盘 schema**（`ARENA_RECAP_SCHEMA`）：`{ summary(≤80字总评), p1Comment, p2Comment(≤40字), golden:{player:'p1'|'p2', quote(原句摘录), why(≤30字)}, winner:'p1'|'p2'|'draw' }`。user message 带逐轮场景缩略 + 双方作答与得分 + 总分。
- **收敛**：`toRoundVerdict`——任一侧 score 非有限数或越界即整笔判废（抛错走降级），合法则 `clamp(round(score),0,10)`，comment slice 60；`toRecapVerdict`——winner 非 p1/p2/draw → 'draw'；golden.player 非法或 quote 空 → null；文本字段 slice。**展示层胜者永远用 `arenaResult()`，recap.winner 只作 AI 观点参考**。
- 本地路径：`localScore` / `localRecap` 自 `arena.js` import（方向单向：arena.js 不 import llm.js，无环）；假延迟 `sleep(200 + rand*250)`（比赛局节奏，比对线的 350-800 短）。
- 配置读取同现状：`resolveConfig()` 每次现读，settings-dialog 改完立刻生效。

## 5. 视图层 `src/ui/arena.js`

```js
createArenaView({ onBack, openSettings }) → { root, dispose }
```

- 相位机（闭包状态，整相位重绘 `root.replaceChildren`——相位内无局部输入重绘需求）：`intro → scene(先答) → handoff → scene(后答) → judging → reveal →（下一轮循环 |）recap`。
- **intro**：规则三行（3 轮 / 每答限时 60 秒 / 答完交接防偷看 / AI 逐轮打分终盘复盘）+ 双名字输入（maxlength 10，默认 玩家一/玩家二，空则回落默认）+「开始对战」。
- **scene**：第 r/3 轮标签 +「正在作答：{name}」+ 场景卡（title/setup/`line` 大字引用；**hint/keywords/traps 一律不渲染**）+ 60 秒倒计时（`.arena-timer`，≤10 加 `.urgent`）+ textarea（maxlength `ARENA_MAX_CHARS`）+「就这么回」。提交空文本只聚焦不推进；**倒计时归零自动交卷**（有字交字，没字记弃权）。计时器 interval 存视图闭包，进 handoff 即清。
- **handoff**：大字「请把设备交给 {另一位}」+「答案已封存，别偷看」+「我坐好了，开始」按钮。此相位 DOM 里**不得出现任何已提交答案文本**（整相位重绘天然保证，arena-check 断言之）。
- **judging**：「AI 评委正在打分…」+ 三点思考动效（CSS）。期间 `judgeArenaRound` 在途；`dispose()` 后回调一律 no-op（disposed 旗标）。
- **reveal**：本轮双方答案卡并排（`.reveal-cards`，各自名字/原文/大号分数/短评；分高侧 `.lead`；同分都无）+ 本轮领先提示 +「下一轮」/末轮「看终盘复盘」。`fallback` 存在时补一行本地兜底说明（复用 styles.css `.fallback-line`）。
- **recap**：胜者大标题（`arenaResult()` 判：`{name} 胜出` / `打平 · 菜鸡互啄`）+ 总分大字 + 逐轮小表 + 金句卡（golden quote/why/主人；null 则不渲染）+ 双方终评 + `source==='local'` 时的「未接入 AI，本轮为本地粗评」提示行 +「接入你的 AI →」小按钮（调 `openSettings` 回调）。按钮：「再来一局」（重开整场）「返回大厅」。
- **离场即弃局**：`← 大厅` 随时可走；`dispose()` 清 interval、置 disposed。中途离开再进 = 全新一场。
- 渲染铁律：全部经 `h()` textContent，无 innerHTML。音频仅 `blip('send')`（提交）与 `blip('reply')`（reveal）两处，默认静音即 no-op。

## 6. 样式 `src/ui/arena.css`

- index.html `<link rel="stylesheet" href="/src/ui/arena.css">`（同 library.css 先例；裸 Node 检查脚本零 CSS import）。
- 新类清单：`.arena / .arena-head / .arena-intro / .arena-rules / .arena-players / .arena-name-input / .arena-round / .arena-round-meta / .arena-timer(.urgent) / .scenario-card / .scenario-title / .scenario-setup / .scenario-line / .answer-pane / .arena-input / .arena-send / .arena-handoff / .handoff-lead / .arena-judging / .thinking / .arena-reveal / .reveal-cards / .reveal-card(.lead) / .reveal-score / .reveal-comment / .arena-recap / .recap-winner / .recap-totals / .recap-rounds / .golden-card / .recap-comments / .arena-actions / .arena-hint`。不覆写任何既有类；`.back-btn` / `.btn` / `.footnote` / `.hero-title` / `.hero-sub` / `.fallback-line` 直接复用 styles.css。
- 纯令牌（`--surface / --surface-deep / --text / --muted / --accent / --accent-soft / --on-accent / --line / --radius / --shadow`），四态自适应零写死色；`.reveal-card.lead` 用 `--accent-soft` 底 + `--accent` 边区分领先侧。≤560px reveal 双卡纵排。
- 零新图标资产。

## 7. 大厅接线清单

1. `main.js`：`import { createArenaView } from './ui/arena.js'`；模块级 `let arenaView = null`；`render()` 开头加 `disposeArena()`、分支加 `else if (state.screen === 'arena') screenEl.append((arenaView = createArenaView({ onBack: goLobby, openSettings: openSettingsDialog })).root)`；`viewLobby()` 把 `lockedCard('好友擂台', …)` 换成真卡（class `module-card arena`，desc「同一块屏幕，两个人，AI 当裁判。」保留）+ `enterArena()`（设 screen + render）。
2. **大厅脚注更新**：三模块全解锁后「后面的房间正在装修…」失真，改为不指涉未开放房间的收束文案（如「三间房都开了，先把嘴练明白。」）；`connectHint` 保留。
3. `index.html` 加 arena.css `<link>`。
4. `scripts/dom-check.mjs` 新增第 17 节：大厅 3 张真卡 / 0 锁定卡 → 擂台卡进入 intro → 改名开局 → 第 1 轮（场景卡 + 名字 + 60s 标签在 / hint 不在 DOM）→ P1 答题提交 → 交接屏（P1 答案不在 DOM）→ P2 答题 → 评分揭晓（双侧 0-10 分数与短评在 / 「下一轮」在）→ 打满 3 轮 → 终盘（胜者标题与逐轮表在、金句区在）→「再来一局」回 intro → 返回大厅。
5. `package.json` scripts 加 `"arena-check": "node scripts/arena-check.mjs"`。

## 8. 检查脚本 `scripts/arena-check.mjs`

jsdom 搭法照抄 `dom-check.mjs:6-14`（不 import main.js）。四节：

1. **数据**：SCENARIOS ≥5（恰 8）、id 唯一、字段 schema 逐条、keywords ≥3、GENERIC_TRAPS 非空数组。
2. **引擎**：注入 rand 的 `drawScenarios` 不重复、`createArena` 场景数 = roundCount；`recordAnswer` trim 与弃权空串；`arenaTotals/arenaResult`（未满轮 null / 胜负 / 平局）；`localScore` 全带（空答 0 / 短句封顶 2 / keyword 加分封顶 / trap 扣分 / 长句 +1 / clamp 10）；`localRecap` 字段与 winner 一致性、金句取全场最高、全 0 时 golden null。
3. **评分适配**（假 localStorage + 假 fetch，照 smoke 5 节手法，openai 通道）：`judgeArenaRound` 远程解析（含 score 越界 clamp / comment 截断 / 非法 score 整笔降级 local+fallback）、fetch 抛错降级带原因；`arenaRecap` 远程解析（golden 非法置 null / winner 收敛）与降级。测完删 `global.fetch`。
4. **视图**（jsdom + 真模块链）：intro 默认名与自定义名生效；开局第 1 轮 P1 先答、场景卡渲染且 **hint/keywords 不在 DOM**、timer 标签 `60s`；P1 提交 → handoff（P1 答案文本不在 DOM、出现对方名字）→ P2 提交 → reveal（双分数 0-10 + 双短评 + 领先类）→ 第 2 轮 **P2 先答**；本地评分（无 key）下 reveal 带 fallback 提示行；打满 3 轮进 recap（胜者标题 = 引擎判定、逐轮表 3 行、再来一局回 intro、`onBack` 触发）；`dispose()` 后 judging 在途回调不抛（提前 dispose 再等一拍）；全树无 innerHTML 赋值。

## 9. 不动清单

- `duel-engine.js` / `personas.js` / `stickers.js` / `titles.js` / `fallbacks.js` 零改动；`llm.js` 的 `generateTurn` / `testConnection` 对外语义不变（smoke 5 节全组断言即回归闸门）。
- 存储零新增：擂台不落 localStorage（离场即弃局）。
- 选人屏情商房锁定占位不动；「即将开放」语义只剩它一处。
- `gang-ai:*` 键族零触碰。

## 10. 验收清单

- [x] scenarios.js 8 张卡 schema 全过（arena-check 第 1 节）
- [x] 引擎：抽卡/记分/判胜/本地粗评确定性全过（第 2 节）
- [x] 评分适配：远程双 provider 解析 + 降级链路全过；anthropicTurn ctx 修复有 smoke 断言（第 3 节 + smoke 6.12）
- [x] 视图：全相位流 + 交接屏隐私 + 先答权轮换 + dispose 契约 + 无 innerHTML（第 4 节）
- [x] 大厅：3 真卡 0 锁定、脚注更新、擂台卡可进；dom-check 第 17 节过
- [x] `npm run smoke` / `dom-check` / `library-check` / `arena-check` / `build` 全绿
- [x] arena.css 纯令牌零写死色、零新图标；四态浏览器令牌采样 + 真浏览器交互冒烟（本地评分路径）+ 390px 无横向溢出
- [x] 文档回写：spec 归档、`docs/project/好友擂台.md`、00-总览（六屏）、CLAUDE.md、README、design/README、新功能.md 归档、logs

## 11. 落地记录（260911）

1. **TDD 红→绿**：arena-check 四节先红（模块缺失）→ 数据/引擎/评分适配/视图逐节转绿；smoke 6.12 先红（`ReferenceError: ctx is not defined` 实锤 anthropicTurn 旧 bug）→ 重构修复转绿；dom-check 第 17 节先红（锁定卡仍在）→ main.js/index.html 接线转绿。红灯理由均逐一核对。
2. **偏差一（dom-check 旧断言更新）**：第 1 节「应有一张锁定卡」与第 13 节「擂台应仍是锁定卡」是擂台解锁前的旧契约，随 §7 落地更新为「3 真卡 0 锁定 / 擂台真卡可点」——契约演进，非放宽。
3. **偏差二（测试自纠三处）**：arena-check 里 GENERIC_TRAPS 身份断言（行为已由踩雷用例覆盖，删冗余）、「平稳」→「四平八稳」措辞、view2 断言误用旧 view 作用域——均为测试自身笔误，先红后修，未动实现迁就测试。
4. **anthropic 通道假 fetch 形状**：spec 预想朴素对象可截获 SDK；实测 SDK 要求真 `Response` 形状（headers.entries / text / json），6.12 改用 Node 全局 `Response` 构造。顺手修掉的 ctx bug 属贴纸轮（da3bf70）引入的既有缺陷，与本模块无因果但同文件同通道，独立红绿锁定。
5. **样式类名微调**：spec §6 的 `.arena-start-row` 落地为 `.arena-actions`（与 recap 按钮行共用）、新增 `.arena-vs` / `.round-chip` / `.answerer-chip` / `.handoff-btn` / `.handoff-note` / `.judging-line` / `.recap-round-row` / `.recap-summary` 等，纯命名层差异。
6. **并行窗口**：本模块实施期间另一窗口在落 A3 战绩图（main.js share-card import、package.json qrcode-generator、README/00-总览 已含其成果）；两边改动零语义冲突，四项检查在合并状态全绿。
7. 真浏览器验证（playwright，现存 dev server 5173）：大厅 3 真卡新脚注 → intro 改名开局 → 随机场景（组会·周日 push）→ 60s 走秒 → 甲哥关键词句 10 分（4 词封顶 +6 + 长句 1 = 11 钳 10）vs 乙姐 4 分 → lead 卡高亮 → 三轮 19:10 → 终盘胜者/逐轮表/金句卡/本地粗评提示 + 接入按钮全在位；四态令牌采样（golden-card=--accent-soft、border=--accent、tag=--accent+--on-accent、row=--surface-deep、winner=--text，2 皮肤 × 2 深浅逐一吻合）；390px 场景与揭晓零横向溢出、双卡纵排。
8. **验收后补一刀（flake 根因 = 数据层真 bug）**：连跑 arena-check 出现间歇红，根因是三张场景卡的题面自带分点词——`dorm-1am` 铺垫原文含「八点/耳机」、`client-midnight` 原话含「明早」、`advisor-push` 原话含「进展/初稿」（雷词「不想毕业」也撞题面反问）。抄题面就能白得分，违背粗评设计；视图测试随机抽中撞词卡时才触发，故表现为 flake。修法：①数据校验第 1 节新增「keyword/trap 不得出现在 title/setup/line」断言（先红实锤）②三张卡的关键词换成只有好答案才会说的说法（dorm 顺手把 setup/line 改利落、advisor 雷词换「不读了」）。修后 10/10 稳定、五项检查全绿——「随机抽卡 + 断言」型测试的间歇红必须追到数据/种子层，不能靠重跑碰运气。
