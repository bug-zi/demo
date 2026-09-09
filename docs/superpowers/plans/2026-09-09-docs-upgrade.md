# docs 文件夹升级 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `docs/draft/260909-终局形态与拓展方案库.md` 第四节实施清单——建立 logs/project/draft 三分区文档体系，撰写五篇依据代码实际现状的 project 文档，并让日志约定跨会话自动生效。

**Architecture:** 纯文档任务，不改任何源码。结构为：`docs/README.md`（导航+规范）+ `logs/`（流水日志）+ `project/`（现状文档，按功能域五篇）+ `draft/`（未定稿讨论）。自动记录的机制是约定写入 `CLAUDE.md`（每次会话必读）。

**Tech Stack:** Markdown、git。验证手段：grep 比对文档数字与源码常量、`npm run smoke` / `npm run dom-check` 回归。

**依据源码版本：** 当前 HEAD（c1264f0 之后，含 4972333 设计定稿）。本文所有事实（常量、字段名、人设数值）已逐一比对过 `src/` 源码。

---

## 背景知识（给零上下文的执行者）

- 仓库：GANG.AI 杠精陪练房，Vite 纯前端中文对话竞技 Demo，`src/main.js` 是 UI 状态机（select/duel/report 三屏），`src/lib/duel-engine.js` 是规则层，`src/data/` 是内容层。
- `docs/` 目前有 4 个文件：`docs.md`（将被吸收后删除）、`黑客松要求.md`、`杠精陪练房-创作计划书.md`（两者留在根）、`寻找合适选题.md`（迁入 draft/）。
- `docs/draft/260909-终局形态与拓展方案库.md` 已存在并提交（commit 4972333），是本计划的设计依据。
- git 状态：`docs/` 与 `CLAUDE.md` 未跟踪；仓库根有 3 个文件的未暂存删除（`寻找合适选题.md`、`杠精陪练房-创作计划书.md`、`黑客松要求.md`——它们已被移入 docs/）。Task 1 的提交会一并收录这些移动。
- 平台：Windows 11，bash shell。路径含中文，命令里引用文件名时用双引号。

---

### Task 1: 目录骨架、README、迁移既有文件

**Files:**
- Create: `docs/README.md`
- Create dir: `docs/logs/`、`docs/project/`
- Move: `docs/寻找合适选题.md` → `docs/draft/寻找合适选题.md`
- Delete: `docs/docs.md`

- [ ] **Step 1: 建目录并迁移文件**

```bash
cd "D:\Code\黑客松\260909未央黑客松"
mkdir -p docs/logs docs/project
mv "docs/寻找合适选题.md" "docs/draft/寻找合适选题.md"
```

预期：无输出，退出码 0。

- [ ] **Step 2: 写入 docs/README.md**

创建 `docs/README.md`，内容如下（完整写入，不要省略）：

```markdown
# docs · 文档中心

这里由开发者和 Claude Code 协作维护，分四个区域：

| 位置 | 放什么 | 更新时机 |
|---|---|---|
| `logs/` | 开发日志流水，按日期一文件（`YYMMDD.md`） | 每完成一轮开发任务，Claude Code 自动追加 |
| `project/` | 项目现状文档：功能域、规则、样式（记录"现在是什么"） | 代码变动后随手同步 |
| `draft/` | 未定稿的想法、方向讨论、备选方案 | 随时；定稿后转正或标注废弃 |
| 根目录 | `黑客松要求.md`（比赛外部约束）、`杠精陪练房-创作计划书.md`（立项书，内容冻结） | 不更新 |

## 开发日志约定

- 文件名 `YYMMDD.md`（如 `260909.md`），当天首次写入时创建
- 每条日志：时间精确到分钟 + 做了什么 + 动了哪些文件 + 关键决策及原因 + 怎么验证的
- 最新条目放文件**最上方**
- logs 只记流水；复盘、想法、讨论进 `draft/`

条目格式：

```text
## HH:MM ｜ 标题
- 做了什么：
- 动了哪些文件：
- 关键决策及原因：
- 怎么验证的：
```

## project/ 文档约定

- 按功能域划分（总览 / 人设系统 / 对线规则 / 报告与导出 / 视听与界面），每篇 ≤120 行
- 每篇顶部标注对应源码文件
- 只描述代码实际现状，不写计划——计划类内容进 `draft/`

## 延伸阅读

- 终局形态与拓展方案库：`draft/260909-终局形态与拓展方案库.md`
- 代码结构与命令速查：仓库根 `CLAUDE.md`
```

