# docs 结构重构 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `docs/draft/260910-docs结构重构-design.md`——建立 project（现状）/design（设计）/工作台 三区分离结构，迁入 bugzi 四项机制，清理死引用与残留，同步 CLAUDE.md 与滞后文档。

**Architecture:** 纯文档任务，不改任何源码。设计正本见同目录 `260910-docs结构重构-design.md`（两套正本互补：project/ = 已落地，design/ = 未落地）。所有新建文件全文在第四节给定的基础上逐字落地。

**Tech Stack:** Markdown、bash（Windows Git Bash）。验证手段：结构 ls 终检、grep 死引用清零、`npm run smoke` / `npm run dom-check` 回归。

---

## 背景知识（给零上下文的执行者）

- 仓库：GANG.AI 杠精陪练房，Vite 纯前端 Demo。本任务**只动 `docs/` 与根 `CLAUDE.md`，不碰 `src/`**。
- 平台：Windows 11，bash shell。**路径与文件名含中文，所有 shell 命令中必须用双引号包裹路径**。
- **禁止执行任何 git 操作**（add/commit/push 等）——项目约定 git 全部由开发者手动完成。文件移动用普通 `mv`，路径变化由开发者提交时体现。Task 8 只生成建议命令供开发者参考。
- 工作区已有未提交变更（含待删除/新增文件），属正常状态，不要试图"清理"。
- TDD 不适用（无代码）；每步验证以 ls / grep / npm 回归为准。
- 文件写入用 Write/Edit 工具而非 heredoc，避免中文转义问题。

---

### Task 1: 建 design/ 骨架并迁入样式.md

**Files:**
- Move: `docs/project/样式.md` → `docs/design/样式改版/design.md`（顶部加待适配说明）
- Create: `docs/design/README.md`
- Create: `docs/design/idea/README.md`
- Create: `docs/design/样式改版/archive/.gitkeep`

- [ ] **Step 1: 建目录并迁移样式.md**

```bash
cd "D:/Code/黑客松/260909未央黑客松"
mkdir -p "docs/design/样式改版/archive" "docs/design/idea"
mv "docs/project/样式.md" "docs/design/样式改版/design.md"
```

预期：无输出，退出码 0。

- [ ] **Step 2: 在 design.md 顶部加待适配说明**

用 Edit 工具在文件最顶部（`# 样式` 行之前）插入：

```markdown
> 状态：待适配——迁自 bugzi_workspace 样式规范（260910）。樱花粉/宝蓝双主题、背景图（已上传 `resources/bg-light.png` / `resources/bg-dark.png`）、Material Symbols 图标等条款与 GANG.AI 现状（#12100E 深夜风、emoji 头像 ⌨️🍊🍪、纯 Canvas 战绩图）存在冲突，需开发者逐条定稿后再由 AI 生成 designs-specs.md。

```

插入后文件开头应为：空说明块 → `# 样式` → 原 4 条内容**一字不动**。

- [ ] **Step 3: 写入 `docs/design/样式改版/archive/.gitkeep`**

空文件（git 不跟踪空目录）。

```bash
touch "docs/design/样式改版/archive/.gitkeep"
```

- [ ] **Step 4: 写入 `docs/design/idea/README.md`**

完整内容：

```markdown
# idea/ · 未立项想法

大功能先在这里起一页纸（`<名字>.md`：是什么 / 为什么 / 最小版本）。开发者确认「立项」后升级为 `../<模块>/`（design.md + designs-specs.md + archive/），原想法文件随迁。当前为空。
```

- [ ] **Step 5: 写入 `docs/design/README.md`（机制正本）**

完整内容：

