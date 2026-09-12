#!/usr/bin/env node
/**
 * AI 生图离线批量工具（美术升级轨，运行时零依赖）。
 *
 * 用法：
 *   node scripts/art/generate.mjs <批次名> [--only name1,name2] [--limit N] [--model X]
 * --model X 临时覆盖 .env.art 的 ART_IMAGE_MODEL（换模型补跑/探测配额用，不改配置文件）
 * 批次清单：scripts/art/manifests/<批次名>.json → [{ name, prompt, size }]
 * 配置：仓库根 .env.art（已 gitignore）：ART_IMAGE_BASE_URL / ART_IMAGE_API_KEY / ART_IMAGE_MODEL
 * 输出：out/art-raw/<批次名>/<name>.png（out/ 已 gitignore，定稿后人工筛入 public/assets/art/）
 *
 * OpenAI 兼容 images API：POST {BASE_URL}/images/generations，取 data[0].b64_json；
 * 中转若只回 url 则抓取该 url。响应结构对不上时打印结构并退出，便于适配差异。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REGEN_DELAY_MS = 2000;
const MAX_RETRIES = 2;

function fail(msg) {
  console.error('✗', msg);
  process.exit(1);
}

function loadEnvArt() {
  let raw = '';
  try {
    raw = readFileSync(resolve(ROOT, '.env.art'), 'utf8');
  } catch {
    fail('读不到 .env.art——复制模板并填入 ART_IMAGE_BASE_URL / ART_IMAGE_API_KEY / ART_IMAGE_MODEL');
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  if (!env.ART_IMAGE_BASE_URL || !env.ART_IMAGE_API_KEY || !env.ART_IMAGE_MODEL) {
    fail('.env.art 缺少必填项（BASE_URL / API_KEY / MODEL）');
  }
  return env;
}

function parseArgs(argv) {
  const args = { batch: null, only: null, limit: Infinity, model: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--only') args.only = (argv[(i += 1)] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limit') args.limit = Math.max(1, Number(argv[(i += 1)]) || 1);
    else if (a === '--model') args.model = (argv[(i += 1)] ?? '').trim() || null;
    else if (!args.batch) args.batch = a;
  }
  if (!args.batch) fail('用法：node scripts/art/generate.mjs <批次名> [--only name1,name2] [--limit N]');
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(env, item) {
  const body = { model: env.ART_IMAGE_MODEL, prompt: item.prompt, size: item.size || '1024x1024', n: 1 };
  if (item.background) body.background = item.background;
  const res = await fetch(`${env.ART_IMAGE_BASE_URL.replace(/\/+$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ART_IMAGE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`响应不是 JSON：${text.slice(0, 300)}`);
  }
  const first = json?.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error(`图片 url 抓取失败 HTTP ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error(`响应缺 data[0].b64_json/url，实际结构：${JSON.stringify(json).slice(0, 400)}`);
}

async function main() {
  const env = loadEnvArt();
  const args = parseArgs(process.argv.slice(2));
  if (args.model) env.ART_IMAGE_MODEL = args.model;
  let items;
  try {
    items = JSON.parse(readFileSync(resolve(ROOT, `scripts/art/manifests/${args.batch}.json`), 'utf8'));
  } catch (err) {
    return fail(`读不到批次清单 scripts/art/manifests/${args.batch}.json：${err.message}`);
  }
  if (!Array.isArray(items) || !items.length) fail('批次清单为空或不是数组');
  let list = items.filter((it) => it && it.name && it.prompt);
  if (args.only) list = list.filter((it) => args.only.includes(it.name));
  list = list.slice(0, args.limit);
  if (!list.length) fail('--only 过滤后没有条目');

  const outDir = resolve(ROOT, `out/art-raw/${args.batch}`);
  mkdirSync(outDir, { recursive: true });
  console.log(`批次 ${args.batch}：${list.length} 张 → ${outDir}`);

  const failed = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const file = resolve(outDir, `${item.name}.png`);
    let buf = null;
    for (let attempt = 0; attempt <= MAX_RETRIES && !buf; attempt += 1) {
      try {
        process.stdout.write(`[${i + 1}/${list.length}] ${item.name}${attempt ? `（重试 ${attempt}）` : ''} … `);
        buf = await generateOne(env, item);
        writeFileSync(file, buf);
        console.log(`✓ ${(buf.length / 1024).toFixed(0)}KB`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
        if (attempt < MAX_RETRIES) await sleep(REGEN_DELAY_MS);
      }
    }
    if (!buf) failed.push(item.name);
    if (i < list.length - 1) await sleep(REGEN_DELAY_MS);
  }
  if (failed.length) fail(`失败 ${failed.length} 张：${failed.join(', ')}（可 --only 重跑）`);
  console.log('\n✓ 批次完成，请人工筛选定稿后压缩入库 public/assets/art/');
}

main();
