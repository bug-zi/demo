# docs 结构重构 · 设计定稿

> 状态：已实施（260910）
> 已归档：260910 随 docs 结构重构落地（执行中遇并行样式优化产出，按开发者拍板「最小去冲突」：跳过 00-总览 死链改写步骤，样式优化两文件留 draft/ 待终审后迁入 design/样式改版/）
> 性质：纯文档操作，零代码改动，预计 1 小时

## 一、背景与目标

开发者认为当前 `docs/` 结构混乱（主诉 `docs/project/`），参考 `bugzi_workspace` 项目文档库（120 文件、10 轮迭代验证）重构，但因项目性质不同不做整体迁移。本次重构同时服务三个目标：

1. **冲刺效率**——黑客松 9.13 14:00 截止，剩下 3 天的开发协作不能被文档拖慢
2. **评委阅读**——提交内容含文档，外人应能在 3 分钟内看懂项目
3. **赛后演进**——终局形态是「话术健身房」平台，结构要能直接续用

### 当前六个病灶（重构依据）

1. `docs/project/` 定位被稀释：README 定义"只写现状"，实际混入 3 个流程区文件 + 1 篇设计愿望
2. 区文件两处冗余：`project/` 下三个区文件与 `draft/临时草稿` 里的立项区三分类重复
3. 死引用：`新功能开发区.md` 引用不存在的 "idea文件夹"
4. `样式.md` 与代码现实矛盾：内容是 bugzi 的样式规范（樱花粉/宝蓝/Material Symbols），而背景图已上传至 `resources/`，实为**未落地的设计方向**却躺在现状区
5. 残留：`docs/superpowers/plans/` 的 docs-upgrade 计划已执行完未归档
6. 文档滞后：`00-总览.md` 与 CLAUDE.md 缺 4 个新源码文件，且总览对终局形态文档的引用已成死链

### 关键判断（贯穿全部方案）

bugzi 没有"现状文档"概念，其 design.md 即正本；本项目刚逐项验证过 5 篇现状文档（兼评委材料），不能废。因此双文档制的落法是**两套正本互补**：

> `project/`（现状区）= 已落地功能的正本；`design/`（设计区）= 未落地功能的正本。落地那一刻 spec 归档、要点回写现状文档。

## 二、终局结构

`★` 为新建，其余现存：

```
docs/
├── README.md                     # 重写：评委阅读路径 + 区域地图
├── 黑客松要求.md                  # 不动
├── 杠精陪练房-创作计划书.md        # 不动
│
├── project/                      # 现状区：已落地，只写"现在是什么"
│   ├── 00-总览.md                # 保留，补 4 个源码文件 + 修死链
│   ├── 人设系统.md               # 保留
│   ├── 对线规则.md               # 保留
│   ├── 报告与导出.md             # 保留
│   └── 视听与界面.md             # 保留
│
├── design/                    ★  # 设计区：未落地，双文档制主场
│   ├── README.md              ★  # 机制正本（生命周期 + 归档规则）
│   ├── 样式改版/               ★
│   │   ├── design.md             # ← 原 project/样式.md 迁入，顶部加待适配说明
│   │   └── archive/           ★  # .gitkeep 占位
│   └── idea/                  ★  # 未立项大功能，README.md 占位说明
│
├── 工作台.md                   ★  # 三区合一 + 第N轮归档
├── draft/                        # 不动（含私有临时草稿）
│   └── archive/
│       └── 2026-09-09-docs-upgrade.md  # ← 从 docs/superpowers/plans/ 移入
└── logs/                         # 不动，本次追加 260910 日志
```

### 现存文件归宿表

| 现存 | 去向 |
|---|---|
| `project/` 5 篇现状文档 | 原地保留；仅改 `00-总览.md`（见第五节） |
| `project/样式.md` | → `design/样式改版/design.md`，顶部加待适配说明，内容原样保留 |
| `project/优化建议区.md`、`新功能开发区.md`、`问题疑惑区.md` | 合并为 `docs/工作台.md`，原三文件删除（均为空模板，无内容损失） |
| `docs/superpowers/plans/2026-09-09-docs-upgrade.md` | → `draft/archive/`；移除空的 `superpowers/` 目录 |
| `draft/临时草稿（待写入）.md` | **不动**（开发者私有，AI 不读不写；其立项区三分类与工作台三节对应，条目由开发者自行搬运） |
| `logs/`、`draft/` 其余、根目录两篇 | 不动 |

## 三、机制规则

### ① 功能生命周期（双文档制 + idea 漏斗 + 就地归档）

```
工作台「新功能」小节（小件）── 直接让 AI 开发
大件 → design/idea/<名字>.md（一页纸：是什么/为什么/最小版本）
     → 开发者说「立项」→ design/<模块>/
        → design.md（开发者主导写设计意图，AI 只建议）
        → designs-specs.md（AI 生成：数据/交互/验收清单，开发唯一依据）
        → 实施中 spec/plan 带日期放模块内
        → 落地：spec/plan 移 archive/ + 状态行记归档 + 要点回写 project/ 对应现状文档
        → 废弃：仅当开发者明确说废弃才归档，AI 不自行判定
```

### ② 归档触发（全自动，无需口令）

AI 在**写日终日志**、**写新 spec/plan** 时顺带清点归档；开发者可随时说「归档一下」强制触发。文件永不删除，只移动；归档后全库检索旧路径更新活动文档引用（`logs/` 历史不改）。