```markdown
# design/ · 设计区

未落地功能的设计正本（已落地功能看 [../project/](../project/)）。机制正本即本文档，AI 按仓库根 `CLAUDE.md` 指引执行。

## 目录结构

| 内容 | 位置 | 命名 |
|---|---|---|
| 设计意图（开发者主导，AI 只建议） | `<模块>/design.md` | — |
| 实现规格（AI 基于 design.md 生成，开发唯一依据，含验收清单） | `<模块>/designs-specs.md` | — |
| brainstorming 产出的 spec | `<模块>/` | `YYYY-MM-DD-<主题>-design.md` |
| writing-plans 产出的 plan | `<模块>/` | `YYYY-MM-DD-<主题>.md`（头部 `**Spec:**` 指回 spec） |
| 落地/废弃后的 spec 与 plan | `<模块>/archive/` | 归档不改名 |
| 未立项的大功能想法 | `idea/<名字>.md` | 一页纸 |

## 生命周期

```
工作台「新功能」小节（小件）── 直接开发
大件 → idea/<名字>.md → 开发者说「立项」→ design/<模块>/
  → design.md（开发者写意图）→ designs-specs.md（AI 生成）
  → 实施 → 落地：spec/plan 入 archive/ + 要点回写 ../project/ 对应现状文档
```

## 归档（AI 自动执行，无需口令）

| 判定 | 依据 | 动作 |
|---|---|---|
| 落地归档 | 日终日志记录实施完成（`npm run smoke` / `dom-check` 通过即算，不等人工冒烟） | spec 与指向它的 plan 一并移入 archive/；文档顶部状态区追加 `- 已归档：YYMMDD 随 <功能> 落地`；要点回写 `../project/` 对应现状文档 |
| 废弃归档 | 开发者明确说「废弃 / 被新设计取代」（AI 不自行判定） | 移入 archive/，状态行标注 `- 已归档：YYMMDD 废弃（原因）` |
| 留守 / 拿不准 | 待实现 / 依据不明 | 不动；拿不准报告开发者 |

- 触发时机：写日终日志、写新 spec/plan 时顺带清点；开发者可随时说「归档一下」。
- 归档后全库检索旧路径，更新活动文档引用；`logs/` 历史记录不改。
- 文件永不删除，只移动。idea 立项时，其想法文件随迁入新模块目录。

## 现有模块

- `样式改版/`——design.md 迁自原 `project/样式.md`（内容源自 bugzi_workspace 规范，**待按 GANG.AI 适配**后由 AI 生成 designs-specs.md，详见该模块 design.md 顶部说明）。
```

- [ ] **Step 6: 验证**

```bash
ls "docs/design/" "docs/design/样式改版/" "docs/design/idea/" && head -3 "docs/design/样式改版/design.md"
```

预期：design/ 下有 README.md、idea、样式改版；样式改版/ 下有 archive、design.md；idea/ 下有 README.md；design.md 前 3 行为待适配说明。

---

### Task 2: 三个区文件合并为工作台.md

**Files:**
- Create: `docs/工作台.md`
- Delete: `docs/project/优化建议区.md`、`docs/project/新功能开发区.md`、`docs/project/问题疑惑区.md`（均为空模板，无内容损失）

- [ ] **Step 1: 写入 `docs/工作台.md`**

完整内容：

```markdown
# 工作台

> 开发者与 AI 的协作入口。想到什么，写进对应小节待完成区即可。
> AI 每完成一轮工作，把该轮条目（含原始描述与完成说明）移入归档区顶部「第N轮」小节。
>
> 分流规则：小功能直接写「新功能」小节让 AI 开发；大功能先在 `design/idea/` 起一页纸想法，说「立项」后升级为正式模块（见 [design/README.md](design/README.md)）。

## 优化建议（待完成）

## 新功能（待完成）

## 问题与疑惑（待完成）

## 归档区（第N轮，从新到旧）
```

- [ ] **Step 2: 删除三个区文件**

```bash
rm "docs/project/优化建议区.md" "docs/project/新功能开发区.md" "docs/project/问题疑惑区.md"
```

- [ ] **Step 3: 验证**

```bash
ls "docs/project/" && ls "docs/工作台.md"
```

预期：project/ 下只剩 5 篇现状文档（00-总览 / 人设系统 / 对线规则 / 报告与导出 / 视听与界面）；工作台.md 存在。

---

### Task 3: superpowers 残留归档

**Files:**
- Move: `docs/superpowers/plans/2026-09-09-docs-upgrade.md` → `docs/draft/archive/2026-09-09-docs-upgrade.md`
- Delete dir: `docs/superpowers/`

- [ ] **Step 1: 移动并删除空目录**

```bash
mv "docs/superpowers/plans/2026-09-09-docs-upgrade.md" "docs/draft/archive/2026-09-09-docs-upgrade.md"
rm -r "docs/superpowers"
```

