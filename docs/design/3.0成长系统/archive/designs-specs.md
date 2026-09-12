# designs-specs ｜ 3.0 成长系统（档案层 / 闯关梯 / 成就墙）

> - 已归档：260912 随 3.0 成长系统落地（M1 档案层 / M2 闯关梯 / M4 成就墙 + M6 数值 pass、全量回归、文档回写、版本号 3.0.0）；现状文档见 `../../../project/成长系统.md`

> **依据**：本目录《3.0-大版本升级总方案.md》（已立项 260912）。本文为开发唯一依据，总方案只留决策与数值正本，实现细节以本文为准。
> **范围**：轨 A 全部代码工作。分三阶段交付：M1 档案与经济 → M2 房内闯关梯 → M4 成就墙。每阶段 ≈ 一个 commit 粒度，验收全绿才进下一阶段。
> **原则**：引擎生成层（`llm.js`）零改动；`duel-engine.js` 只在 M2 加 guard/drift 两个参数；所有成长数值集中在 `ECONOMY` 常量表，调平衡不改逻辑。

---

## M1 ｜ 档案层与经济（先行，其余一切的地基）

### 1.1 新文件与职责

| 文件 | 职责 |
|---|---|
| `src/lib/profile.js` | 玩家档案唯一数据层：localStorage 读写、心池惰性结算、战斗结算、经济纯函数、成就判定入口 |
| `scripts/profile-check.mjs` | 纯函数回归（§M1.6）；package.json 增 `"profile-check": "node scripts/profile-check.mjs"` |

### 1.2 存储 schema（`gang-ai:profile:v1`）

```js
{
  v: 1,
  xp: 0, level: 1, coins: 0,
  hearts: 5,
  lastRegenAt: <epoch ms>,            // 心恢复记账起点（见 1.4）
  cleared: { gang: [], deal: [], eq: [] },   // 房 → 已通关关卡序号数组（0 起；M1 期间不写，M2 启用）
  achievements: {},                   // 成就 id → 解锁时间戳
  titlesOwned: [],                    // 称号 id（M4 启用；赛后称号入册）
  equippedTitle: null,
  demoMode: false,
  stats: {
    wins: 0, losses: 0, draws: 0,
    streak: 0, maxStreak: 0,
    lastOutcomes: [],                 // 最近 3 局 'win'|'lose'（触底反弹判定）
    softspotHitsBest: 0,              // 单局最多命中不同软肋数（直击要害）
    personaWins: {},                  // personaId → 胜场（全图鉴/收集）
    personaWinStreak: {},             // personaId → 当前连胜（血脉压制，输局清零）
    replayWins: 0,                    // 复刷再胜（温故知新）
    levelAttempts: {},                // 'roomId:levelIndex' → 完成过的局数（一鼓作气，见 3.4 注）
    stickersUsed: {},                 // sticker id → 次数（斗图达人）
    boughtHearts: 0,                  // 氪金玩家
    lateNightDuels: 0,                // 0–5 点完成的局（夜猫子）
    winsWithHeartOne: 0,              // 心=1 时获胜（背水一战）
    arenaPlays: 0, arenaWins: 0, arenaBestRound: 0, arenaRecaps: 0,
    scenesViewed: [],                 // 资料库浏览过的场景 id（博览群书）
  },
  processedDuels: [],                 // 已结算 duelId，FIFO 封顶 50（幂等防重）
}
```

坏数据防御（照 `settings.js`/`notes.js` 模式）：解析失败或 `v !== 1` → 整档 `defaultProfile()`；数值字段负数/非整数收敛为非负整数；`hearts` 收敛到 0–5；未知 achievement/title id 忽略；未知字段丢弃。

### 1.3 ECONOMY 常量表（profile.js 导出，调平衡只改这里）

