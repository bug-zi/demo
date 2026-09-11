// 战绩图（A3 传播化）：唯一能离开网页的传播资产，按「脱离网页仍能看懂」标准重做。
// 纯逻辑（金句选取 / 标签文案 / QR 矩阵）与 Canvas 绘制分离，前者可被 smoke 直接跑。
// 配色是固定品牌传播色而非会话令牌：同一张图黑白花色不一就没有品牌识别度，
// 写死色只进这块 Canvas，不违反 UI 层四态令牌纪律。
import qrcode from 'qrcode-generator';
import { MAX_ROUNDS, MAX_SELF_DESTRUCTS, uniqueSoftspotHits } from './duel-engine.js';
import { pickTitle } from '../data/titles.js';

/** 二维码编码的正式链接（A4 部署域名）。 */
export const QR_URL = 'https://gang.debugzi.com';

/** 全程没落在点上时的金句兜底文案。 */
export const FALLBACK_QUOTE = '一场寂静的较量，没有一句话落在点上。';

/* ------------------------------------------------------------------ */
/* 纯逻辑：金句选取                                                     */
/* ------------------------------------------------------------------ */

const hasText = (r) => typeof r.userText === 'string' && r.userText.trim().length > 0;

/**
 * 选「最痛一击」回合：点火局取 delta 最大、灭火局取 delta 最小（存档 delta 已是
 * 灭火翻转后的值，方向感即胜负方向）。无文字回合（纯斗图/沉默）不参选，
 * 即便带着高 delta —— 聊天截图式的金句得有话可看。
 * @returns {object|null} 命中的 round 记录；没有落在点上的文字回合时返回 null
 */
export function pickGoldenQuote(duel) {
  if (!duel || !Array.isArray(duel.rounds)) return null;
  const extinguish = duel.mode === 'extinguish';
  const candidates = duel.rounds.filter((r) => hasText(r) && (extinguish ? r.delta < 0 : r.delta > 0));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) =>
    (extinguish ? r.delta < best.delta : r.delta > best.delta) ? r : best,
  );
}

/**
 * 金句区的小标签文案。无金句时返回 null（卡片走兜底文案，不放空标签）。
 * 点火局带 +Δ；灭火局 delta 是负数，直接展示降幅。
 */
export function quoteTagFor(duel) {
  const quote = pickGoldenQuote(duel);
  if (!quote) return null;
  return duel.mode === 'extinguish'
    ? `本局最暖心一击 怒气${quote.delta}`
    : `本局最痛一击 +${quote.delta}`;
}

/** 生成 QR 矩阵（ECC M，typeNumber 0 自动选版）。绘制与测试共用这一出口。 */
export function buildQrMatrix(url = QR_URL) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return { size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/* ------------------------------------------------------------------ */
/* Canvas 绘制：固定品牌传播色（深夜底 + 怒气红 + 琥珀金）               */
/* ------------------------------------------------------------------ */

const INK = {
  bg: '#12100E', // 深夜底
  bar: '#D33A3A', // 怒气红
  text: '#FFFCF5', // 主文字
  muted: '#A89B85', // 次文字
  card: '#1D1915', // 卡片底
  edge: '#2E2822', // 卡片描边
  bubbleOpp: '#221D18', // 对手气泡底
  bubbleMe: '#3A2F17', // 玩家气泡底（琥珀调）
  amber: '#F0C243', // 强调金
};

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
const font = (px, bold = false) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;

function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    let width = 0;
    let cut = rest.length;
    for (let i = 0; i < rest.length; i += 1) {
      width += ctx.measureText(rest[i]).width;
      if (width > maxWidth) { cut = i; break; }
    }
    if (cut <= 0) cut = 1;
    const isLast = lines.length === maxLines - 1;
    if (isLast && rest.slice(cut).length > 0) {
      // 末行放不下剩余内容：截断加省略号，省略号自身也要量宽度
      let line = rest.slice(0, cut);
      while (line.length > 1 && ctx.measureText(`${line}…`).width > maxWidth) line = line.slice(0, -1);
      lines.push(`${line}…`);
      rest = '';
    } else {
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
  }
  return lines;
}

