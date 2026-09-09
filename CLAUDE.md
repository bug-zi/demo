# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GANG.AI（杠精陪练房）是一个 Vite 驱动的纯前端中文对话竞技 Demo。玩家选择一个预设人设，通过预设话术或自由输入与对手对线；前端根据命中软肋、有效输出或自爆计算怒气和胜负，并在结束后展示战绩报告和可下载的 PNG 战绩图。默认不需要网络或 API key，本地引擎即可完成完整对局。

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

Run the jsdom UI flow check (select persona → submit preset/free text → finish → report):

```bash
npm run dom-check
```

There is currently no lint script or unit-test framework. To run an individual available validation, invoke its underlying command directly, for example `node scripts/smoke.mjs` or `node scripts/dom-check.mjs`.

## Optional remote AI configuration

Copy `.env.example` to `.env.local` and set `VITE_LLM_API_KEY` to enable the remote Claude adapter. Optional variables are `VITE_LLM_MODEL`, `VITE_LLM_BASE_URL`, and `VITE_LLM_THINKING`. Without a key, or when a remote request fails, `src/lib/llm.js` silently falls back to the local engine. Because Vite embeds `VITE_*` values in browser assets and the SDK is configured with `dangerouslyAllowBrowser`, this mode is only suitable for local/demo use; a production deployment would need a server-side proxy.

## Architecture

- `index.html` is the application shell. It owns the top bar, engine badge, sound toggle, and empty `#screen` mount point; `src/main.js` is the module entry point.
- `src/main.js` is both the UI state machine and renderer. The main states are `select`, `duel`, and `report`. `render()` clears and rebuilds the active view with the local `h()` DOM helper. Event handlers mutate the shared `state`, and the duel view keeps references to nodes that need incremental updates (anger bar, timer, log, input, etc.). Model/user text is rendered through `textContent`/DOM nodes rather than HTML strings.
- `src/lib/duel-engine.js` is the deterministic rules layer. `createDuel()` creates per-game state; `localHitType()` and `matchSoftspot()` classify input; `recordTurn()` applies the authoritative anger delta, repeat-softspot diminishing returns, counters, and round record; `judge()` determines `win`, `lose`, or `draw`. Keep numerical game rules here rather than in the model/UI layer.
- `src/lib/llm.js` is the generation adapter. `generateTurn()` exposes one common return shape (`reply`, `hitType`, `softspot`, `quip`, `source`) to the UI. The local path uses deterministic rules plus persona templates; the optional remote path dynamically imports `@anthropic-ai/sdk`, sends recent history and a JSON schema, validates the returned `hitType`, and falls back locally on errors. The model suggests a hit type, but `recordTurn()` remains authoritative for anger values.
- `src/data/personas.js` is the content/configuration layer for the three opponents. Each persona contains identity text, presets, softspot keyword definitions/deltas, stage replies, softspot reactions, and breakdown lines. Add or edit opponents here rather than hard-coding persona behavior in the renderer.
- `src/data/fallbacks.js` contains hit labels/quips, generic local replies, self-destruct reactions, silence text, and the `pick()` helper. `src/data/titles.js` maps completed duel state to the post-game title/rank.
- `src/lib/audio.js` synthesizes short WebAudio tones in the browser; it is opt-in and has no audio assets. Keep audio calls non-blocking and preserve the default-muted behavior.
- `scripts/smoke.mjs` exercises the engine and local/adapter path without a browser. `scripts/dom-check.mjs` creates a jsdom window, imports the actual app entry point, and drives the DOM flow. These scripts are the repository's executable regression checks.
- `src/styles.css` contains the complete responsive dark chat-window UI, including selection, duel, result, animations, and reduced-motion rules. There is no framework component library or router.

## Data flow and invariants

A typical turn flows as follows: `submitTurn()` in `main.js` → `generateTurn()` in `llm.js` → `recordTurn()` in `duel-engine.js` → incremental log/anger UI update → `finish()` when `judge()` returns a result → report rendering via `pickTitle()` and optional Canvas export. A new duel is created with `createDuel()`; report actions either reuse the persona or clear the duel and return to selection.

Important current rules are centralized as constants in `duel-engine.js`: maximum 8 rounds, 30 seconds per round, 2 self-destructs to lose, and anger clamped to 0–100. Repeated hits on the same softspot are intentionally reduced. If changing these values or persona keywords, update the smoke/dom checks and the README's gameplay description when applicable.

## Repository conventions

- Git 操作（add、commit、push、pull、branch、merge 等）全部由用户自己手动完成。Claude Code 不要自动执行任何 git 操作；如认为需要提交或同步，先向用户说明，由用户自行决定并执行。
- Use native ES modules (`type: module`) and browser-compatible JavaScript; avoid introducing a framework unless the project direction explicitly changes.
- Keep persona copy and balance data in `src/data/`, rules in `src/lib/duel-engine.js`, model integration in `src/lib/llm.js`, and DOM orchestration in `src/main.js`.
- Preserve the local fallback path so the demo remains playable offline and remote failures do not interrupt a game.
- Preserve the existing safe DOM rendering approach: generated/user text must remain text nodes, not interpolated `innerHTML`.
- The product and design rationale are in `docs/杠精陪练房-创作计划书.md`; contest requirements and submission checks are in `docs/黑客松要求.md`. The candidate-topic discussion is in `docs/draft/寻找合适选题.md`. The docs hub and folder conventions are in `docs/README.md`.

## 开发日志约定

每完成一轮有产出的开发任务（约一个 commit 的工作量），必须向 `docs/logs/YYMMDD.md`（如 `docs/logs/260909.md`）追加一条日志，无需用户提醒：

- 当天文件不存在则先创建；最新条目放在文件**最上方**
- 条目格式 `## HH:MM ｜ 标题`（用当前本地时间，精确到分钟），下附四项：做了什么 / 动了哪些文件 / 关键决策及原因 / 怎么验证的
- logs 只记流水，复盘与想法写进 `docs/draft/`
- 详细规范见 `docs/README.md`