```js
export const ECONOMY = {
  HEARTS_MAX: 5, HEART_START: 5,
  HEART_REGEN_MS: 30 * 60 * 1000,     // 30 分钟回 1 颗，离线累计
  HEART_PRICE: 50,
  WIN_XP_BASE: 30, WIN_XP_PER_DIFF: 10,   // 胜局经验 = 30 + 10×难度
  LOSE_XP: 15,                            // 负局/和局安慰经验；负局 0 金币
  WIN_COINS_BASE: 50, WIN_COINS_PER_DIFF: 20,  // 首通金币 = 50 + 20×难度
  REPLAY_FACTOR: 0.3,                     // 复刷 = 首通 × 0.3（向下取整）
  LEVEL_UP_COINS: 100,
  LEVEL_HEART_EVERY: 5,                   // 每升满 5 级送 1 心（封顶）
  XP_TO_NEXT: (level) => 100 + (level - 1) * 50,
  ACHIEVEMENT_COINS: { bronze: 50, silver: 100, gold: 200, king: 300 },
};
```

### 1.4 API（全部纯函数 + 显式传入/返回，内部只碰传入的 profile 对象）

```js
loadProfile(): Profile                  // 收敛坏数据
saveProfile(p): void
defaultProfile(): Profile
tickHearts(p, now = Date.now()): void   // 惰性结算自然恢复：
  // hearts < MAX：补 min(MAX-hearts, floor((now-lastRegenAt)/REGEN))，
  //   lastRegenAt += 补的心数×REGEN（保留余数进度）
  // hearts 已满：lastRegenAt = now（满血重置，避免余数瞬间到账）
  // demoMode 不影响恢复（照常回心）
heartsRegenEta(p, now): ms              // 下一颗心的剩余毫秒（UI 倒计时用）
canBattle(p): boolean                   // demoMode || hearts > 0
grantBattle(p, ev): Settlement          // ev = { duelId, outcome:'win'|'lose'|'draw',
  //   difficulty, mode, personaId, ts, stickerIds?, softspotHitKinds?,
  //   roomId = null, levelIndex = null, isReplay = false }   // M2 起传后三项
buyHeart(p): 'ok' | 'no_coins' | 'full'
equipTitle(p, titleId): void            // M4 启用，M1 先落函数
evaluateAchievements(p, ctx): Def[]     // 纯扫描，返回未解锁且条件成立的成就定义
applyAchievements(p, defs): Def[]       // 盖章 + 发奖（ctx 无关；与 evaluate 成对用）
grantArena(p, ev): Def[]                // 擂台统计入账 + 成就扫描（M4 接线）
buildCtx(): ctx                         // 收集外部计数 { favoritesCount, notesCount }
                                        // —— 从 notes.js 只读现查，不落 profile
```

**Settlement**（grantBattle 返回值，战报结算区的唯一数据源）：

```js
{ xp, coins, heartsDelta, levelUps: [newLevel...], heartFromLevelUp,
  newAchievements: Def[], firstClear: boolean, idempotent: boolean }
```

### 1.5 结算规则

- **幂等**：`duelId` 已在 `processedDuels` → 直接返回零值 Settlement（`idempotent: true`），不重复入账。结算成功后 push id，超 50 条 FIFO 淘汰。
- **win**：xp `30+10×difficulty`；金币 = 首通 `50+20×difficulty`，复刷 `floor(首通×0.3)`（M1 简化期一律按首通）；心不变。
- **lose**：xp 15；金币 0；**hearts −1**（demoMode 下不减）。
- **draw**（fire 和局）：xp 15；金币 0；心不变。
- **升级链**：xp 累加后循环 `while (xp >= XP_TO_NEXT(level))`：`xp -= need; level += 1; coins += 100; level % 5 === 0 → hearts = min(MAX, hearts+1)`。
- **stats 记账**：上表各字段按 ev 归账；`softspotHitKinds`（去重软肋 key 数组）更新 `softspotHitsBest`；`stickerIds` 累加 `stickersUsed`。
- **成就扫描时机**：grantBattle / buyHeart / grantArena 尾部各调一次 evaluate+apply；主流程拿返回的 newAchievements 画 toast。

### 1.6 M1 UI 接入点

