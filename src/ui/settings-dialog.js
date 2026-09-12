/**
 * 「接入你的 AI」设置弹窗。
 *
 * 挂在 document.body 上，不走 main.js 的 render() —— 因为 render() 会
 * stopTimer() + 清空 #screen，中途打开设置会把正在进行的对局直接抹掉。
 * 取而代之：打开时 onPause 暂停对局计时，关闭时 onResume 恢复。
 */

import { h } from '../lib/dom.js';
import { PROVIDER_OPTIONS, presetList } from '../data/providers.js';
import { loadSettings, saveSettings, clearSettings, maskKey } from '../lib/settings.js';
import { ROUND_SECONDS_OPTIONS, loadRoundSeconds, saveRoundSeconds } from '../lib/duel-options.js';
import { loadProfile, saveProfile } from '../lib/profile.js';
import { testConnection } from '../lib/llm.js';
import { blip } from '../lib/audio.js';
import { applyTheme, onTheme } from '../lib/theme.js';

const HINTS = Object.fromEntries(PROVIDER_OPTIONS.map((p) => [p.id, p.hint]));

// 推理型模型的思考过程和答案共用 max_tokens，历史一长答案就没了 ——
// 玩家会看到「本地兜底」，却不知道是自己选的模型不对。这里提前提醒。
const REASONING_MODEL = /reasoner|reasoning|-r1\b|^r1|qwq|thinking|-z1\b|^o[1-9]/i;

function field(label, control) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    control,
  );
}

/**
 * @param {{onPause?:Function, onResume?:Function, onChange?:Function}} hooks
 */
