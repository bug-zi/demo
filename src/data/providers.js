/** 设置界面用的服务商清单与一键预设。 */

export const PROVIDER_OPTIONS = [
  {
    id: 'local',
    label: '本地引擎',
    hint: '不用 key，台词来自内置模板。永远跑得通。',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    hint: 'Anthropic 官方 API，走官方 SDK。',
  },
  {
    id: 'openai',
    label: 'OpenAI 兼容',
    hint: 'DeepSeek / 通义 / Kimi / 智谱 / Ollama / 自建网关…',
  },
];

/**
 * 选一个预设就把 baseUrl + model 填好。
 * baseUrl 留空表示用该服务商的官方默认地址。
 */
export const PROVIDER_PRESETS = {
  anthropic: [
    { label: 'Claude Opus 5', model: 'claude-opus-5', baseUrl: '' },
    { label: 'Claude Haiku 4.5（更快）', model: 'claude-haiku-4-5', baseUrl: '' },
  ],
  openai: [
    { label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
    {
      label: '通义千问',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    { label: 'Kimi (Moonshot)', model: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1' },
    { label: '智谱 GLM', model: 'glm-4-plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    { label: 'OpenAI', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
    { label: '本地 Ollama', model: 'qwen2.5:7b', baseUrl: 'http://localhost:11434/v1' },
    { label: '自定义', model: '', baseUrl: '' },
  ],
};

export function presetList(provider) {
  return PROVIDER_PRESETS[provider] || [];
}