1. **战报结算区**（`main.js` report 屏）：`finish()` 判出结果时生成/复用 `duel.settlement`（main.js 给对局附加 `duel.id`：`'d'+Date.now().toString(36)+随机`；grantBattle 在进入 report 渲染路径时调一次，Settlement 挂回 duel 对象——回大厅再回战报不重算）。结算区位于结果标题与分享按钮之间：经验条 from→to 动画（升级时中插「升级 Lv.N」横幅）、金币 `+N`、心变化（lose 红闪 −1 / demo 显示「演示模式 · 心未扣」）、成就 toast 列表。
2. **大厅名片卡**（M1 简版）：等级徽章 / 金币 / ❤N / 佩戴称号位；成就进度 `x/总数`；点击行为 M1 = toast「成就墙即将开放」，M4 接真墙。
3. **选人屏心池条**（M1 时 select 仍是自由选人，先上心条）：`❤❤❤♡♡` + 恢复倒计时（mm:ss，1s interval 刷新文本，interval 挂 refs、render 清理时清除，不泄漏）+「50 币补一颗」按钮（coins<50 或已满则禁用）+ demoMode 时整条替换为「演示模式 · 无限生命」徽章。`hearts === 0 && !demoMode` 时所有「开战」按钮禁用 + 心条旁出现引导文案（等恢复 / 补心 / 去设置开演示模式）。
4. **设置弹窗**（`settings-dialog.js`）：「对局」组新增「演示模式」分段开关（关/开），即时生效写 `profile.demoMode`，与主题/回合时长同为 instant-apply 行，不进 AI 表单、不受「清除」影响。

### 1.7 M1 验收

- `npm run profile-check` 全绿，覆盖：
  - tickHearts：离线 3 小时回满并封顶；部分余数保留（回 1 颗后 lastRegenAt 只推进 1×REGEN）；满血时重置 lastRegenAt；demoMode 照常回心
  - grantBattle：胜/负/和三档数值与 §1.5 一致；同 duelId 二次调用返回 `idempotent` 零值；升级跨两级（连升）时 levelUps 数组含两级、金币各 +100；升满 5 级送心封顶不溢出；processedDuels 封顶 50
  - buyHeart：足额/不足额/已满三态
  - 负数/NaN/超界 profile：收敛不抛错
  - evaluateAchievements：M1 已可实现先落（36 条定义 M4 补齐数据前允许表为空数组跑通管道）
- `npm run smoke / dom-check` 全绿（dom-check 增：完赛出现结算区、重复进入战报数字不变）
- 手测：心=0 锁开局三引导可用；演示模式开关即时生效且重启后保留

---

## M2 ｜ 房内闯关梯 + 引擎阻力参数

### 2.1 梯子派生（纯函数，不新增数据文件）

```js
ladderFor(roomId): Persona[]   // personas 按 category 过滤 → difficulty 升序、同星按数组序
levelIndexOf(roomId, personaId): number
isLevelUnlocked(p, roomId, i): boolean   // i===0 || cleared[roomId] 含 i-1
isCleared(p, roomId, i): boolean         // cleared[roomId] 含 i
```

- 梯子全部由 `personas.js` + profile 现算，**关卡数据不落盘**——加人设即自动长梯。
- 胜利入账：`cleared[roomId]` push 当前 levelIndex（去重）；下一关自动解锁。
- 三房进度独立；已通关关卡随时可复刷（复刷奖励按 §1.5 复刷档）。

### 2.2 引擎：guard / drift（duel-engine.js 唯一改动）

```js
// personas.js 条目可选字段（缺省 = guard 1 / drift 0，现有 5 人 M2 末按星补齐）：
guard: 0.9,   // 玩家主动输出折扣：命中/软肋/表情包类 delta 在 mode 翻转后、clamp 前 ×guard（四舍五入）
drift: 2,     // 每回合环境漂移量（正数），方向由 mode 决定
```

- **drift 时机（防「最后一击被吃」）**：`recordTurn()` 应用本回合 delta **之前**，把「新完成回合」的漂移间隔补付掉：`unpaid = duel.rounds.length - duel.driftPaidRounds`（duel 由 `createDuel` 带 `driftPaidRounds: 0` 记账），fire → `anger = max(0, anger - drift×unpaid)`，extinguish → `anger = min(100, anger + drift×unpaid)`，随后 `driftPaidRounds = duel.rounds.length`；然后照常结算本回合。判定用本回合后的值，胜局推送永不被漂移抵消。沉默/超时回合照常吃漂移（时间流逝对方自己缓过来/又上头）。
  - ⚠ 实现修正（260912）：初稿公式写的是「按既往回合数 `drift×elapsed` 每回合重付」，那是平方叠加——8 局累计 −56（d3 网友数学上不可战胜）。正确语义是每回合只付一个新间隔（8 局累计 −drift×7），本行已按此更正；smoke §5.7.2 用 elapsed=2 探针钉住该语义。