### ③ 工作台轮次制

AI 每完成一轮工作，把该轮完成的全部条目（跨三个小节，含原始描述与完成说明）作为一组，在归档区顶部新增 `### 第N轮（YYMMDD）：本轮主题`；轮次编号只增不减，新轮次永远插最上。

### ④ 读写边界

- `design/<模块>/design.md`：开发者主导，AI 只提建议
- `designs-specs.md`、归档动作、现状文档回写：AI 负责
- `draft/临时草稿（待写入）.md`：完全私有，AI 不读不写

## 四、新建文件全文

### 4.1 `docs/README.md`（重写）

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

### 4.2 `docs/工作台.md`

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

### 4.3 `docs/design/README.md`

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

### 4.4 `docs/design/idea/README.md`

```markdown
# idea/ · 未立项想法

大功能先在这里起一页纸（`<名字>.md`：是什么 / 为什么 / 最小版本）。开发者确认「立项」后升级为 `../<模块>/`（design.md + designs-specs.md + archive/），原想法文件随迁。当前为空。
```

### 4.5 `docs/design/样式改版/design.md` 顶部说明（置于原标题行之前，原内容原样接后）

```markdown
> 状态：待适配——迁自 bugzi_workspace 样式规范（260910）。樱花粉/宝蓝双主题、背景图（已上传 `resources/bg-light.png` / `resources/bg-dark.png`）、Material Symbols 图标等条款与 GANG.AI 现状（#12100E 深夜风、emoji 头像 ⌨️🍊🍪、纯 Canvas 战绩图）存在冲突，需开发者逐条定稿后再由 AI 生成 designs-specs.md。
```

### 4.6 `docs/design/样式改版/archive/.gitkeep`

空文件（git 不跟踪空目录）。

## 五、配套修改

### 5.1 `docs/project/00-总览.md`

「目录职责」代码块内**新增 4 行**（按现有对齐风格插入相应位置）：

```
src/lib/dom.js          h() DOM 构造助手（textContent 安全渲染的公共件）
src/lib/settings.js     AI 设置的读取/保存/清除/脱敏
src/data/providers.js   AI 服务商预设（PROVIDER_OPTIONS / presetList）
src/ui/settings-dialog.js 「接入你的 AI」设置弹窗（挂 body 不走 render()，打开即暂停对局计时）
```

并修复死链：文末「平台愿景」中 `../draft/260909-终局形态与拓展方案库.md` 改为 `../draft/archive/260909-终局形态与拓展方案库.md`。

### 5.2 仓库根 `CLAUDE.md`（两处）

1. **Architecture 节**目录职责补同样 4 个文件（与 00-总览口径一致）。
2. **文末新增一节**：

```markdown
## 工作台与设计区协作约定

- 每轮开发任务开始前查看 `docs/工作台.md` 待办；完成一轮后把该轮条目（原始描述+完成说明）归入归档区顶部「第N轮（YYMMDD）」小节
- 大功能先在 `docs/design/idea/` 起一页纸，开发者确认立项后进 `docs/design/<模块>/` 走 design.md（开发者主导）→ designs-specs.md（AI 生成，开发唯一依据）双文档流程
- spec/plan 落地后自动归档至模块 `archive/` 并把要点回写 `docs/project/` 对应现状文档；机制正本见 `docs/design/README.md`
```

## 六、迁移步骤

1. `git mv` 不适用（工作区有未提交变更，统一用普通 `mv`，路径变化由开发者提交时体现）：
   - `docs/project/样式.md` → `docs/design/样式改版/design.md`（先建目录，再加 4.5 顶部说明）
   - `docs/superpowers/plans/2026-09-09-docs-upgrade.md` → `docs/draft/archive/`；删除空的 `docs/superpowers/` 目录
   - 删除 `docs/project/优化建议区.md`、`新功能开发区.md`、`问题疑惑区.md`
2. 按第四节全文新建：`docs/README.md`（重写）、`工作台.md`、`design/README.md`、`design/idea/README.md`、`design/样式改版/archive/.gitkeep`
3. 按第五节修改：`00-总览.md`、根 `CLAUDE.md`
4. `docs/logs/260910.md` 追加本次日志（当天文件不存在则创建；格式按 CLAUDE.md 约定）
5. **验证**：
   - `ls docs/ docs/project/ docs/design/ docs/design/样式改版/` 结构终检
   - `grep -rn "superpowers" docs/ --include="*.md"` 与 `grep -rn "优化建议区\|新功能开发区\|问题疑惑区\|idea文件夹" docs/ --include="*.md"`：命中应仅剩 `logs/` 历史记录（logs 不改），活动文档零死引用
   - `npm run smoke && npm run dom-check` 回归（确认文档操作未碰坏任何东西）
6. **git 全部操作由开发者手动完成**（项目约定），AI 不执行

## 七、不做清单（scope 边界）

- 不改任何 `src/` 代码——样式适配是「样式改版」模块立项后的事
- 不动 `draft/临时草稿（待写入）.md` 及其内容（含其中已写的想法条目，由开发者自行搬入工作台或 idea/）
- 不动 `logs/` 历史条目
- 不为样式改版生成 designs-specs.md（等开发者定稿 design.md 后另起一轮）
- 不执行任何 git 操作
