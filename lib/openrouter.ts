export interface OpenRouterModel {
  value: string;
  label: string;
  supportsReasoning: boolean;
}

export const OPENROUTER_MODELS = [
  {
    value: 'openai/gpt-oss-120b',
    label: 'OpenAI GPT-OSS 120B',
    supportsReasoning: true,
  },
  {
    value: 'x-ai/grok-4-fast:free',
    label: 'xAI Grok 4 Fast (free tier)',
    supportsReasoning: false,
  },
] as const satisfies ReadonlyArray<OpenRouterModel>;

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODELS[0];

export function findOpenRouterModel(value: string | null | undefined) {
  return OPENROUTER_MODELS.find((model) => model.value === value);
}

export function openRouterSupportsReasoning(value: string | null | undefined) {
  return findOpenRouterModel(value)?.supportsReasoning ?? false;
}