注意：上面嵌套的 ```text 代码块在写入时保留原样。

- [ ] **Step 3: 删除 docs.md（内容已被 README 吸收）**

```bash
rm "docs/docs.md"
```

- [ ] **Step 4: 验证结构**

```bash
ls docs/ docs/draft/ && [ -d docs/logs ] && [ -d docs/project ] && echo OK
```

预期输出包含：`README.md  draft  logs  project  黑客松要求.md  杠精陪练房-创作计划书.md`，且 draft 下有 2 个文件，最后打印 `OK`。

- [ ] **Step 5: 提交（含仓库根三个旧文件的删除记录，完成"移动"语义）**

```bash
git add docs/ "寻找合适选题.md" "杠精陪练房-创作计划书.md" "黑客松要求.md"
git commit -m "docs: 目录重构——logs/project/draft 三分区 + README 导航

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: project/00-总览.md

**Files:**
- Create: `docs/project/00-总览.md`

- [ ] **Step 1: 写入文件**

内容如下：

```markdown
# 总览

> 对应源码：整个 `src/` ｜ 面向队友与评委的项目入口

## 一句话

杠精陪练房（GANG.AI）：选一个最惹不起的人设，用预设话术或自由输入跟他线上对线——目标不是讲赢道理，是把他的怒气值怼到 100 让他当场破防，赛后领一份可下载 PNG 的《对线战力报告》。

## 技术栈

- Vite + 原生 ES Modules：无框架、无路由、无后端，`npm run build` 出纯静态站
- 可选远程 AI：`@anthropic-ai/sdk` 动态导入，配 `.env.local` 的 `VITE_LLM_API_KEY` 生效；失败静默降级本地引擎，离线可完整对局
- 回归检查：`npm run smoke`（引擎规则无头测试）、`npm run dom-check`（jsdom 驱动真实入口的 UI 流程测试）

## 三屏状态机（src/main.js）

`select`（选人）→ `duel`（对线）→ `report`（战报）

- `render()` 按 `state.screen` 清空重建视图；DOM 用本地 `h()` 帮助函数构造，所有文本走 `textContent`，绝不拼 HTML
- 对局中的怒气条、计时、日志走 `refs` 增量更新，不整屏重渲染

## 一回合的数据流

`submitTurn()`（main.js）→ `generateTurn()`（llm.js：远程 Claude 或本地模板，统一返回 `{reply, hitType, softspot, quip, source}`）→ `recordTurn()`（duel-engine.js：怒气结算、胜负判定的**唯一权威**，模型只建议 hitType）→ 增量更新日志/怒气条 → `judge()` 出结果则 `finish()` → report 屏 `pickTitle()` + `exportCard()` Canvas 导出

## 目录职责

```text
index.html            外壳：顶栏/引擎徽章/声音开关/#screen 挂载点
src/main.js           UI 状态机与渲染（三屏、计时、战报、Canvas 导出）
src/styles.css        全部样式（响应式深色聊天窗）
src/data/personas.js  人设配置层（3 个对手的身份/软肋/台词）
src/data/fallbacks.js 判定标签、飘字、兜底台词、pick()
src/data/titles.js    赛后称号规则
src/lib/duel-engine.js 规则层：怒气/阶段/判定（数值唯一权威）
src/lib/llm.js        生成适配层：本地引擎 / 远程 Claude
src/lib/audio.js      WebAudio 合成音效（默认静音）
scripts/smoke.mjs     引擎无头回归
scripts/dom-check.mjs jsdom UI 流程回归
```

## 环境与命令

`npm install` / `npm run dev`（5173 端口）/ `npm run build` / `npm run preview` / `npm run smoke` / `npm run dom-check`。远程 AI 的环境变量说明见根目录 `CLAUDE.md`「Optional remote AI configuration」。

## 平台愿景

终局形态是「话术健身房」多场景高压对话陪练平台，本游戏是第一间房。扩展铁律：改数据（`src/data/`）不改骨架（引擎/UI 不硬编码人设）。详见 `../draft/260909-终局形态与拓展方案库.md`。
```

- [ ] **Step 2: 验证内容与代码一致**