- **guard 范围**：只乘玩家主动输出（hit/softspot/sticker 的 delta）；沉默损失与自爆不吃 guard。
- `judge()`、怒气 clamp、阶段区间一律不动。
- 现有 5 人设补参（M2 数据任务）：d2 `guard 1.0 drift 0`；d3 `0.95 / 2`；d4 `0.9 / 2`；d5 `0.85 / 3`（对照表与 B 批次一致，见人设扩充 spec）。

### 2.3 对局上下文

- main.js `startDuel()` 附加：`duel.id`（M1 已有）、`duel.ladder = { roomId, levelIndex }`（引擎透明携带，不读不写）。
- `finish()` 结算传 `isReplay = isCleared(...)`（胜局入账前判定）——替代 M1 的「一律首通」简化。

### 2.4 选人屏重构（select 屏）

- 保持三房分组外壳与房间卡头（名称/模式 hint）；房内列表改为**关卡列表**：
  - `🔒 待解锁`：显示「???」+ 星数预告，不可点
  - `▶ 当前关`：人设卡全量（头像/tagline/星/挑战按钮），高亮描边
  - `✅ 已通关`：人设卡 + 「复刷」按钮（奖励 30% 提示角标）
- 心池条维持 §M1.6-3；情商房 `categories.js` 的 `locked: true` 随 B1 人设落地移除（本 spec 不动它）。
- 大厅主卡角标「对局进行中」逻辑不变。

### 2.5 M2 验收

- smoke 增：guard 乘算（含四舍五入）、drift 双方向与 0/100 封顶、漂移不吞胜局（最后一击用例）、沉默回合吃漂移、guard 不作用于自爆/沉默
- dom-check 增：锁关不可进 / 通关解锁下一关 / 复刷可进 / 心=0 禁战 / 刷新页面梯子进度保留
- 手测：三房独立爬梯全流程；断网完整可玩

---

## M4 ｜ 成就墙 + 称号

### 4.1 成就数据（`src/data/achievements.js`）

```js
{
  id: 'first_win', name: '初出茅庐', desc: '赢下第一场对线',
  tier: 'bronze',                   // bronze|silver|gold|king
  coins: 50, hearts: 0,             // v1 全部只给币，hearts 字段保留不填
  title: null,                      // 成就专属称号 id（可选，如 'jiafang-harvester'）
  hidden: false,                    // 隐藏类未解锁时 desc 显示「???」
  check: (p, ctx) => p.stats.wins >= 1,   // 纯读谓词，禁副作用
}
```

- 36 条按总方案 §5.3 清单逐条落地（六类 × 6）；条件涉及外部计数的走 `ctx`（`favoritesCount`/`notesCount` 由 `buildCtx()` 从 notes 现查）。
  - ⚠ 实现补充（260912）：①每条带 `group` 字段（六类分区，成就墙按它分节渲染），新增成就仍只加表行；②「名满天下」从「12 个称号」改为「集齐全部称号」——称号全图 = 8 赛后 + 1 成就专属共 9 枚（`titles.js` 的 `ALL_TITLES`），12 永远不可达成；③房通关类 check 经 `ladderFor()` 派梯，**梯子为空的房不算通关**（B1 前情商房两项成就天然锁定）；④「一鼓作气」读 `levelAttempts === 1 && 通关账` 组合；⑤成就判定新增依赖 5 个 stats 字段：`selfDestructWins`/`fullRoundWins`/`winsWithTitle`/`comebackWins`/`demoWins`（grantBattle 增 `ev.selfDestructs`/`ev.rounds` 入账；触底反弹在写 lastOutcomes **之前**判定）。
- 新增成就 = 追加表行，UI/引擎零改动。

### 4.2 称号