export function openSettings({ onPause, onResume, onChange } = {}) {
  if (document.querySelector('.modal-backdrop')) return;

  const draft = { ...loadSettings() };
  // 回合时限与「外观」一样点击即时落盘，不进 AI draft、不受「清除」影响
  const currentRound = loadRoundSeconds();
  let keyVisible = false;
  let busy = false;

  const status = h('p', { class: 'modal-status' });
  const body = h('div', { class: 'modal-body' });

  const setStatus = (text, kind = '') => {
    status.textContent = text || '';
    status.className = `modal-status${kind ? ` is-${kind}` : ''}`;
  };

  const focusKey = () => body.querySelector('.key-row input')?.focus();

  /* ---------------- 表单 ---------------- */

  function providerButton(option) {
    return h('button', {
      class: `seg-btn${draft.provider === option.id ? ' is-active' : ''}`,
      type: 'button',
      text: option.label,
      'aria-pressed': String(draft.provider === option.id),
      onclick: () => {
        if (draft.provider === option.id) return;
        draft.provider = option.id;
        setStatus('');
        renderBody();
      },
    });
  }

  function presetSelect() {
    const presets = presetList(draft.provider);
    if (presets.length === 0) return null;
    return field(
      '快速选择',
      h(
        'select',
        {
          class: 'input',
          onchange: (event) => {
            const preset = presets[Number(event.target.value)];
            if (!preset) return;
            draft.model = preset.model;
            draft.baseUrl = preset.baseUrl;
            renderBody();
            focusKey();
          },
        },
        h('option', { value: '', text: '选一个服务商，自动填好地址和模型…' }),
        ...presets.map((preset, index) =>
          h('option', { value: String(index), text: preset.label }),
        ),
      ),
    );
  }

  function keyField() {
    const input = h('input', {
      class: 'input',
      type: keyVisible ? 'text' : 'password',
      value: draft.apiKey,
      placeholder: draft.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
      autocomplete: 'off',
      spellcheck: 'false',
      oninput: (event) => {
        draft.apiKey = event.target.value;
      },
    });
    return field(
      // 把当前 key 的尾巴露出来，用户才知道自己配的是哪一把
      draft.apiKey ? `API Key（当前 ${maskKey(draft.apiKey)}）` : 'API Key',
      h(
        'div',
        { class: 'key-row' },
        input,
        h('button', {
          class: 'ghost-btn',
          type: 'button',
          text: keyVisible ? '隐藏' : '显示',
          onclick: () => {
            keyVisible = !keyVisible;
            renderBody();
            focusKey();
          },
        }),
      ),
    );
  }

  function textField(label, key, placeholder, onInput) {
    return field(
      label,
      h('input', {
        class: 'input',
        type: 'text',
        value: draft[key],
        placeholder,
        spellcheck: 'false',
        oninput: (event) => {
          draft[key] = event.target.value;
          onInput?.();
        },
      }),
    );
  }

  /** 模型名一改就跟着变，不用等重绘（重绘会把光标弄丢）。 */
  function syncWarn() {
    const node = body.querySelector('.field-warn');
    if (node) node.hidden = !REASONING_MODEL.test(draft.model);
  }

  function renderBody() {
    body.replaceChildren(
      h('div', { class: 'segmented' }, PROVIDER_OPTIONS.map(providerButton)),
      h('p', { class: 'field-hint', text: HINTS[draft.provider] || '' }),
    );

    if (draft.provider === 'local') {
      body.append(
        h('p', {
          class: 'footnote',
          text: '现在用的是内置模板引擎。台词写死了，但永远跑得通，也不花钱。',
        }),
      );
      return;
    }

    body.append(
      presetSelect(),
      keyField(),
      textField(
        '模型名',
        'model',
        draft.provider === 'anthropic' ? 'claude-opus-5' : 'deepseek-chat',
        syncWarn,
      ),
      h('p', {
        class: 'field-warn',
        text: '这是推理型模型：思考过程会吃掉输出额度，聊几轮之后可能回不出话（游戏里会显示「本地兜底」）。换成对话模型（deepseek-chat 之类）更稳。',
      }),
      textField(
        draft.provider === 'anthropic' ? 'Base URL（走代理才需要）' : 'Base URL',
        'baseUrl',
        draft.provider === 'anthropic' ? '留空就用官方地址' : 'https://api.deepseek.com/v1',
      ),
      h('p', {
        class: 'footnote',
        text:
          'key 只存在这台浏览器的 localStorage 里，共用电脑请用完点「清除」。' +
          '填了地址就等于把 key 发给那个地址 —— 别填来路不明的。' +
          '另外：不少服务商不允许浏览器直连（跨域），连不上是对方侧的限制，不是你填错了。',
      }),
    );
    syncWarn();
  }

  /* ---------------- 动作 ---------------- */

  const testBtn = h('button', {
    class: 'btn',
    type: 'button',
    text: '测试连接',
    onclick: runTest,
  });

  async function runTest() {
    if (busy) return;
    busy = true;
    testBtn.disabled = true;
    setStatus('正在测试…');
    const result = await testConnection({ ...draft });
    busy = false;
    testBtn.disabled = false;
    const suffix = result.ms ? `（${result.ms}ms）` : '';
    setStatus(`${result.message}${suffix}`, result.ok ? 'ok' : 'error');
    blip(result.ok ? 'hit' : 'self_destruct');
  }

  function runSave() {
    if (draft.provider !== 'local' && !draft.apiKey.trim()) {
      setStatus('先填 API Key', 'error');
      focusKey();
      return;
    }
    if (draft.provider === 'openai' && !draft.model.trim()) {
      setStatus('OpenAI 兼容这一路还得填模型名', 'error');
      return;
    }
    Object.assign(draft, saveSettings(draft));
    onChange?.();
    blip('hit');
    close();
  }

  function runClear() {
    Object.assign(draft, clearSettings());
    keyVisible = false;
    setStatus('已清除，回到本地引擎', 'ok');
    onChange?.();
    renderBody();
  }

  /* ---------------- 开关 ---------------- */

  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };

  function close() {
    offTheme();
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
    onResume?.();
  }

  /** 演示模式即时落盘（不进 AI draft），走 onChange 让主屏重读成长档。 */
  function demoSegButton(next, label) {
    const active = loadProfile().demoMode === next;
    return h('button', {
      class: `demo-seg-btn${active ? ' is-active' : ''}`,
      type: 'button',
      text: label,
      'aria-pressed': String(active),
      onclick: (event) => {
        const p = loadProfile();
        if (p.demoMode !== next) {
          p.demoMode = next;
          saveProfile(p);
          onChange?.();
        }
        event.currentTarget.parentElement.querySelectorAll('.demo-seg-btn').forEach((btn) => {
          const on = btn === event.currentTarget;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', String(on));
        });
      },
    });
  }

  const backdrop = h(
    'div',
    {
      class: 'modal-backdrop',
      onclick: (event) => {
        if (event.target === backdrop) close();
      },
    },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '接入你的 AI' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { class: 'modal-title', text: '接入你的 AI' }),
        h('button', {
          class: 'ghost-btn',
          type: 'button',
          'aria-label': '关闭',
          onclick: close,
        }, h('span', { class: 'icon i-close', 'aria-hidden': 'true' })),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'field-label', text: '外观' }),
        h('div', { class: 'theme-seg' },
          h('button', { class: 'theme-seg-btn', type: 'button', text: '浅色', onclick: () => applyTheme('light') }),
          h('button', { class: 'theme-seg-btn', type: 'button', text: '深色', onclick: () => applyTheme('dark') }),
        ),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'field-label', text: '对局' }),
        h('div', { class: 'round-seg' },
          ...ROUND_SECONDS_OPTIONS.map((option) =>
            h('button', {
              class: `round-seg-btn${currentRound === option.value ? ' is-active' : ''}`,
              type: 'button',
              text: option.label,
              'aria-pressed': String(currentRound === option.value),
              onclick: (event) => {
                saveRoundSeconds(option.value);
                event.currentTarget.parentElement.querySelectorAll('.round-seg-btn').forEach((btn) => {
                  const on = btn === event.currentTarget;
                  btn.classList.toggle('is-active', on);
                  btn.setAttribute('aria-pressed', String(on));
                });
              },
            }),
          ),
        ),
        h('p', { class: 'field-hint', text: '回合时限，改动从下一局开始生效。' }),
        h('div', { class: 'demo-seg' },
          demoSegButton(false, '关'),
          demoSegButton(true, '开'),
        ),
        h('p', { class: 'field-hint', text: '演示模式：无限生命，评审与现场演示用。' }),
      ),
      body,
      status,
      h(
        'div',
        { class: 'modal-actions' },
        testBtn,
        h('button', { class: 'btn', type: 'button', text: '清除', onclick: runClear }),
        h('button', { class: 'btn primary', type: 'button', text: '保存', onclick: runSave }),
      ),
    ),
  );

  const offTheme = onTheme((theme) => {
    backdrop.querySelectorAll('.theme-seg-btn').forEach((btn) => {
      btn.classList.toggle(
        'is-active',
        btn.textContent === (theme === 'light' ? '浅色' : '深色'),
      );
    });
  });

  document.body.append(backdrop);
  document.addEventListener('keydown', onKeydown);
  renderBody();
  onPause?.();
  focusKey();
}
