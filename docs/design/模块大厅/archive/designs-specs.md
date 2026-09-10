# 模块大厅 · 实现规格（designs-specs）

> 状态：已落地（260911 01:00，smoke/dom-check/build 全绿；spec 随即归档至 `archive/`）。实施唯一依据；验收清单见文末。

## 1. 状态机改造（src/main.js）

- `state.screen` 扩为 `lobby | select | duel | report`，**初始值 `lobby`**。
- `state.duel` 生命周期不变，但新增规则：**导航离开不清局**。清局只发生在 `goSelect()`（进选人=弃当前局）。
- 新增导航函数 `goLobby()`：置 `screen='lobby'` 并 `render()`（`render()` 内已有的 `stopTimer()` 即实现对局暂停）。
- 大厅主卡点击 `enterDuelModule()`：
  - `state.duel && !state.duel.result` → `screen='duel'`（续局）
  - 否则 → `screen='select'`，并 `state.duel=null`（弃旧局）
- 报告屏「换个对手」仍走 `goSelect()`；报告屏新增「返回大厅」按钮（走 `goLobby()`，不清局——报告上的「再来一局」仍可用）。

## 2. 对线中断与恢复

- **恢复视图**：`viewDuel()` 本就从 `duel.rounds` 重建全部气泡，无需新增数据；续局时倒计时**续用剩余秒数**：
  - `state.secondsLeft` 满值（`ROUND_SECONDS`）或为 0 → `startTimer()`（新开局/超时后新回合）
  - 否则 → `paintTimer()` + `resumeTimer()`（暂停续走，不偷偷回满）
- **AI 回复中离开**：`submitTurn()` 在 `recordTurn()`（纯记账，必须执行）之后加守卫——若 `state.screen !== 'duel'`：只记账与置 `state.duel.result`（若有胜负），跳过一切 UI 追加与音效，`state.busy=false` 后返回。
- 对线屏头部加「大厅」文字按钮（ghost 样式），随时可点，含 AI 打字期间。

## 3. 大厅视图（新增 `viewLobby()`）

- 结构：`section.lobby` > 头部（标题+副标）+ `div.lobby-grid`（三张 `.module-card`）+ 底部注脚。
- 文案（保持游戏口吻，不出现「话术健身房」平台叙事——纪律：愿景只进文档不进 demo）：
  - 标题：「今天想跟谁练练？」副标：「三间房都已亮灯，先从最热闹那间开始。」
  - 主卡「杠精陪练房」：描述「选一个对手，把 TA 说到破防」；对局进行中时右上角角标「对局进行中 · 第 N 轮」（N=`currentRound(duel)`）。
  - 锁定卡「话术资料库」「好友擂台」：描述 + 角标「即将开放」，`disabled` 不可点。
- 未配置远程 AI 时大厅也显示 `connectHint()`（从选人屏复制同款逻辑，入口不削减）。

## 4. 样式（src/styles.css，四态令牌自适应）

- 新增 `.lobby`（复用 select 屏的版式节奏）、`.lobby-grid`、`.module-card`（主卡 `.primary` 占满首行、锁定卡 `.locked` 半透明 + `cursor:not-allowed`）、`.module-badge`（角标）。
- 颜色只用既有令牌（--surface/--surface-deep/--text/--muted/--accent 系），两套皮肤四态不写死任何色值。

## 5. 回归脚本

- `scripts/dom-check.mjs` 重排前置流程并新增第 8 节「大厅」断言（初始大厅/锁定卡/主卡进选人/中断恢复/角标/报告返大厅），详见验收清单。
- `scripts/smoke.mjs` 不动（引擎未改）。

## 验收清单

- [x] 初始屏为大厅：三张模块卡，主卡可点，两张锁定卡 disabled 且无跳转
- [x] 主卡 → 选人屏（3 人设卡）；选人屏有「返回大厅」；返回后再进主卡，旧局已清（角标不出现）
- [x] 对线中途点「大厅」→ 大厅主卡出现「对局进行中 · 第 N 轮」角标；再点主卡回到对线，气泡/怒气/轮次全在，倒计时续剩余秒数
- [x] AI 打字期间点「大厅」离开：无报错；回来后该回合已记账（气泡补全）
- [x] 对局出结果瞬间人不在对线屏：不跳报告；大厅主卡恢复普通态（已结束局，再点进选人）
- [x] 报告屏「返回大厅」不清局，「再来一局」从报告仍可开新局
- [x] 大厅在四态（两皮肤×深浅）下无写死色、无破版（走令牌）——dev 浏览器四态采样 cardBg 与 --surface 逐一吻合（过渡动画冻结属渲染节流采样假象，非产品缺陷）
- [x] `npm run dom-check` 全绿（重排为 12 节，含大厅 9 项断言）；`npm run smoke` 全绿；`npm run build` 通过
- [x] 文档同步：CLAUDE.md（状态机描述）、project/00-总览.md（三屏→四屏）、新功能.md 条目归档