/**
 * 把人设头像画成圆底图标：fetch 自托管 Material Symbols SVG、抽出 path 用 Path2D
 * 重绘（颜色可控）。图标坐标系以 SVG 自带 viewBox 为准（这套自托管图标是
 * `0 -960 960 960` 的 960 系，不是 24 系，按 24 硬算会放大 40 倍泼出圆外）。
 * 失败返回 false，调用方降级为首字圆。
 */
async function drawAvatar(ctx, persona, cx, cy, radius) {
  try {
    const res = await fetch(`/assets/icons/${persona.avatar}.svg`);
    if (!res.ok) return false;
    const svg = await res.text();
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (paths.length === 0) return false;
    const vb = (svg.match(/viewBox="([-\d.\s]+)"/)?.[1] ?? '0 0 24 24').trim().split(/\s+/).map(Number);
    const [vx, vy, vw, vh] = vb;
    if (!(vw > 0) || !(vh > 0)) return false;
    ctx.save();
    ctx.fillStyle = INK.edge;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK.amber;
    const box = radius * 1.3;
    const s = box / Math.max(vw, vh);
    ctx.translate(cx - box / 2 - vx * s, cy - box / 2 - vy * s);
    ctx.scale(s, s);
    for (const d of paths) ctx.fill(new Path2D(d));
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

function drawAvatarFallback(ctx, persona, cx, cy, radius) {
  ctx.fillStyle = INK.edge;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.amber;
  ctx.font = font(24, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(persona.name.slice(0, 1), cx, cy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 气泡：按行宽自适应，最多 maxLines 行，返回气泡高度供排布。 */
function drawBubble(ctx, lines, { right = null, left = null, top, fill, edge, textColor }) {
  const pad = 14;
  const lineH = 30;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const w = Math.min(widest + pad * 2, 420);
  const h = lines.length * lineH + pad * 2 - 8;
  const x = right != null ? right - w : left;
  roundRect(ctx, x, top, w, h, 12);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = font(21);
  lines.forEach((line, i) => {
    ctx.fillText(line, x + pad, top + pad + 6 + i * lineH);
  });
  return h;
}

/**
 * 导出战绩图：画完直接触发 PNG 下载（文件名「嘴强王者-称号名.png」）。
 * 头像 / 二维码任一失败都不阻断导出，各自走降级。toBlob 失败静默返回。
 * @param {{duel:object, copy:{headline:string, sub:string}, engine:string}} payload
 */
export async function exportDuelCard({ duel, copy, engine }) {
  const title = pickTitle(duel);
  const quote = pickGoldenQuote(duel);
  const quoteTag = quoteTagFor(duel);
  const isEq = duel.mode === 'extinguish';

  const W = 720;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK.bar;
  ctx.fillRect(0, 0, W, 8);

  // 品牌行 + 结果
  ctx.fillStyle = INK.amber;
  ctx.font = font(22, true);
  ctx.fillText('嘴强王者 · TALK KING', 60, 64);
  ctx.fillStyle = INK.text;
  ctx.font = font(56, true);
  ctx.fillText(copy.headline, 60, 156);
  ctx.fillStyle = INK.muted;
  ctx.font = font(22);
  ctx.fillText(copy.sub, 60, 194);

  // 对手行：头像圆 + 名字
  const avatarOk = await drawAvatar(ctx, duel.persona, 84, 240, 24);
  if (!avatarOk) drawAvatarFallback(ctx, duel.persona, 84, 240, 24);
  ctx.fillStyle = INK.text;
  ctx.font = font(26, true);
  ctx.fillText(`对手 · ${duel.persona.name}`, 124, 250);

  // 金句区：最痛一击问答对（无候选时整卡走兜底文案）
  roundRect(ctx, 60, 288, W - 120, 212, 16);
  ctx.fillStyle = INK.card;
  ctx.fill();
  ctx.strokeStyle = INK.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (quote) {
    ctx.fillStyle = INK.amber;
    ctx.font = font(18, true);
    ctx.fillText(quoteTag, 90, 326);
    ctx.font = font(21);
    const meLines = wrapLines(ctx, `你：${quote.userText}`, 340, 2);
    const meH = drawBubble(ctx, meLines, { right: 630, top: 344, fill: INK.bubbleMe, edge: INK.amber, textColor: INK.text });
    ctx.font = font(21);
    const oppLines = wrapLines(ctx, `TA：${quote.aiReply}`, 340, 2);
    drawBubble(ctx, oppLines, { left: 90, top: 344 + meH + 16, fill: INK.bubbleOpp, edge: INK.edge, textColor: INK.muted });
  } else {
    ctx.fillStyle = INK.muted;
    ctx.font = font(22);
    const lines = wrapLines(ctx, FALLBACK_QUOTE, W - 200, 2);
    lines.forEach((line, i) => ctx.fillText(line, 90, 400 + i * 34));
  }

  // 称号卡
  roundRect(ctx, 60, 524, W - 120, 144, 16);
  ctx.fillStyle = INK.card;
  ctx.fill();
  ctx.strokeStyle = INK.edge;
  ctx.stroke();
  ctx.fillStyle = INK.amber;
  ctx.font = font(22, true);
  ctx.fillText(title.rank, 90, 566);
  ctx.fillStyle = INK.text;
  ctx.font = font(40, true);
  ctx.fillText(title.name, 90, 612);
  ctx.fillStyle = INK.muted;
  ctx.font = font(18);
  wrapLines(ctx, title.desc, W - 220, 2).forEach((line, i) => ctx.fillText(line, 90, 636 + i * 24));

  // 统计 2×2
  const hits = uniqueSoftspotHits(duel);
  const cells = [
    ['回合数', `${duel.rounds.length} / ${MAX_ROUNDS}`],
    [isEq ? '心结命中' : '软肋命中', `${hits} / ${duel.persona.softspots.length}`],
    ['自爆次数', `${duel.selfDestructs} / ${MAX_SELF_DESTRUCTS}`],
    ['最终怒气', `${duel.anger} / 100`],
  ];
  cells.forEach(([label, value], i) => {
    const x = 60 + (i % 2) * 310;
    const y = 704 + Math.floor(i / 2) * 66;
    ctx.fillStyle = INK.muted;
    ctx.font = font(17);
    ctx.fillText(label, x, y);
    ctx.fillStyle = INK.text;
    ctx.font = font(27, true);
    ctx.fillText(value, x, y + 36);
  });

  // 底栏：扫码来战 + 二维码（失败降级为链接文字）
  ctx.strokeStyle = INK.edge;
  ctx.beginPath();
  ctx.moveTo(60, 846);
  ctx.lineTo(W - 60, 846);
  ctx.stroke();
  let qr = null;
  try {
    qr = buildQrMatrix(QR_URL);
  } catch {
    qr = null;
  }
  if (qr) {
    const box = 120;
    const qrX = W - 60 - box;
    const qrY = 852;
    roundRect(ctx, qrX, qrY, box, box, 10);
    ctx.fillStyle = INK.text;
    ctx.fill();
    const zone = 8;
    const span = box - zone * 2;
    const cell = span / qr.size;
    ctx.fillStyle = INK.bg;
    for (let r = 0; r < qr.size; r += 1) {
      for (let c = 0; c < qr.size; c += 1) {
        if (qr.isDark(r, c)) ctx.fillRect(qrX + zone + c * cell, qrY + zone + r * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
  ctx.fillStyle = INK.text;
  ctx.font = font(24, true);
  ctx.fillText('扫码来战', 60, 892);
  ctx.fillStyle = INK.amber;
  ctx.font = font(20);
  ctx.fillText('gang.debugzi.com', 60, 924);
  ctx.fillStyle = INK.muted;
  ctx.font = font(15);
  ctx.fillText(`引擎：${engine}`, 60, 954);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `嘴强王者-${title.name}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
