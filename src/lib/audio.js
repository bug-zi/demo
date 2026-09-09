/**
 * 极简音效：不加载任何音频文件，用 WebAudio 现场合成几个 blip。
 * 默认关闭，用户点顶栏开关才开——免得演示时突然出声。
 */

let ctx = null;
let enabled = false;

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  if (enabled && !ctx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) ctx = new AudioCtor();
  }
  if (enabled && ctx && ctx.state === 'suspended') ctx.resume();
}

function tone({ freq, duration, type = 'sine', gain = 0.06, delay = 0 }) {
  if (!enabled || !ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const RECIPES = {
  send: [{ freq: 620, duration: 0.08, type: 'triangle' }],
  reply: [{ freq: 420, duration: 0.1, type: 'sine' }],
  hit: [
    { freq: 520, duration: 0.09, type: 'square', gain: 0.04 },
    { freq: 700, duration: 0.1, type: 'square', gain: 0.04, delay: 0.07 },
  ],
  softspot: [
    { freq: 880, duration: 0.1, type: 'sawtooth', gain: 0.05 },
    { freq: 1180, duration: 0.12, type: 'sawtooth', gain: 0.05, delay: 0.08 },
  ],
  self_destruct: [{ freq: 160, duration: 0.3, type: 'sawtooth', gain: 0.07 }],
  breakdown: [
    { freq: 300, duration: 0.35, type: 'sawtooth', gain: 0.06 },
    { freq: 220, duration: 0.5, type: 'sawtooth', gain: 0.06, delay: 0.22 },
  ],
};

export function blip(kind) {
  const recipe = RECIPES[kind];
  if (!recipe) return;
  recipe.forEach(tone);
}