- [ ] **Step 2: 验证**

```bash
ls docs/ && ls "docs/draft/archive/"
```

预期：docs/ 下**无** superpowers 目录；draft/archive/ 含 2026-09-09-docs-upgrade.md 及原有归档文件。

---

### Task 4: 重写 docs/README.md

**Files:**
- Overwrite: `docs/README.md`

- [ ] **Step 1: 整体覆写为以下内容**

```markdown
# docs · 文档中心

## 给评委与新读者

按此顺序阅读，约 10 分钟了解全貌：

1. [project/00-总览.md](project/00-总览.md)——产品一句话、技术栈、三屏状态机与数据流
2. [杠精陪练房-创作计划书.md](杠精陪练房-创作计划书.md)——立项书（内容冻结）
3. [project/](project/) 其余四篇——人设系统 / 对线规则 / 报告与导出 / 视听与界面

## 区域地图

| 位置 | 放什么 | 谁维护 / 更新时机 |
|---|---|---|
| `project/` | 现状文档：已落地功能"现在是什么"；每篇 ≤120 行，顶部标注对应源码 | AI 维护，代码变动后随手同步 |
| `design/` | 未落地功能设计：design.md（开发者主导）+ designs-specs.md（AI 生成的实现规格）+ idea/ 立项漏斗 | 机制正本见 [design/README.md](design/README.md) |
| `工作台.md` | 优化建议 / 新功能 / 问题疑惑三节待办 + 第N轮归档 | 开发者写待办，AI 每轮自动归档 |
| `logs/` | 开发日志流水，按日期一文件（`YYMMDD.md`） | AI 自动追加；约定正本在仓库根 `CLAUDE.md` |
| `draft/` | 未定稿讨论、私有临时草稿（AI 不读写）、archive | 随时；定稿后转正或归档 |
| 根目录 | `黑客松要求.md`（比赛外部约束）、`杠精陪练房-创作计划书.md` | 不更新 |

## 日志条目格式

`## HH:MM ｜ 标题`，下附四项：做了什么 / 动了哪些文件 / 关键决策及原因 / 怎么验证的；最新条目放文件最上方。详细规范见仓库根 `CLAUDE.md`「开发日志约定」。

## project/ 约定

只描述代码实际现状，不写计划——计划类内容进 `design/` 或 `工作台.md`。
```

- [ ] **Step 2: 验证**

```bash
grep -c "区域地图\|给评委" "docs/README.md"
```

预期：输出 ≥2（两个小节标题都在）。

---

### Task 5: 00-总览.md 与 CLAUDE.md 补丁

**Files:**
- Modify: `docs/project/00-总览.md`（目录职责 +4 行、修死链）
- Modify: `CLAUDE.md`（Architecture +4 条、修死链、文末新增协作约定节）

- [ ] **Step 1: 00-总览.md 目录职责代码块插 4 行**

用 Edit 工具做三处插入（保持代码块内描述列对齐，新行描述起始列与相邻行一致）：

1. 在 `src/main.js           UI 状态机与渲染（三屏、计时、战报、Canvas 导出）` 行后插入：

```text
src/ui/settings-dialog.js  「接入你的 AI」设置弹窗（挂 body 不走 render()，打开即暂停计时）
```

2. 在 `src/data/titles.js    赛后称号规则` 行后插入：

```text
src/data/providers.js  AI 服务商预设（PROVIDER_OPTIONS / presetList）
```

3. 在 `src/lib/audio.js      WebAudio 合成音效（默认静音）` 行后插入：

```text
src/lib/dom.js          h() DOM 构造助手（安全 DOM 渲染公共件）
src/lib/settings.js     AI 设置读取/保存/清除/脱敏（localStorage）
```

- [ ] **Step 2: 00-总览.md 修死链**

将文末「平台愿景」中的 `../draft/260909-终局形态与拓展方案库.md` 替换为 `../draft/archive/260909-终局形态与拓展方案库.md`。

- [ ] **Step 3: CLAUDE.md Architecture 节补 4 条**

在以下 bullet 之后（`src/data/titles.js` 所在条目）：

```markdown
- `src/data/fallbacks.js` contains hit labels/quips, generic local replies, self-destruct reactions, silence text, and the `pick()` helper. `src/data/titles.js` maps completed duel state to the post-game title/rank.
```

紧接着插入 4 个新 bullet：

```markdown
- `src/data/providers.js` defines the remote-AI provider presets (`PROVIDER_OPTIONS`, `presetList`) shown in the settings dialog.
- `src/lib/dom.js` exports the local `h()` DOM helper; all views and dialogs build nodes through it so generated/user text stays in text nodes.
- `src/lib/settings.js` loads/saves/clears the remote-AI settings (with key masking) from localStorage.
- `src/ui/settings-dialog.js` is the「接入你的 AI」settings dialog. It mounts on `document.body` instead of going through `render()` (which would wipe an ongoing duel), pausing the round timer while open.
```

- [ ] **Step 4: CLAUDE.md 修死链**

将 Repository conventions 中的 `docs/draft/寻找合适选题.md` 替换为 `docs/draft/archive/寻找合适选题.md`。

- [ ] **Step 5: CLAUDE.md 文末新增协作约定节**

在文件最后一行 `- 详细规范见 \`docs/README.md\`` 之后追加：

