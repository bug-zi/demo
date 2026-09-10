# 话术资料库 · 实现规格

> 状态：已落地（260911，Phase A + Phase B 全部完成；library-check / smoke / dom-check / build 全绿，四态令牌采样验收通过；spec 随即归档至 `archive/`，落地记录见文末 §10）。
> 历史分期：**Phase A = 纯新增文件，零碰 2.0 窗口文件**；Phase B = 大厅接线（2.0 落地后执行）。

## 1. 分期边界

| 阶段 | 产物 | 碰不碰 2.0 的文件 |
|---|---|---|
| Phase A | `src/data/comebacks.js`、`src/lib/notes.js`、`src/ui/library.js`、`src/ui/library.css`、`scripts/library-check.mjs` | 不碰（main.js / personas.js / duel-engine.js / styles.css / index.html / package.json / smoke.mjs / dom-check.mjs 一行不改） |
| Phase B | main.js 接线（≈10 行）+ dom-check 第 13 节 + CLAUDE.md 架构行 + `docs/project/话术资料库.md` + spec 归档 | 碰——所以必须等 2.0 落地 |

Phase A 结束时资料库功能完整但**未挂进应用**（大厅仍是锁定卡），这是刻意为之：两窗口并行度最大化。

## 2. 数据层 `src/data/comebacks.js`

登记表 + 话术全量，字段 schema 与 `draft/260911-资料库话术初稿.md` 一一对应：

```js
export const SCENES = [
  { id: 'online',   name: '网络对线' },
  { id: 'family',   name: '亲戚饭桌' },
  { id: 'job',      name: '职场画饼' },
  { id: 'client',   name: '甲方乙方' },
  { id: 'bargain',  name: '砍价购物' },
  { id: 'dorm',     name: '宿舍生活' },
  { id: 'advisor',  name: '导师与课题组' },
  { id: 'boundary', name: '日常边界' },
];
export const TYPES = [
  { id: 'counter', name: '反击' },
  { id: 'guard',   name: '自保' },
  { id: 'cool',    name: '降温' },
];
export const COMEBACKS = [ { id, text, scene, type, tip, tags }, ... ];
```

- 条目 120 条（初稿 8 场景 × 15），id 顺序编号 `c001`…`c120`，与草稿行序一致。
- `text`：话术原文（含引号「」内的整句，不含外层引号）。
- `tip`：草稿的「何时用」列，一句话。
- `tags`：草稿标签列按逗号切开的数组（1-2 个）。
- **人工筛 = 直接删改本文件**；删除产生 id 空洞无妨，id 只作收藏引用的稳定标识。
- 数据校验规则（library-check 第 1 节强制）：id 唯一、text/tip 非空、scene ∈ SCENES、type ∈ TYPES、tags 为非空字符串数组、8 场景各 ≥10 条、三类型各 ≥15 条。

## 3. 存储层 `src/lib/notes.js`

照抄 `settings.js` 的防御模式（`src/lib/settings.js:21` 的 `storage()` 守卫 + 全读写 try/catch + 坏数据收敛），但**纯函数与落盘分离**，便于 Node 直测：

```js
const NOTES_KEY = 'gang-ai:notes:v1';
const FAV_KEY   = 'gang-ai:favorites:v1';
```

- `loadFavorites()` → `string[]`（坏 JSON / 非数组 → `[]`）；`saveFavorites(ids)` → 去重落盘，返回落盘那份。
- `loadNotes()` → `Note[]`（逐条 sanitize，不合格条目静默丢弃）；`saveNotes(notes)` → 落盘。
- 纯函数（不碰存储）：`toggleFavorite(ids, id)` 返回新数组；`upsertNote(notes, draft)`——无 `id` 则新建（分配 `n-` 前缀 id + `createdAt`），有 `id` 则原位更新并刷新 `updatedAt`；**text trim 后为空 → 抛 `Error('话术不能为空')`**，由视图层捕获提示；`deleteNote(notes, id)` 返回删除后的新数组。
- Note schema：`{ id, text, scene, type, tip, tags, createdAt }`——scene/type 仍取自 SCENES/TYPES（笔记描述「何时用」，不另造「自建」伪场景；「自建」是**来源筛选轴**，见 §4）。
- `storage()` 不可用（Node / Safari 无痕）时：load 返回空、save 安静跳过，**不抛**。
- 日志前缀用 `[话术资料库]`，不用 `[杠精陪练房]`——避开 2.0 的改名 grep 触点表。

## 4. 视图层 `src/ui/library.js`

自包含模块（同 `settings-dialog.js` 定位），main.js 只在 Phase B 挂载：

```js
createLibraryView({ getFavorites, getNotes, onToggleFavorite, onSaveNote, onDeleteNote, onBack })
// 返回 section.library 根节点；数据经 getter 每次绘制时拉取，视图自管重绘
```

