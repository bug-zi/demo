> 状态：已立项（260911 01:14），实施中。实现规格见 `designs-specs.md`。
> 意图源自 260911 凌晨与新功能.md「多模块扩展」条目的逐项澄清（功能档位/内容来源等），见 `idea-话术资料库.md`。

# 话术资料库 · 设计意图

1. 三档全做：**查阅（场景分类 + 搜索）+ 收藏（星标）+ 自建笔记（增/删/改）**，localStorage 持久化。广场/UGC（分享、审批、公开库）本轮不做，自建笔记为赛后 UGC 留种子。

2. **筛选面从草稿文档移到数据文件**：120 条初稿全量灌入 `comebacks.js`，开发者人工筛 = 直接删改数据文件里的行（`draft/260911-资料库话术初稿.md` 降为历史底稿）。

3. **与嘴强王者 2.0 并行零冲突**：Phase A 只新增文件（comebacks.js / notes.js / library.js / library.css / library-check.mjs），一行不碰 2.0 窗口正在动的文件（main.js / personas.js / duel-engine.js / styles.css / index.html / package.json / smoke.mjs / dom-check.mjs）。大厅接线（约 10 行 main.js + dom-check 一节）为 Phase B，等 2.0 落地后完成。

4. 零新增图标资产、零新增存储域名：星标用文本字形 ☆/★（避开 styles.css 图标类），存储键走既有 `gang-ai:*` 命名空间（2.0 已承诺不动这些键）。样式新建 `library.css` 由 `library.js` 自行 import（Vite 原生支持），不碰 styles.css；是否并回 styles.css 由 Phase B 评估。

5. 筛选轴四条：场景（8 场景 + 自建）、攻防类型（反击/自保/降温）、仅收藏、关键词搜索（正文/何时用/标签）。自建笔记与内置话术同列表渲染，带「自建」徽标，可编辑删除；内置话术只能收藏不能改。

6. 验收以 `node scripts/library-check.mjs`（新脚本，三节：数据完整性 / 存储纯函数 / 视图交互）为准；smoke/dom-check 本轮只跑只记录不修复——共享工作区里 2.0 的半成品可能让它们红，那不是本模块的回归。