```bash
grep -c "smoke" package.json && grep -n "screen: 'select'" src/main.js
```

预期：`package.json` 里 smoke 计数 ≥1；`src/main.js:28` 附近命中 `screen: 'select'`。

- [ ] **Step 3: 提交**

```bash
git add "docs/project/00-总览.md"
git commit -m "docs(project): 总览——产品/技术栈/状态机/数据流/目录

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: project/人设系统.md

**Files:**
- Create: `docs/project/人设系统.md`

- [ ] **Step 1: 写入文件**

内容如下：

```markdown
# 人设系统

> 对应源码：`src/data/personas.js` ｜ 数值结算规则见 [对线规则.md](对线规则.md)

## 现有人设（3 个）

| id | 名字 | 头像 | 难度 | 招牌台词 | 软肋（delta） |
|---|---|---|---|---|---|
| wangyou | 杠精网友 | ⌨️ | ★3 | 「有一说一，你这话逻辑有问题」 | 不接招 28 / 截图挂他 32 / 反指出逻辑错误 30 |
| qinqi | 阴阳怪气亲戚 | 🍊 | ★2 | 「哎哟，还在北京呢？」 | 反问她孩子 32 / 塞红包提钱 28 / 请她示范 30 |
| laoban | 画饼老板 | 🍪 | ★4 | 「年轻人不要只看钱」 | 追问加班费 30 / 请他示范 34 / 追问股权 30 |

## 人设字段结构

```text
persona = {
  id, name, avatar, difficulty(1-5), tagline,        // 身份层
  intro, opener,                                      // 出场：人设简介 / 第一句话
  presets: [3 条预设话术],                             // 对线屏按钮，点一次作废一次
  softspots: [ { key, label, delta, keywords[] } ],   // 软肋层，3 个
  stages:      { polite: [3], sarcastic: [3], agitated: [3] },  // 阶段台词
  softspotReactions: { [softspotKey]: [3 条] },       // 软肋被戳中的专属反应
  breakdown:   [3 句破防演出，逐条弹出],
}
```

- `keywords` 是**子串匹配**：玩家输入（去空白后）包含任一关键词即判命中；本地引擎用它判定，远程模式下它作为示例写进提示词，模型自行判断、本地只兜底
- 回复台词的选择优先级（llm.js localTurn）：自爆反应 > 软肋专属反应 > 破防台词 > 当前阶段台词 > 通用兜底

## 软肋数值设计（为什么是 ≈90）

- 每人设 3 个软肋 delta 之和 88–94：三软肋全中 + 补一句有效输出（+12）即破百
- 光靠有效输出：8 轮 × 12 = 96 < 100——**不找软肋就赢不了**，这是玩法核心约束
- 同一软肋第二次命中 delta 减半（防按着预设连点）

## 新增人设检查单

1. 在 `PERSONAS` 追加完整字段；三软肋 delta 之和控制在 85–95
2. 三个阶段各 ≥3 条台词、每个软肋 ≥3 条专属反应、breakdown 3 句
3. keywords 覆盖玩家自然说法的变体（您/你、口语词）；不写脏话与真实群体指向
4. `npm run smoke` 通过（脚本覆盖软肋命中路径）
```

- [ ] **Step 2: 验证数值与源码一致**

```bash
grep -n "delta: 34" src/data/personas.js && grep -c "softspotReactions" src/data/personas.js
```

预期：`delta: 34` 命中 1 处（laoban/demo）；`softspotReactions` 命中 4 处（1 处定义注释/说明不计则 ≥3）。

- [ ] **Step 3: 提交**

```bash
git add "docs/project/人设系统.md"
git commit -m "docs(project): 人设系统——字段结构/软肋数值设计/新增检查单

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: project/对线规则.md

**Files:**
- Create: `docs/project/对线规则.md`

- [ ] **Step 1: 写入文件**

内容如下：

