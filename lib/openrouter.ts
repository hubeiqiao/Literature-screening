export type OpenRouterReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export const OPENROUTER_MODELS = [
  {
    id: 'x-ai/grok-4-fast:free',
    label: 'xAI Grok-4 (fast, free)',
    supportsReasoning: true,
    promptCharacterLimit: 2_000_000,
    maxTokens: 8192,
  },
  {
    id: 'x-ai/grok-4-fast',
    label: 'xAI Grok-4 (fast)',
    supportsReasoning: true,
    promptCharacterLimit: 2_000_000,
    maxTokens: 8192,
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'OpenAI GPT-OSS-120B',
    supportsReasoning: true,
    promptCharacterLimit: 12_000,
    maxTokens: 4096,
  },
] as const;

export type OpenRouterModelConfig = (typeof OPENROUTER_MODELS)[number];
export type OpenRouterModelId = OpenRouterModelConfig['id'];

export const OPENROUTER_MODEL_IDS = OPENROUTER_MODELS.map((model) => model.id) as [
  OpenRouterModelId,
  ...OpenRouterModelId[],
];

export const DEFAULT_OPENROUTER_MODEL_ID: OpenRouterModelId = 'x-ai/grok-4-fast:free';

const DEFAULT_OPENROUTER_MODEL =
  OPENROUTER_MODELS.find((model) => model.id === DEFAULT_OPENROUTER_MODEL_ID) ?? OPENROUTER_MODELS[0];

export function isOpenRouterModelId(value: string): value is OpenRouterModelId {
  return OPENROUTER_MODEL_IDS.includes(value as OpenRouterModelId);
}

export function getOpenRouterModel(id: string): OpenRouterModelConfig {
  return OPENROUTER_MODELS.find((model) => model.id === id) ?? DEFAULT_OPENROUTER_MODEL;
}

export function formatOpenRouterLabel(model: OpenRouterModelConfig) {
  return `OpenRouter — ${model.label}`;
}