```markdown

## 工作台与设计区协作约定

- 每轮开发任务开始前查看 `docs/工作台.md` 待办；完成一轮后把该轮条目（原始描述+完成说明）归入归档区顶部「第N轮（YYMMDD）」小节
- 大功能先在 `docs/design/idea/` 起一页纸，开发者确认立项后进 `docs/design/<模块>/` 走 design.md（开发者主导）→ designs-specs.md（AI 生成，开发唯一依据）双文档流程
- spec/plan 落地后自动归档至模块 `archive/` 并把要点回写 `docs/project/` 对应现状文档；机制正本见 `docs/design/README.md`
```

- [ ] **Step 6: 验证**

```bash
grep -c "settings-dialog\|providers.js\|dom.js\|settings.js" "docs/project/00-总览.md" CLAUDE.md && grep -n "draft/archive/260909-终局形态\|draft/archive/寻找合适选题" "docs/project/00-总览.md" CLAUDE.md
```

预期：00-总览 与 CLAUDE.md 均命中 ≥4；两个死链修复处各命中 1。

---

### Task 6: 本次 spec/plan 自归档

**Files:**
- Modify: `docs/draft/260910-docs结构重构-design.md`（状态行更新）
- Move: `docs/draft/260910-docs结构重构-design.md`、`docs/draft/260910-docs结构重构-plan.md` → `docs/draft/archive/`

- [ ] **Step 1: 更新 spec 状态行**

将 `docs/draft/260910-docs结构重构-design.md` 顶部的：

```markdown
> 状态：已与开发者逐节确认（260910），待实施
```

替换为：

```markdown
> 状态：已实施（260910）
> 已归档：260910 随 docs 结构重构落地
```