- `titles.js` 每条加稳定 `id`；赛后 `pickTitle()` 结果自动入册（去重）；成就 `title` 字段是第二来源。⚠ 实现（260912）：入册在 `settleDuel()` 里做、**位于 grantBattle 扫描之前**，称号数成就才能在同一场结算里生效；`titles.js` 另增 `ACHIEVEMENT_TITLES`（成就专属，如「甲方收割机」）+ `ALL_TITLES` 全图 + `titleById()`。
- 佩戴：`equipTitle` 单选，四处同步展示——大厅名片卡、对局 meta 行、战报结算区、分享卡 PNG（`share-card.js` 在标题卡下加称号一行；`exportDuelCard` 增可选参 `wornTitle`，由 main.js 传入）。
- 称号框皮肤作为金币装扮：**不在 M4**，列 M6 后小批次（消耗去向已由买心保底，不急）。

### 4.3 UI

- `src/ui/wall.js` + `src/ui/wall.css`（照 library/arena 模式：`createWallView({ onBack })` → `{root, dispose}`，纯四态令牌，`<link>` 加载 css）。
- 三区：名片头（等级/金币/心/称号/成就进度）→ 称号柜（已收集网格，点选佩戴）→ 成就网格（已解锁亮 + 时间；未解锁灰 + 条件文案 + 奖励；隐藏未解锁显示「???」）。
- main.js 挂 `wall` 屏；大厅名片卡点击改跳真墙。
- **toast 通道**：全局成就队列（main.js 持有），任意屏 render 时消费，右下角堆叠展示 3s 后消失（复用演出 toast 样式）；对局结算区已展示的不重复弹。⚠ 实现（260912）：对局成就**不进队列**（只进结算区），队列只收场外触发的解锁；扫描点共五处——grantBattle / buyHeart / grantArena 尾部（spec §1.5）+ **进墙时**（enterWall 扫一次，收藏/笔记/称号数这类场外条件在打开墙的瞬间结算）+ **资料库切场景时**（onSceneViewed 记账后扫）。收藏/笔记动作本身不扫描（不弹 toast），解锁落在下一次扫描点。

### 4.4 挂勾（各模块最小侵入）

| 模块 | 改动 |
|---|---|
| `library.js` | 新增可选回调参数 `onSceneViewed(sceneId)`：切场景分类时上报；main.js 收下写 `stats.scenesViewed`。旧调用方不传即无感（library-check 不破坏） |
| `arena.js`（view 层） | 终盘后调 `grantArena(p, { win, bestRound, recap })`——经 main.js 注入回调，arena 引擎/评分零改动；arena-check 补一条回调触发用例。⚠ 实现（260912）：回调名 `onArenaEnd`，在 paintRecap 时**恰好上报一次**（`ended` 标志，paintIntro 复位）；hot-seat 无主客，`win` 口径 = 分出胜负（非平局）；`bestRound` = 全场单回合最高分 |
| 对线主流程 | grantBattle 尾部扫描已覆盖全部对线/战役/收集/隐藏类成就 |

### 4.5 M4 验收

- profile-check 增：36 条 check 逐条正反例（构造达标/不达标 profile + ctx）；applyAchievements 幂等（重复扫不重复发奖）
- dom-check 增：名片卡进墙/返回、称号佩戴后四处同步、成就 toast 出现且不重复
- 手测：四类来源成就各触发一条真实链路（首胜/房通关/收藏/擂台胜）；两皮肤四态下墙无破相

---

## 交付与回归总闸

| 命令 | 阶段 | 增量 |
|---|---|---|
| `npm run profile-check` | M1 新增，M2/M4 递增 | §1.7 / §2.5 / §4.5 各节 |
| `npm run smoke` | M2 增引擎参数节 | §2.5 |
| `npm run dom-check` | M1/M2/M4 递增 | 结算区 / 梯子 / 墙 |
| `npm run library-check` | M4 后必须仍绿 | onSceneViewed 可选参数不破坏旧调用 |
| `npm run arena-check` | M4 后必须仍绿 | +1 条 grantArena 回调用例 |

- 每阶段落地当天按仓库约定追加 `docs/logs/` 条目；阶段完成后本 spec 对应节随手更正（实现与规格偏离时以代码为准回写 spec）。
- 落地归档：三阶段全落地后，本 spec 与总方案按 `design/README.md` 归档流程移 `archive/`，要点回写 `docs/project/`。
