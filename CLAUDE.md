# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GANG.AI（杠精陪练房）→ 2.0 改名「嘴强王者（TALK KING）」：Vite 驱动的纯前端中文**多场景**对话竞技 Demo。选人屏按场景分三间房——杠精房、谈判房是 fire 点火局（把对方怒气怼到破防），情商房是 extinguish 灭火局（对方怒气 100 起步、哄到消气算赢；当前「即将开放」占位）。通过预设话术或自由输入对线，前端根据命中软肋/心结、有效输出或自爆计算怒气和胜负，结束后展示战绩报告和可下载的 PNG 战绩图。大厅另挂话术资料库（查阅/收藏/自建笔记）与好友擂台（同屏 hot-seat 两真人 PK + AI 评委逐轮打分 + 终盘复盘——全项目唯一强依赖远程 AI 的模块，无 key 时本地关键词粗评兜底）。默认不需要网络或 API key，本地引擎即可完成完整对局。注意：localStorage 键仍是 `gang-ai:*`（改名只动展示层，存量玩家数据不迁移）。

## Commands

Install dependencies:

```bash
npm install
```

Start the Vite development server at `http://localhost:5173`:

```bash
npm run dev
```

Create the production static bundle in `dist/`:

```bash
npm run build
```

Serve the built bundle locally:

```bash
npm run preview
```

Run the headless engine smoke checks (local generation, softspot paths, draw/win/lose behavior):

```bash
npm run smoke
```

Run the jsdom UI flow check (lobby → select persona → duel with mid-duel lobby round-trips → report):

```bash
npm run dom-check
```

Run the library module checks (comebacks data integrity, notes storage pure functions, library view interactions):

```bash
npm run library-check
```

Run the arena module checks (scenario data integrity, hot-seat engine, AI-judge adapter with remote/fallback paths, view phase flow):

```bash
npm run arena-check
```

There is currently no lint script or unit-test framework. To run an individual available validation, invoke its underlying command directly, for example `node scripts/smoke.mjs` or `node scripts/dom-check.mjs`.

## Optional remote AI configuration

Copy `.env.example` to `.env.local` and set `VITE_LLM_API_KEY` to enable the remote Claude adapter. Optional variables are `VITE_LLM_MODEL`, `VITE_LLM_BASE_URL`, and `VITE_LLM_THINKING`. Without a key, or when a remote request fails, `src/lib/llm.js` silently falls back to the local engine. Because Vite embeds `VITE_*` values in browser assets and the SDK is configured with `dangerouslyAllowBrowser`, this mode is only suitable for local/demo use; a production deployment would need a server-side proxy.

## Architecture