- **筛选轴四条**（闭包 ui 状态）：`scene`（`'all'` | 8 场景 id | `'mine'`）、`type`（`'all'` | 3 类型 id）、`onlyFav`、`query`（对 text/tip/tags 做 includes 匹配）。`scene:'mine'` = 只看自建笔记。
- **列表统一渲染**内置 + 自建：内置卡带 ☆/★ 文本星标按钮（点击回调 `onToggleFavorite(id)` 后重绘）；自建卡带「自建」徽标 + 编辑/删除按钮（`onDeleteNote(id)` 直接删，不加确认弹层——笔记是轻数据，保持简单；`upsertNote` 抛错时卡片下方提示一行错误文案，不弹窗）。
- 卡片结构：`article.entry-card > .entry-main(p.entry-text + 操作) + p.entry-meta(场景 · 类型 · tip) + .entry-tags(span.tag × n)`。
- **局部重绘纪律**：搜索框与筛选 chip 只重建列表区（`.library-list` replaceChildren），不重建输入框本身——否则每次键入丢焦点。composer（自建/编辑表单）按需挂载，输入期间不重建。
- composer 字段：话术 textarea（必填）、场景 select（默认第一项）、类型 select（默认 `guard`）、何时用 input、标签 input（逗号分隔）。保存 → `onSaveNote(draft)`；`onSaveNote` 内部走 `upsertNote`，抛空文本错误时由视图捕获显示。取消/保存成功后关表单重绘。
- 空态文案：无匹配 →「没有匹配的话术」；仅收藏且空 →「还没有收藏，点 ☆ 攒起来」。
- 顶栏：`button.back-btn`「← 大厅」→ `onBack()`（复用 styles.css 既有 `.back-btn` 类，样式零新增）。
- **安全渲染铁律**：全部经 `h()`（`src/lib/dom.js`）textContent 落地，绝不拼 HTML。

## 5. 样式 `src/ui/library.css`

- 由 main.js 在 Phase B 接线时 `import './ui/library.css'`（Vite 原生支持；裸 Node 的 library-check 跑不动 CSS import，所以不放在 library.js 里）。
- 只定义新类：`.library / .library-head / .library-filters / .chip-row / .lib-chip(.on) / .lib-search / .library-list / .entry-card / .entry-main / .entry-text / .entry-meta / .entry-tags / .tag / .fav-btn(.on) / .mine-badge / .entry-actions / .note-form / .lib-empty`。**不覆写任何既有类**。
- **纯令牌**：只用 styles.css 既有自定义属性（`--surface / --surface-deep / --text / --muted / --accent / --accent-soft / --on-accent / --line / --radius / --shadow / --font`），四态（2 皮肤 × 2 深浅）自动适配，零写死色。`.back-btn` 不在本文件，直接复用 styles.css:560 的定义。
- 星标字形用文本 `☆/★`（`fav-btn` 内 textContent），不新增 SVG 资产、不加 `.icon i-*` 类。

## 6. 检查脚本 `scripts/library-check.mjs`

jsdom 环境搭法照抄 `dom-check.mjs:3-14`（globals + `await import`），但**不 import main.js**——只测本模块。退出码语义与其余脚本一致（`console.error('✗', msg); process.exit(1)`）。三节：

1. **数据完整性**：COMEBACKS 恰 120 条；§2 全部校验规则逐条断言；抽查 `c001` 字段与草稿首行一致（「你说得对。」/ online / guard）。
2. **存储纯函数**：用可注入的假 localStorage（内存 Map）断言——load 坏数据收敛 `[]`；toggle 加/减/幂等；upsert 新建分配 `n-` id 与 createdAt、更新刷 updatedAt、空 text 抛错；delete；save→load 往返一致；storage 为 undefined 时全链路不抛。
3. **视图交互**（jsdom）：120+1 张卡（含 1 条样例笔记）；点场景 chip → 列表数 = 用 COMEBACKS 按同条件过滤的期望值；类型 chip、`仅收藏`、搜索（设 value + dispatch input 事件）同法断言；点星标 → 回调收到 id 且重绘为 ★；「自建」chip → 只剩笔记且有 `.mine-badge`；composer 新建 → `onSaveNote` 收到表单字段；编辑 → 带原 id；删除 → `onDeleteNote` 收到 id；`.back-btn` → `onBack` 触发；全树无 innerHTML 赋值。

运行方式：`node scripts/library-check.mjs`（package.json alias 留 Phase B，避免碰 2.0 正在改的文件；直接调用是 CLAUDE.md 认可的方式）。

## 7. Phase B 接线清单（2.0 落地后执行）