```markdown
# 对线规则

> 对应源码：`src/lib/duel-engine.js` ｜ 本文件是数值规则的文档镜像，改引擎必同步这里

## 核心常量

| 常量 | 值 | 含义 |
|---|---|---|
| MAX_ROUNDS | 8 | 一局最多 8 轮 |
| ROUND_SECONDS | 30 | 每轮倒计时，超时按沉默结算 |
| MAX_SELF_DESTRUCTS | 2 | 累计 2 次自爆判负 |
| MAX_ANGER | 100 | 怒气上限，达到即破防胜 |

## 怒气增量 ANGER_DELTA

| hitType | Δ | 本地判定条件（localHitType，先去空白） |
|---|---|---|
| softspot | 软肋自带 delta（28–34）；同一软肋第二次起 ×0.5 | 命中任一软肋 keywords（子串匹配） |
| hit | +12 | ≥8 字且含 HIT_HINTS 信号词（但是/因为/所以/请问/你刚才/凭什么…15 个），或 ≥18 字 |
| miss | 0 | 其余一切输入（包括沉默） |
| self_destruct | −12 | 命中 SELF_DESTRUCT_HINTS 骂人词表（13 个），或 `!!!`/`???` 连打 |

远程模式下 hitType 由模型判定（提示词里给了判据），本地判定仅作无 key 与降级时的兜底；**无论谁判，怒气数值一律由 `recordTurn()` 查表计算**。

## 情绪阶段 STAGES（stageOf 按怒气取最高满足 min 的阶段）

| 阶段 | 区间 | 标签 | UI 色 |
|---|---|---|---|
| polite | 0–35 | 礼貌 | #8FA88F |
| sarcastic | 35–65 | 阴阳 | #FFD24A |
| agitated | 65–85 | 上头 | #FF9A4D |
| breakdown | 85–100 | 破防 | #FF4D4D |

## 回合结算（recordTurn）

- 怒气 clamp 到 [0,100]；自爆计数 +1；`usedPreset` / `freeTextRounds` 分别累计（供称号判定）
- 每轮记录 `{round, userText, aiReply, hitType, quip, delta, angerAfter, stage, softspotKey}`
- judge() 判定顺序：自爆 ≥2 → **lose**；怒气 ≥100 → **win**（先判 lose）；满 8 轮 → **draw**

## 对局状态（createDuel）

`persona / personaId / anger / rounds[] / selfDestructs / softspotKeys[]（已命中的去重软肋）/ usedPresets / freeTextRounds / result`

## 已知问题

- `titles.js:47` 的 `pickTitle()` 读取 `duel.softspotHits`，该字段不存在（引擎实为 `softspotKeys`），SSR 称号「人形自走破防器」当前不可达。修复后请删除本节。
```

- [ ] **Step 2: 验证常量与源码一致**

```bash
grep -n "MAX_ROUNDS = 8\|ROUND_SECONDS = 30\|MAX_SELF_DESTRUCTS = 2" src/lib/duel-engine.js
```

预期：三行各命中 1 处。

- [ ] **Step 3: 提交**

```bash
git add "docs/project/对线规则.md"
git commit -m "docs(project): 对线规则——常量/增量表/阶段/结算/已知问题

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: project/报告与导出.md

**Files:**
- Create: `docs/project/报告与导出.md`

- [ ] **Step 1: 写入文件**

内容如下：

```markdown
# 报告与导出

> 对应源码：`src/main.js`（viewReport / exportCard / RESULT_COPY）、`src/data/titles.js`

## 报告屏（viewReport）结构

1. 结果徽章 + 副标题：win「他破防了/你把对方聊到闭麦」· lose「你被反杀/两次自爆」· draw「打平/八轮谁也没破防」
2. 称号卡：rank 徽章 + 称号名 + 毒舌评语
3. 六项统计：对手、回合数、软肋命中 x/3、自爆次数 x/2、最终怒气 x/100、引擎（本地引擎 / 真实 AI · 模型名）
4. 对线回放：逐轮「你：… / 对手：… / 判定标签 +Δ」
5. 操作：再来一局（同人设）/ 换个对手 / 保存战绩图

## 称号系统（titles.js，判定顺序先命中先得）

| 称号 | rank | 条件 |
|---|---|---|
| 被反杀的人 | N | lose |
| 人形自走破防器 | SSR | win 且 ≤3 轮且去重软肋命中 ≥2（⚠️ 见对线规则.md 已知问题，当前不可达） |
| 阴阳大师 | SR | 其余一切 win（含拖满轮数的胜局） |
| 弹幕型选手 | R | draw 且 freeTextRounds=0（全程预设+沉默，没说过一句自己的话） |
| 嘴笨但坚持 | R | 其余 draw |

## 战绩图导出（exportCard）

