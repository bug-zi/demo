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
新功能.md 待完成区（小件）── 直接开发
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

- `样式改版/`——已落地（260910）：双主题 + 背景图 + Material Symbols 图标体系，spec/plan 在其 `archive/`，现状见 `../project/视听与界面.md`。
- `模块大厅/`——已落地（260911）：lobby 初始屏 + 三模块卡（对线房主卡/资料库/擂台锁定卡）+ 切走不销毁对局，spec 在其 `archive/`，现状见 `../project/00-总览.md`。
- `嘴强王者2.0/`——已落地（260911）：选人屏三房分类（杠精/谈判/情商）+ 情商房灭火反向局 + 全局改名 v2.0.0，spec 在其 `archive/`，现状见 `../project/00-总览.md` 与 `../project/对线规则.md`。
- `话术资料库/`——已落地（260911）：大厅真卡进入 `library` 屏，查阅 120 条内置话术 + ☆ 收藏 + 自建笔记（localStorage），spec 在其 `archive/`，现状见 `../project/话术资料库.md`。
- `好友擂台/`——已落地（260911）：同屏 hot-seat 两真人 PK + AI 逐轮评分 + 终盘复盘，spec 在其 `archive/`，现状见 `../project/好友擂台.md`。
