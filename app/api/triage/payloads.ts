import type { CriteriaTextInput } from '@/lib/criteria';
import type { triageRecord } from '@/lib/triage';
import type { OpenRouterModelConfig, OpenRouterReasoningEffort } from '@/lib/openrouter';

const GEMINI_THINKING_BUDGET = 4096;

type DeterministicResult = ReturnType<typeof triageRecord>;

type Entry = {
  type: string;
  key: string;
  fields: Record<string, string>;
};

export interface OpenRouterRequest {
  model: OpenRouterModelConfig['id'];
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens: number;
  temperature: number;
  reasoning?: {
    enabled: true;
    effort: Exclude<OpenRouterReasoningEffort, 'none'>;
  };
}

export interface GeminiRequest {
  systemInstruction?: {
    parts: Array<{ text?: string }>;
  };
  contents: Array<{
    role: string;
    parts: Array<{ text?: string }>;
  }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType?: string;
  };
  thinkingConfig?: {
    thinkingBudget?: number;
  };
}

export function buildOpenRouterPayload(
  entry: Entry,
  instructions: CriteriaTextInput,
  deterministic: DeterministicResult,
  effort: OpenRouterReasoningEffort,
  model: OpenRouterModelConfig,
): OpenRouterRequest {
  const userPrompt = buildUserPrompt(entry, instructions, deterministic, model.promptCharacterLimit);

  const messages: OpenRouterRequest['messages'] = [
    {
      role: 'system',
      content:
        'You are a rigorous systematic review screening assistant. Always return valid JSON with keys: status, confidence, rationale, criteria_refs, model.',
    },
    {
      role: 'user',
      content: JSON.stringify(userPrompt),
    },
  ];

  const request: OpenRouterRequest = {
    model: model.id,
    messages,
    max_tokens: model.maxTokens,
    temperature: 0,
  };

  if (effort !== 'none' && model.supportsReasoning) {
    request.reasoning = { enabled: true, effort };
  }

  return request;
}

export function buildGeminiPayload(
  entry: Entry,
  instructions: CriteriaTextInput,
  deterministic: DeterministicResult,
  simpleMode: boolean,
): GeminiRequest {
  const limit = simpleMode ? 2500 : 4000;
  const userPrompt = buildUserPrompt(entry, instructions, deterministic, limit);

  const request: GeminiRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: JSON.stringify(userPrompt) }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: simpleMode ? 1024 : 2048,
    },
  };

  if (!simpleMode) {
    request.systemInstruction = {
      parts: [{ text: 'You are a systematic review screening assistant. Respond with strict JSON only.' }],
    };
    request.generationConfig.responseMimeType = 'application/json';
    request.thinkingConfig = {
      thinkingBudget: Math.min(GEMINI_THINKING_BUDGET, 2048),
    };
  }

  return request;
}

function buildUserPrompt(
  entry: Entry,
  instructions: CriteriaTextInput,
  deterministic: DeterministicResult,
  limit: number,
) {
  const record = extractRecordFields(entry);
  const trimmedInstructions = {
    inclusion: truncate(instructions.inclusion, limit),
    exclusion: truncate(instructions.exclusion, limit),
  } satisfies CriteriaTextInput;

  return {
    record,
    instructions: trimmedInstructions,
    deterministic,
    expected_json: {
      status: 'Include | Exclude | Maybe',
      confidence: '0-1 number',
      rationale: '50-150 word explanation citing criteria IDs',
      criteria_refs: 'array of criteria IDs referenced',
    },
  };
}

function extractRecordFields(entry: Entry) {
  const keywords = (entry.fields.keywords || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    key: entry.key,
    type: entry.type,
    title: entry.fields.title || '',
    abstract: entry.fields.abstract || '',
    keywords,
    year: entry.fields.year || '',
    notes: entry.fields.note || entry.fields.notes || '',
    venue: entry.fields.journal || entry.fields.booktitle || '',
  };
}

function truncate(text: string, limit: number) {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}