- Canvas 逻辑尺寸 720×1000，实际 ×2 绘制保清晰度，`toBlob` 下载 PNG，文件名 `杠精陪练房-{称号名}.png`
- 版面（深夜底 #12100E + 顶 8px 怒气红条）：品牌字 → 结果大字（56px）→ 对手 → 称号卡（rank 黄字 + 名称 + 折行评语）→ 4 行统计 → 底部金句「软肋这东西，人人都有一根。」+ 引擎标签
- 纯 Canvas 手绘，不依赖截屏，换屏不错位

## 拓展挂钩（方案库 A3）

报告图是唯一能离开网页的传播资产，待按「脱离网页仍能看懂」标准重做（对手、结果、金句、称号、二维码）。
```

- [ ] **Step 2: 验证与源码一致**

```bash
grep -n "720\|1000" src/main.js | head -5 && grep -n "swift\|master" src/data/titles.js
```

预期：`W = 720`、`H = 1000` 命中；titles.js 含 swift/master 两个 id。

- [ ] **Step 3: 提交**

```bash
git add "docs/project/报告与导出.md"
git commit -m "docs(project): 报告与导出——战报结构/称号规则/Canvas 版面

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: project/视听与界面.md

**Files:**
- Create: `docs/project/视听与界面.md`

- [ ] **Step 1: 写入文件**

内容如下：

```markdown
# 视听与界面

> 对应源码：`src/styles.css`（全部样式）、`index.html`（外壳）、`src/lib/audio.js`

## 外壳（index.html）

顶栏 = 品牌「杠精陪练房 GANG.AI」+ 引擎徽章（js 启动时填 `本地引擎`/`真实 AI · 模型名`）+ 声音开关（默认 🔇，aria-pressed）。`#app` 最大宽 760px 居中，`#screen` 为唯一挂载点，`aria-live="polite"`。

## 设计令牌（styles.css :root）

| 令牌 | 值 | 用途 |
|---|---|---|
| --bg | #12100E | 深夜底色 |
| --panel / --panel-2 | #1A1714 / #221E1A | 面板两级 |
| --bubble-ai / --bubble-me | #26221E / #2E3A2E | 双方气泡 |
| --anger | #FF4D4D | 怒气红（同步 breakdown 阶段色） |
| --accent | #FFD24A | 高亮黄（rank、阴阳阶段） |
| --text / --muted | #EDEDED / #8A8078 | 正文 / 次要 |
| --line / --radius / --font | #2E2924 / 14px / system-ui 中文栈 | 边线、圆角、字体 |

视觉关键词：深夜手机聊天窗 + 格斗游戏血条 + 赛后数据面板；无装饰性卡片堆叠，信息密度偏高。

## 关键组件（按屏）

**选人屏**：hero 标题「把对面说破防」+ persona-grid 卡片（头像/名字/五维星级/台词/简介），hover 抬升。

**对线屏**：
- 怒气条：fill 宽度=怒气%，背景色随阶段变（JS 注入 stage.color）；35/65/85 三处刻度线=阶段边界
- stage-pill：四阶段四色（礼貌绿/阴阳黄/上头橙/破防红）
- 气泡流：对方左（带头像）、我方右；typing 三点 blink 动画
- quip 行：判定标签 + 飘字 + Δ值，softspot/self_destruct 变色
- 预设 chips：点击后 disabled+used 置灰（一局一次）
- 计时：`30s` 文本，≤10s 加 `.urgent` 红显

**报告屏**：result-badge 三态、title-card（rank 徽章黄字）、stats 网格、replay 列表、三按钮。

## 响应式与无障碍

- `@media (max-width: 560px)`：单列移动端适配
- `@media (prefers-reduced-motion: reduce)`：关闭抖动/闪烁动画
- `@keyframes blink`：typing 指示点

## 声音（audio.js）

WebAudio 现场合成，零音频文件；默认静音，顶栏开关 opt-in。6 种配方（波形/频率/增益组合）：send(三角波620Hz)、reply(正弦420Hz)、hit(方波双音上行)、softspot(锯齿880→1180Hz)、self_destruct(低频锯齿160Hz)、breakdown(双音下行，破防专用)。禁用时 `blip()` 直接 no-op，非阻塞。
```

- [ ] **Step 2: 验证令牌与源码一致**

```bash
grep -n "anger: #ff4d4d\|accent: #ffd24a" src/styles.css
```

预期：两行各命中 1 处（css 小写色值）。

- [ ] **Step 3: 提交**

```bash
git add "docs/project/视听与界面.md"
git commit -m "docs(project): 视听与界面——外壳/设计令牌/组件/无障碍/音效

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: CLAUDE.md 日志约定 + 首条开发日志