- [ ] **Step 2: 移入 draft/archive/**

```bash
mv "docs/draft/260910-docs结构重构-design.md" "docs/draft/260910-docs结构重构-plan.md" "docs/draft/archive/"
```

注：本计划文件自身随本步归档，属预期行为（机制规定落地即归档、文件永不删除）。

- [ ] **Step 3: 验证**

```bash
ls "docs/draft/" && ls "docs/draft/archive/"
```

预期：draft/ 下只剩 `临时草稿（待写入).md` 与 archive/；archive/ 含本次 design 与 plan 两文件。

---

### Task 7: 终检与回归

**Files:** 无新文件

- [ ] **Step 1: 结构终检**

```bash
ls docs/ docs/project/ docs/design/ "docs/design/样式改版/" "docs/design/idea/" docs/logs/
```

预期：docs/ 下 = README.md、draft、design、logs、project、工作台.md、黑客松要求.md、杠精陪练房-创作计划书.md（无 superpowers）；project/ 5 篇；design/ 三项（README.md、idea、样式改版）；logs/260909.md。

- [ ] **Step 2: 死引用清零检查**

```bash
grep -rn "superpowers" docs/ CLAUDE.md --include="*.md" | grep -v "draft/archive" | grep -v "docs/logs/"
grep -rn "idea文件夹\|优化建议区\|新功能开发区\|问题疑惑区" docs/ CLAUDE.md --include="*.md" | grep -v "draft/archive" | grep -v "docs/logs/"
```

预期：两条命令均无输出（活动文档零死引用；draft/archive 与 logs 为历史记录不改）。

- [ ] **Step 3: 引擎与 UI 回归（确认文档工作没碰坏任何代码）**

```bash
npm run smoke && npm run dom-check
```

预期：两条脚本均正常退出（smoke 输出本地生成/软肋/胜负路径检查通过；dom-check 输出选人→提交→终局→报告流程通过）。

---

### Task 8: 开发日志与人工收尾建议

**Files:**
- Create/Append: `docs/logs/260910.md`

- [ ] **Step 1: 获取当前时间**

```bash
date +%H:%M
```

记下输出（如 `14:32`），用于条目标题。

- [ ] **Step 2: 写入日志（当天文件不存在则创建，新条目放最上方）**

```markdown
# 260910 开发日志

## HH:MM ｜ docs 结构重构——三区分离落地

- 做了什么：按设计定稿（draft/archive/260910-docs结构重构-design.md）落地 project（现状）/design（设计，双文档制+idea 漏斗）/工作台（三区合一+第N轮归档）三区结构；样式.md 迁入 design/样式改版/ 并标注待适配；三个区文件合并为工作台.md；superpowers 残留归档；00-总览与 CLAUDE.md 补 4 个新源码文件并修 2 处死链；CLAUDE.md 新增工作台与设计区协作约定
- 动了哪些文件：docs/README.md（重写）、docs/工作台.md（新建）、docs/design/（README、idea/README、样式改版/design.md、archive/.gitkeep）、docs/project/（删 3 个区文件、补 00-总览）、CLAUDE.md、docs/draft/archive/（迁入 3 个文件）、docs/logs/260910.md
- 关键决策及原因：双正本互补——project/ 只记已落地现状、design/ 管未落地设计，落地即归档并回写现状；四项 bugzi 机制（双文档制/spec 就地归档/轮次制/idea 漏斗）全部落位但按本项目体量轻量化；git 操作按项目约定全部留给开发者手动
- 怎么验证的：结构 ls 终检通过；grep 确认活动文档零死引用（superpowers、三个区文件名、idea文件夹 均只剩 archive/logs 历史）；npm run smoke 与 npm run dom-check 回归通过
```

- [ ] **Step 3: 输出人工 git 收尾建议（不执行）**

向开发者展示以下建议命令，由其自行决定执行：

```bash
git add docs/ CLAUDE.md
git commit -m "docs: 结构重构——project/design/工作台三区分离，迁入双文档制与轮次归档机制"
```

（工作区中 resources/ 目录与 .gitignore 的既有改动与本任务无关，是否提交由开发者自行判断。）

---

## 自查记录（writing-plans Self-Review）

1. **Spec 覆盖**：设计定稿六节 ↔ Task 1（design/ 骨架+样式迁移+3 个 README）、Task 2（工作台合并）、Task 3（superpowers 归档）、Task 4（README 重写）、Task 5（00-总览+CLAUDE.md 补丁，含设计文档第五节全部内容）、Task 6（spec/plan 自归档，对应机制③的落地即归档）、Task 7（设计文档第六节验证三件套）、Task 8（日志+git 手动收尾）。✅ 无缺口。
2. **占位符扫描**：唯一占位是 Task 8 Step 2 的 `HH:MM`，属运行时值（Step 1 `date +%H:%M` 获取），已给出命令。✅ 其余步骤均含完整文件内容或精确命令与预期输出。
3. **类型/命名一致性**：文件名与路径在 Task 1–8 间一致（`design/样式改版/design.md`、`工作台.md`、`draft/archive/`）；Task 5 插入行的文件名与 00-总览/CLAUDE.md 实际源码文件一一对应（src/ 树已核实）。✅
4. **自查补充修正**：执行自查时发现 CLAUDE.md 还有第 2 处死链（`docs/draft/寻找合适选题.md` 已迁 archive 未更新），设计定稿未列——已补入 Task 5 Step 4；Task 7 Step 2 的 grep 期望值按归档时序（Task 6 先于 Task 7）精确化。✅