1. `main.js`：`state.screen` 加 `'library'`；`render()`（main.js:56）加一行分支；`viewLobby()` 把 `lockedCard('话术资料库', …)`（main.js:105）换成真卡 `onclick: enterLibrary`；`enterLibrary()` 设 screen 并 render；顶部 `import './ui/library.css'`。数据经 `loadFavorites()/loadNotes()` 就地取，回调里改 + save。
2. `scripts/dom-check.mjs`：第 13 节资料库流（大厅 → 资料库 → 筛选/收藏/自建 → 返回大厅，断言进行中对局角标不受影响）。
3. 四态浏览器采样：`.entry-card` 背景与 `--surface` 逐一吻合（照大厅验收先例，注入 `* { transition: none }` 排除渲染节流假象）。
4. `package.json` scripts 加 `"library-check": "node scripts/library-check.mjs"`；顺带评估 library.css 并回 styles.css 还是长期独立。
5. CLAUDE.md 架构节补三个新文件一行；`docs/project/话术资料库.md` 现状页（≤120 行）；spec 移入 `archive/`。

## 8. 不动清单与并行协调

- Phase A 碰的文件全部是**新建**：上表 5 个新路径 + 本模块 docs。
- 共享工作区风险：git 提交由开发者手动做，且两窗口改动会互相携带——建议 2.0 落地前不提交代码（或由开发者自行取舍）；日志文件先读后写防覆盖。
- `gang-ai:notes:v1` / `gang-ai:favorites:v1` 是新键，2.0 的「存储键不动」承诺不涉及它们；将来改名浪潮（2.0 只改展示层）对本模块零影响——文案里不出现「杠精陪练房」字样。

## 9. 验收清单（Phase A）

- [x] comebacks.js 120 条全量灌入，id 唯一、字段齐、scene/type 全在登记表内
- [x] 8 场景各 ≥10 条，三类型各 ≥15 条
- [x] notes.js 坏数据收敛不抛；纯函数 toggle/upsert/delete 语义正确（含空文本抛错）
- [x] storage 不可用时安静降级（load 空 / save 跳过）
- [x] 视图四轴筛选 + 搜索 + 星标 + 自建增删改 + 返回全通，局部重绘不丢输入焦点
- [x] 全部经 h() 文本节点渲染，无 innerHTML
- [x] library.css 纯令牌零写死色，零新图标资产，零既有类覆写
- [x] `node scripts/library-check.mjs` 三节全绿
- [x] `npm run smoke` / `npm run dom-check` 跑一遍只记录不修复（2.0 半成品可能红，非本模块回归）——实测合并状态全绿
- [x] 大厅对资料库的锁定卡原样保留（Phase B 才解锁），现有界面零变化

## 10. Phase B 落地记录（260911 补记）

Phase B 于 2.0 落地同窗口完成接线（提交 30f9d3c），260911 白班收口验收与文档回写。与 §7 清单的对应及两处偏差：

1. main.js 接线（screen `'library'` + render 分支 + 真卡 + `enterLibrary()` + 数据回调）——✅ 按清单；state 持有 `favorites`/`notes`，回调里改 + save。
2. dom-check 第 13 节（解锁进入 / 筛选 / 收藏 / 自建落 localStorage / 返回 / 对局角标不变）——✅ 按清单。
3. **偏差一（样式接线方式）**：spec §5 写「由 main.js `import './ui/library.css'`」，实际落地为 **index.html `<link rel="stylesheet" href="/src/ui/library.css">`**。效果等价（dev 与 build 产物均已验证含资料库样式），且同样满足「library.js 顶部不 import CSS，裸 Node 检查脚本可直跑」的约束；index.html 本就是两份样式表的加载点，职责更集中。library.js / library.css 头注释已同步改为实况。
4. **偏差二（落地顺序）**：spec 设想 Phase A 提交后再做 Phase B 接线；实际 2.0 与资料库 Phase A 同提交（30f9d3c）合入时已一并带上 Phase B 接线、dom-check 13 节与 package.json `library-check` alias，本轮回口的是验收与文档。
5. library.css 并回 styles.css 还是长期独立——**定案：长期独立**（模块自包含、styles.css 不膨胀、纯令牌已验证四态自适应；index.html 集中加载两份样式表）。
6. 验收：`npm run library-check` / `smoke` / `dom-check` / `build` 全绿；dev 浏览器四态令牌采样（注入 `* { transition: none }` 排节流假象）——`.entry-card` 底=--surface、非选中 chip=--surface、选中 chip=--accent-soft、自建按钮=--accent、meta=--muted、tag=--surface-deep 逐一吻合；真浏览器交互冒烟（收藏★落盘 / 自建带徽标落盘 / 仅收藏与自建筛选 / 搜索 / 返回大厅）全过；桌面 720px 与 390px 移动端均无横向溢出。截图通道不可用（同大厅轮先例），令牌法为准。
7. 现状回写：`docs/project/话术资料库.md`（新建现状页）、`docs/project/00-总览.md`（五屏状态机 + 目录职责）、根 `CLAUDE.md`（架构节 + 命令节）、`docs/design/README.md`（模块状态）。