**Files:**
- Modify: `CLAUDE.md`（文末追加一节）
- Create: `docs/logs/260909.md`

- [ ] **Step 1: CLAUDE.md 文末追加章节**

在 `CLAUDE.md` 末尾追加（保持既有行文风格）：

```markdown
## 开发日志约定

每完成一轮有产出的开发任务（约一个 commit 的工作量），必须向 `docs/logs/YYMMDD.md`（如 `docs/logs/260909.md`）追加一条日志，无需用户提醒：

- 当天文件不存在则先创建；最新条目放在文件**最上方**
- 条目格式 `## HH:MM ｜ 标题`（用当前本地时间，精确到分钟），下附四项：做了什么 / 动了哪些文件 / 关键决策及原因 / 怎么验证的
- logs 只记流水，复盘与想法写进 `docs/draft/`
- 详细规范见 `docs/README.md`
```

- [ ] **Step 2: 获取当前时间**

```bash
date +%H:%M
```

记下输出（例如 `21:47`），用于下一步的条目标题。

- [ ] **Step 3: 写入首条日志 docs/logs/260909.md**

用 Step 2 的实际时间替换下面占位的 `HH:MM` 后写入：

```markdown
# 260909 开发日志

## HH:MM ｜ docs 文档体系升级落地

- 做了什么：按设计定稿（draft/260909-终局形态与拓展方案库.md）实施 docs 重构——建立 logs/project/draft 三分区与 README 导航；《寻找合适选题》迁入 draft；撰写 project/ 五篇现状文档；CLAUDE.md 写入开发日志约定；本条即首条日志
- 动了哪些文件：docs/README.md、docs/project/（5 篇）、docs/logs/260909.md、CLAUDE.md、docs/draft/（迁入 1 篇）；删除 docs/docs.md；收录仓库根三个旧文件的移动
- 关键决策及原因：终局形态定为「话术健身房」多场景陪练平台，本项目是第一间房；拓展以方案库形式维护、不按日期锁死；日志约定写进 CLAUDE.md 以保证跨会话自动执行
- 怎么验证的：文档数值与源码逐项 grep 比对；npm run smoke 与 npm run dom-check 回归通过
```

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md "docs/logs/260909.md"
git commit -m "chore: CLAUDE.md 写入开发日志约定，落首条日志

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: 终检与回归

**Files:** 无新文件

- [ ] **Step 1: 引擎与 UI 回归（确认文档工作没碰坏任何代码）**

```bash
npm run smoke && npm run dom-check
```

预期：两条脚本均正常退出（smoke 输出本地生成/软肋/胜负路径检查通过；dom-check 输出选人→提交→终局→报告流程通过）。

- [ ] **Step 2: 结构终检**

```bash
ls docs/ docs/project/ docs/logs/ docs/draft/
```

预期：`docs/` 下 = README.md、draft、logs、project、黑客松要求.md、杠精陪练房-创作计划书.md（无 docs.md）；project/ 5 篇；logs/260909.md；draft/ 2 篇。

- [ ] **Step 3: 工作区状态**

```bash
git status --short
```

预期：干净（无未提交内容；`CLAUDE.md`、`docs/` 均已入库）。

---

## 自查记录（writing-plans Self-Review）

1. **Spec 覆盖**：设计定稿第四节 6 项 ↔ Task 1（结构+迁移+删除 docs.md）、Task 2–6（五篇现状文档）、Task 7（CLAUDE.md 约定+首条日志）、Task 1/7/8（提交 git）。✅ 无缺口。
2. **占位符扫描**：唯一占位是 Task 7 Step 3 的 `HH:MM`，属于运行时值（由 Step 2 `date +%H:%M` 填入），已给出获取命令。✅
3. **类型/命名一致性**：五篇文档文件名在 Task 1 README、Task 2–6、Task 8 终检中一致（`00-总览.md / 人设系统.md / 对线规则.md / 报告与导出.md / 视听与界面.md`）；文档间交叉引用使用相对路径 `[对线规则.md](对线规则.md)`。✅
