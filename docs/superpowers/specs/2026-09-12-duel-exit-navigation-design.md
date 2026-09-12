# 对局退出导航重构 + 返回组件美化 设计文档

日期：2026-09-12
状态：已与开发者确认方案（方案一：精修共用返回组件 + 活局恢复条）

## 背景与目标

当前导航链路：大厅 → 对线房（select）→ 对局（duel），但对局屏的退出按钮直接回大厅（`← 大厅`），与进入路径不对称。目标：

1. 对局进行中退出 → 返回**对线房**；只有对线房才有「返回大厅」入口
2. 退出时活局不销毁；对线房提供「回到对局」恢复入口
3. 美化返回组件（`.back-btn` 为全模块共用类，一处升级全局生效）

已确认决策：**保留活局 + 对线房恢复条**；此时另选对手开新局为**静默替换**（沿用 `startDuel()` 现状，不加确认弹窗）。

## 现状

- 对局屏退出按钮：`src/main.js` viewDuel 内 `.back-btn.duel-exit`，文字 `← 大厅`，onclick `goLobby()`
- 对线房返回按钮：`src/main.js` viewSelect 内 `.back-btn`，文字 `← 大厅`，onclick `goLobby()`
- `.back-btn` 样式（styles.css）：透明底胶囊、`--muted` 文字、13px、无边角装饰，极简
- 活局保活机制已存在：中途离场不销毁 `state.duel`，大厅主卡「对局进行中 · 第 N 轮」角标可续局（`enterDuelModule()` 活局时直接回对局）
- 图标系统：`public/assets/icons/*.svg`（Material Symbols Outlined，viewBox `0 -960 960 960`）+ styles.css 中 `.i-*` 类用 `mask-image` 普通声明引用，`currentColor` 上色；无 `arrow_back`
- 面板类 token：`--surface` / `--surface-deep`；四态 token（data-skin × data-theme）齐全

## 详细设计

### ① 导航逻辑（src/main.js）

- 新增 `exitToSelect()`：`state.screen = 'select'; render();`——不触碰 `state.duel`、计时器、`timerPaused`，行为与现有「跨大厅往返不毁局」机制完全一致
- 对局屏退出按钮：文字 `← 大厅` → `对线房`，onclick `goLobby` → `exitToSelect`，保留 `.duel-exit`（flex-shrink:0）
- 对线房返回按钮保留 `goLobby`，位置不动
- 战报页「返回大厅」（结算后）、擂台「离场即弃局」、大厅角标续局路径，全部不变

### ② 对线房恢复条（src/main.js viewSelect + styles.css）

- 条件：`state.duel && !state.duel.result` 时，在返回按钮之下、`.select-head` 之上渲染 `.resume-strip`；无活局不渲染
- 内容：对方头像（`personaAvatarEl(persona, { small: true })`）+ 对手名 + `第 ${currentRound(state.duel)} 轮 · 进行中`（与大厅角标同口径）+「回到对局」按钮
- 「回到对局」onclick 复用 `enterDuelModule()`（活局时路由回 duel，`viewDuel()` 自动重建日志/怒气条/剩余秒数）
- 样式 `.resume-strip`：纯 token 上色（`--surface` 底 + `--line` 描边 + accent 强调），flex 排版，双皮肤双主题自动适配，不引入新颜色常量

### ③ 返回组件美化（styles.css + 各视图调用点）

- 新增 `public/assets/icons/arrow_back.svg`（Material Symbols Outlined，与现有图标同格式同 viewBox）；styles.css 增 `.i-arrow-back` mask 类（与现有 `.i-*` 同写法）
- `.back-btn` 精修：
  - 结构改为 `[icon] [label]`：inline-flex、`gap: 4px`、内边距加大（约 `6px 14px 6px 10px`）扩大点击区
  - `.back-btn .icon` 覆盖为 14px
  - hover：`--text` 文字 + `--accent-strong` 描边 + `--surface` 底色填充；active：轻按压位移；focus-visible：焦点环
  - 过渡 transition 保持顺滑，全部走现有 token
- 图标化改造所有 `.back-btn` 调用点（10 处，均为机械替换，保持各自 onclick 不变）：
  - `src/main.js` ×2（select、duel）
  - `src/ui/arena.js` ×6
  - `src/ui/library.js` ×1
  - `src/ui/wall.js` ×1
  - 写法：`h('button', {...}, h('span', { class: 'icon i-arrow-back', 'aria-hidden': 'true' }), h('span', { text: '大厅' }))`（各文件已有各自的 `h`，不新增 import 依赖）

### ④ 配套与验证

- `scripts/dom-check.mjs`：`.duel .back-btn` 点击后的落点断言由 lobby 改为 select（:240、:274、:476 三处流程），并补断言：select 出现恢复条 → 点「回到对局」回 duel 且日志重建 → select 开新局静默替换
- 其余脚本（smoke/library-check/arena-check/profile-check）断言基于选择器或 onBack 计数，不受影响；跑一遍确认
- 文档：CLAUDE.md 导航描述同步（duel 退出去向、恢复条）；`docs/logs/260912.md` 顶部追加日志
- 手工验证（dev server）：双皮肤 × 双主题下返回按钮与恢复条观感；限时局中途退到 select 再恢复，剩余秒数/暂停态正确；AI 回合进行中离场再回来的屏外续算不回归

## 非目标

- 不加「开新局前确认」弹窗（已确认静默替换）
- 不动战报页、擂台、大厅的任何导航行为
- 不引入新依赖、不加新颜色常量、不做面包屑导航
- 恢复条不显示怒气数值等对局细节（保持离场快照轻量）

## 风险与回退

- 唯一行为变化点是对局退出落点（lobby → select），dom-check 全绿即为回归护栏；恢复条是纯新增渲染分支，无活局时零影响