- `index.html` is the application shell. It owns the top bar, engine badge, skin picker, theme toggle, sound toggle, and empty `#screen` mount point; `src/main.js` is the module entry point. A small inline script in `<head>` applies the persisted/system theme and skin before first paint to avoid a flash of the wrong look.
- `src/main.js` is both the UI state machine and renderer. The main states are `lobby`, `select`, `duel`, `report`, `library`, and `arena`; `lobby` is the initial screen — a module hall with three live cards (duel-module main card with a「对局进行中 · 第 N 轮」badge when a duel is live, the library card, and the arena card); the only remaining locked「即将开放」UI is the eq-group placeholder on the select screen. The select screen groups persona cards by scene category (杠精房/谈判房/情商房 from `src/data/categories.js`). `render()` clears and rebuilds the active view with the local `h()` DOM helper; before rebuilding it also calls `disposeArena()` — the arena view owns a 60s answer-countdown interval and exposes `{root, dispose}` so leaving the arena never leaks a ghost timer. Event handlers mutate the shared `state`, and the duel view keeps references to nodes that need incremental updates (anger bar, timer, log, input, etc.). Model/user text is rendered through `textContent`/DOM nodes rather than HTML strings. Navigating to the lobby mid-duel never destroys the duel: `viewDuel()` rebuilds the log from `duel.rounds`, the round timer resumes with the remaining seconds, and an in-flight AI turn keeps recording off-screen (`submitTurn()` guards UI updates when `state.screen !== 'duel'`) and is repainted on return. A turn that crosses a stage boundary triggers `playStageFx` (stage announcement system-line + anger-bar flash + head-avatar shake + stage-pill pop, plus `.log[data-stage]` tinting the AI bubbles); wins/losses play the emotion performances — per-persona `finale` kinds for wins, grayed own last bubble +「你说不出话了」for fire-mode losses — and the finale player re-checks `state.screen` between every beat so leaving mid-performance neither throws nor yanks the player into the report.
- `src/lib/duel-engine.js` is the deterministic rules layer. `createDuel()` creates per-game state; `localHitType()` and `matchSoftspot()` classify input; `recordTurn()` applies the authoritative anger delta, repeat-softspot diminishing returns, counters, and round record; `judge()` determines `win`, `lose`, or `draw`. Duels carry a `mode` from the persona's category: `fire` starts anger at 0 and wins at 100; `extinguish` starts at 100, flips every delta's sign, wins at ≤ `EXTINGUISH_WIN_ANGER` (20), and has no draw (8 unsoothed rounds = lose). `judge()` must branch on `duel.mode` before comparing anger — an extinguish duel opens at 100 and would be misjudged by the fire `≥100 → win` rule. Keep numerical game rules here rather than in the model/UI layer.
- `src/lib/llm.js` is the generation adapter. `generateTurn()` exposes one common return shape (`reply`, `hitType`, `softspot`, `quip`, `sticker`, `source`) to the UI; it also accepts `userSticker` (the player's sticker this turn) which drives the local reply-sticker chance and the remote hint appended to the user message. The local path uses deterministic rules plus persona templates (sticker replies via `pickAiSticker`); the optional remote path dynamically imports `@anthropic-ai/sdk`, sends recent history and a JSON schema (which includes the optional `sticker` enum — invalid ids are dropped silently in `toTurn()`), and falls back locally on errors. The model suggests a hit type, but `recordTurn()` remains authoritative for anger values. The same file also hosts the arena judges: `judgeArenaRound()` / `arenaRecap()` with remote (Anthropic/OpenAI via shared `anthropicJson`/`openAiJson` request cores — the response_format retry and reminder retry live only there) and local-heuristic fallback; invalid scores fail the whole verdict to the fallback rather than being silently invented. The arena winner is authoritative in `arenaResult()` (engine), never the model.
- `src/data/personas.js` is the content/configuration layer for the five opponents. Each persona contains identity text, a `category` field (`gang`/`deal`/`eq`, missing falls back to `gang`), presets, softspot keyword definitions/deltas, stage replies, softspot reactions, breakdown lines, and a `finale` config for the win performance (计划书 §5.3): `kind` is one of `rapid`(连发+好友验证)/`quit`(头像变灰+退群)/`recall`(甩话后撤回)/`lights-off`(灯熄+收摊)/`read-none`(已读不回), `lead` is the outro lines, `exitLine` the closing system notice (`recall` also carries `recallText`). A persona without `finale` falls back to the generic「breakdown lines + 对方已退出群聊」outro, so the data absence is the degrade path. Add or edit opponents here rather than hard-coding persona behavior in the renderer.
- `src/data/categories.js` is the scene-category registry (`CATEGORIES` + `categoryOf()`): id/name/mode (`fire`|`extinguish`)/hint/locked. Array order is the select-screen group order; a `locked` category with no personas shows the placeholder card.
- `src/data/fallbacks.js` contains hit labels/quips in two mode sets (fire `HIT_LABELS`/`HIT_QUIPS` and extinguish `EQ_HIT_LABELS`/`EQ_HIT_QUIPS` — the UI picks by `duel.mode`), generic local replies, self-destruct reactions, silence text, and the `pick()` helper. `src/data/titles.js` maps completed duel state to the post-game title/rank via two tables (`TITLES` for fire, `EQ_TITLES` for extinguish; `pickTitle()` branches on `duel.mode`).
- `src/data/stickers.js` is the emoji-sticker (表情包) registry behind the duel composer's sticker tray: 12 entries of `{ id, emoji, label, delta }` — delta is authored in the fire direction and flipped for extinguish by the engine like every other delta. `matchSticker(raw)` strips registered emoji from any input (position-first match becomes the turn's sticker; hand-typed emoji works the same), `STICKER_IDS` feeds the remote JSON schema enum, and `pickAiSticker(stageId, rand, { replyToSticker })` is the local engine's stage-gated picker (the AI never stickers at the polite stage; a player sticker that round raises its reply chance to 0.5). The engine side lives in `recordTurn()`: pure-sticker turns are classified `hitType: 'sticker'`, sticker deltas are additive with a per-duel global decay (`STICKER_FACTORS` — full / half / zero, so sticker rotation can never replace finding softspots), self-destruct turns drop the sticker, and `aiSticker` is theater only (no player-side anger meter). Curate sticker copy here, not in the UI.
- `src/data/providers.js` defines the remote-AI provider presets (`PROVIDER_OPTIONS`, `presetList`) shown in the settings dialog.
- `src/lib/dom.js` exports the local `h()` DOM helper; all views and dialogs build nodes through it so generated/user text stays in text nodes.
- `src/lib/settings.js` loads/saves/clears the remote-AI settings (with key masking) from localStorage.
- `src/lib/duel-options.js` is the round-length option layer: `ROUND_SECONDS_OPTIONS` (0 = unlimited, the app default / 15 / 30 / 60s) plus `loadRoundSeconds()`/`saveRoundSeconds()` persisted at localStorage key `gang-ai:round-seconds:v1` with the same defensive pattern as `settings.js`. `startDuel()` snapshots the setting into the duel via `createDuel(persona, { roundSeconds })`, so settings changes only affect the next duel. A timed duel's meta row also gets a text-only pause button; the manual pause flag (`state.timerPaused`) survives lobby round-trips and is auto-cleared when a new round starts. `resumeTimer()` refuses to run while it is set, so closing the settings dialog never silently overrides a manual pause.
- `src/lib/share-card.js` is the A3 share-card (战绩图) module behind the report screen's「保存战绩图」button (`main.js`'s `exportCard()` is a thin shell passing `{duel, copy, engine}`). Pure logic — `pickGoldenQuote()` (fire picks the max-delta round, extinguish the min-delta round, since stored deltas are already sign-flipped; text-less sticker/silence rounds never qualify; no candidate → `FALLBACK_QUOTE`), `quoteTagFor()`, and `buildQrMatrix()` — is covered by smoke §7, while `exportDuelCard()` paints the 720×1000 (×2) canvas: anger-red bar, brand row, result headline, opponent row with avatar, golden-quote chat bubbles with an amber tag, title card, 2×2 stats, and a bottom「扫码来战」bar with a QR code. Colors are fixed brand constants (deep-night bg + anger red + amber), deliberately NOT theme tokens — the PNG is an off-web propagation asset and must look identical regardless of the sharer's theme; hardcoded colors live only in this canvas, not the UI token system. The avatar re-draws the persona's self-hosted icon SVG through Path2D, parsing the SVG's own viewBox (these icons are 960-coordinate `0 -960 960 960`, not 24 — assuming 24 scales the glyph ~40× and splashes it outside the circle). The QR (`qrcode-generator`, the only added runtime dependency) encodes `https://gang.debugzi.com`; every failure degrades instead of blocking the export (avatar → first-character circle, QR → link text only, toBlob → silent return).
- `src/ui/settings-dialog.js` is the「接入你的 AI」settings dialog. It mounts on `document.body` instead of going through `render()` (which would wipe an ongoing duel), pausing the round timer while open. Besides the AI provider form it hosts two instant-apply rows that are not part of the AI draft and are untouched by「清除」: the「外观」theme segmented control and the「对局」round-length options (`.round-seg-btn`, styled by grouping selectors with `.theme-seg-btn`).
- The 话术资料库 (library) module is four self-contained files: `src/data/comebacks.js` (SCENES/TYPES registries + the 120 built-in comeback entries — curate content by editing this file directly), `src/lib/notes.js` (favorites + user notes persisted to localStorage keys `gang-ai:favorites:v1` / `gang-ai:notes:v1`, same defensive pattern as `settings.js`, pure functions separated from persistence), `src/ui/library.js` (`createLibraryView()` — main.js mounts it as the `library` screen, passing data getters and persistence callbacks; filter/search/composer state lives in the view's closure with partial repaints that never rebuild the search input), and `src/ui/library.css` (deliberately kept separate from `styles.css`; loaded via a `<link>` in `index.html` so bare-Node `scripts/library-check.mjs` can import `library.js` without a CSS import, and written purely in existing four-state tokens). Logs from this module use the `[话术资料库]` prefix, not the app name.
- The 好友擂台 (arena) module mirrors that layout: `src/data/scenarios.js` (8 high-pressure scenario cards `{id,title,setup,line,hint,keywords,traps}` + `GENERIC_TRAPS`; `hint`/`keywords`/`traps` are grading cues and must never render in the UI), `src/lib/arena.js` (hot-seat scoring engine, fully independent of `duel-engine.js` — `createArena()` pre-draws `ARENA_ROUNDS=3` distinct scenarios, `firstPlayerOf(r)` alternates the first answerer, `recordAnswer`/`recordScores` bookkeep, `arenaResult()` is the single authority for the winner/draw, and `localScore()`/`localRecap()` are the deterministic local grading fallback), `src/ui/arena.js` (`createArenaView({onBack,openSettings}) → {root,dispose}`; closure phase machine intro→scene→handoff→scene→judging→reveal→recap with full-phase repaints — the handoff screen is a fresh subtree so the first answerer's text never leaks — plus a fixed 60s answer countdown that auto-submits on timeout, empty = 弃权), and `src/ui/arena.css` (pure four-state tokens, `<link>`-loaded like library.css). The arena is「离场即弃局」: leaving to the lobby drops the match, no live badge, nothing persisted; main.js disposes the view on every render. Arena scoring is the project's only remote-AI-dependent feature: without a key (or on remote failure) the local keyword heuristic grades instead and the recap shows a「未接入 AI：本场为本地粗评」hint with a settings entry — never a dead end.
- `src/lib/audio.js` synthesizes short WebAudio tones in the browser; it is opt-in and has no audio assets. Keep audio calls non-blocking and preserve the default-muted behavior.
- `src/lib/theme.js` owns the light/dark theme state (`light`/`dark`) and the orthogonal skin state (`blossom` 樱花与星夜 / `midnight` 深夜聊天窗): both persisted in localStorage (`gang-ai:theme`, `gang-ai:skin`), applied via `<html data-theme>` / `<html data-skin>` and consumed purely through CSS custom properties in `styles.css`. Theme entry points are the topbar toggle and the「外观」segmented control in the settings dialog; skin entry is the topbar palette-button popover (`src/ui/skin-popover.js`, safe to open mid-duel — it does not pause the round timer). `src/data/skins.js` is the skin registry the popover renders from; add a skin there plus a token block in `styles.css`.
- `scripts/smoke.mjs` exercises the engine and local/adapter path without a browser. `scripts/dom-check.mjs` creates a jsdom window, imports the actual app entry point, and drives the DOM flow. `scripts/library-check.mjs` tests the library module standalone and `scripts/arena-check.mjs` the arena module (data/engine/judge-adapter/view; neither imports `main.js`). These scripts are the repository's executable regression checks.
- `src/styles.css` contains the responsive dual-skin chat-window UI for lobby/select/duel/report (the library screen's stylesheet is the separate `src/ui/library.css`, the arena's the separate `src/ui/arena.css`): blossom (sakura-pink/royal-blue, translucent panels over full-window background images) and midnight (深夜聊天窗 — solid charcoal/amber dark restored 1:1 from the original, plus a warm-paper light mode). Colors go through four CSS custom-property token blocks (`data-skin` × `data-theme`); block order in the file IS the precedence (blossom light → blossom dark → midnight light → midnight dark → midnight body/stage-pill overrides appended at EOF). Icons are self-hosted Material Symbols Outlined SVGs rendered via CSS `mask-image` + `currentColor` (`.icon i-*` classes). Static assets live in `public/assets/` and are referenced with absolute urls (`/assets/...`) — url() in a `<link>`-loaded stylesheet is NOT rewritten by Vite/esbuild, so assets must not live under `src/` nor inside CSS custom properties. There is no framework component library or router.

## Data flow and invariants

A typical turn flows as follows: `submitTurn()` in `main.js` → `generateTurn()` in `llm.js` → `recordTurn()` in `duel-engine.js` → incremental log/anger UI update → `finish()` when `judge()` returns a result → report rendering via `pickTitle()` and optional Canvas export. A new duel is created with `createDuel()`; report actions either reuse the persona, clear the duel and return to selection, or return to the lobby (the finished duel is then dropped on the next duel-module entry).

Important current rules are centralized as constants in `duel-engine.js`: maximum 8 rounds, 2 self-destructs to lose, anger clamped to 0–100, and `EXTINGUISH_WIN_ANGER = 20` (extinguish win line; extinguish has no draw — 8 unsoothed rounds is a loss). The round timer is optional: each duel carries a `roundSeconds` value (`createDuel`'s engine-side default is `ROUND_SECONDS = 30`; the app default is 0 = unlimited via `duel-options.js`), timed duels render a countdown plus a pause button in the meta row, and unlimited duels have neither — which also means the timeout-silence path (`SILENCE_TEXT`) can only trigger in timed duels. Repeated hits on the same softspot are intentionally reduced. Sticker (表情包) deltas follow a stricter global decay — full / half / zero per duel (`STICKER_FACTORS` in `duel-engine.js`) — so斗图 can spice up turns but never carries a win; pure-sticker turns count as `hitType: 'sticker'` (label 「斗图」) and don't inflate `freeTextRounds`. Arena rules live in `arena.js` instead: 3 rounds, fixed 60s per answer (auto-submit on timeout, empty = 弃权, deliberately NOT wired to duel-options), first answerer alternates per round, and the winner is computed only by `arenaResult()` from total scores. If changing these values or persona keywords, update the smoke/dom/arena checks and the README's gameplay description when applicable.

## Repository conventions

- Git 操作（add、commit、push、pull、branch、merge 等）全部由用户自己手动完成。Claude Code 不要自动执行任何 git 操作；如认为需要提交或同步，先向用户说明，由用户自行决定并执行。
- 虽然这个项目是限时黑客松开发项目，但 Claude Code 不需要根据剩余时间来安排或裁剪任务；只需要规划好「这一步做什么、下一步做什么」，时间由开发者自己协调，不要以工期紧张为由催促、砍需求或改变任务优先级。
- Use native ES modules (`type: module`) and browser-compatible JavaScript; avoid introducing a framework unless the project direction explicitly changes.
- Keep persona copy and balance data in `src/data/`, rules in `src/lib/duel-engine.js`, model integration in `src/lib/llm.js`, and DOM orchestration in `src/main.js`.
- Preserve the local fallback path so the demo remains playable offline and remote failures do not interrupt a game.
- Preserve the existing safe DOM rendering approach: generated/user text must remain text nodes, not interpolated `innerHTML`.
- 愿景叙事只进文档不进 demo：demo 只演已建成的模块（未落地入口显示「即将开放」），平台愿景放在项目文档/介绍文档里讲，不在界面里画饼。
- The product and design rationale are in `docs/杠精陪练房-创作计划书.md`; contest requirements and submission checks are in `docs/黑客松要求.md`. The candidate-topic discussion is in `docs/draft/archive/寻找合适选题.md`. The docs hub and folder conventions are in `docs/README.md`.

## 开发日志约定

每完成一轮有产出的开发任务（约一个 commit 的工作量），必须向 `docs/logs/YYMMDD.md`（如 `docs/logs/260909.md`）追加一条日志，无需用户提醒：

- 当天文件不存在则先创建；最新条目放在文件**最上方**
- 条目格式 `## HH:MM ｜ 标题`（用当前本地时间，精确到分钟），下附四项：做了什么 / 动了哪些文件 / 关键决策及原因 / 怎么验证的
- logs 只记流水，复盘与想法写进 `docs/draft/`
- 详细规范见 `docs/README.md`

## 待办文档与设计区协作约定

- 待办分流在 `docs/优化建议.md` / `docs/新功能.md` / `docs/问题与疑惑.md` 三个文档，每轮任务由开发者指定查阅哪个文档（或直接粘贴内容）。完成一轮后把该轮条目（原始描述+完成说明）移入该文档自己的归档区顶部，格式 `### YYMMDD ｜ 标题`
- 大功能先在 `docs/design/idea/` 起一页纸，开发者确认立项后进 `docs/design/<模块>/` 走 design.md（开发者主导）→ designs-specs.md（AI 生成，开发唯一依据）双文档流程
- spec/plan 落地后自动归档至模块 `archive/` 并把要点回写 `docs/project/` 对应现状文档；机制正本见 `docs/design/README.md`
