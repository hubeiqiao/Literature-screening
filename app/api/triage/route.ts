import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCriteriaFromText } from '@/lib/criteria';
import { triageRecord } from '@/lib/triage';
import type { CriteriaTextInput } from '@/lib/criteria';
import type { ScreeningCriteria, TriageDecision } from '@/lib/types';
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  OPENROUTER_MODEL_IDS,
  formatOpenRouterLabel,
  getOpenRouterModel,
  type OpenRouterModelConfig,
  type OpenRouterReasoningEffort,
} from '@/lib/openrouter';
import { buildGeminiPayload, buildOpenRouterPayload } from './payloads';

type Provider = 'openrouter' | 'gemini';
type ReasoningEffort = OpenRouterReasoningEffort;

const fieldMapSchema = z.record(z.string());

const entrySchema = z.object({
  type: z.string().min(1),
  key: z.string().min(1),
  fields: fieldMapSchema,
});

const ruleSchema = z.object({
  id: z.string().min(1),
  terms: z.array(z.string().min(1)),
  scope: z.enum(['keywords']).optional(),
});

const criteriaSchema = z.object({
  inclusion: z.array(ruleSchema),
  exclusion: z.array(ruleSchema),
});

const instructionsSchema = z.object({
  inclusion: z.string().min(1),
  exclusion: z.string().min(1),
});

const baseRequestSchema = z.object({
  entry: entrySchema,
  instructions: instructionsSchema,
  heuristics: criteriaSchema.optional(),
});

const openRouterRequestSchema = baseRequestSchema.extend({
  provider: z.literal('openrouter'),
  reasoning: z.enum(['none', 'minimal', 'low', 'medium', 'high']).optional(),
  model: z.enum(OPENROUTER_MODEL_IDS).default(DEFAULT_OPENROUTER_MODEL_ID),
});

const geminiRequestSchema = baseRequestSchema.extend({
  provider: z.literal('gemini'),
});

const requestSchema = z.discriminatedUnion('provider', [openRouterRequestSchema, geminiRequestSchema]);

const MAX_ATTEMPTS = 2;
const GEMINI_MODEL = 'gemini-2.5-pro';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.parse(json);

    const key = resolveApiKey(request, parsed.provider);
    if (!key) {
      const label = parsed.provider === 'gemini' ? 'Gemini' : 'OpenRouter';
      return NextResponse.json({ error: `Missing ${label} API key.` }, { status: 401 });
    }

    const criteriaRules =
      parsed.heuristics ?? buildCriteriaFromText(parsed.instructions as CriteriaTextInput);
    const deterministic = triageRecord(parsed.entry, criteriaRules as ScreeningCriteria);

    let providerLabel: string;
    let result: { decision: TriageDecision | null; warning?: string };

    if (parsed.provider === 'openrouter') {
      const dataPolicy = request.headers.get('x-openrouter-data-policy')?.trim() || undefined;
      const model = getOpenRouterModel(parsed.model);
      result = await runOpenRouterPass({
        entry: parsed.entry,
        instructions: parsed.instructions as CriteriaTextInput,
        deterministic,
        key,
        dataPolicy,
        effort: parsed.reasoning ?? 'high',
        model,
      });
      providerLabel = formatOpenRouterLabel(model);
    } else {
      result = await runGeminiPass({
        entry: parsed.entry,
        instructions: parsed.instructions as CriteriaTextInput,
        deterministic,
        key,
      });
      providerLabel = 'Gemini 2.5 Pro';
    }

    if (result.decision) {
      return NextResponse.json({ decision: result.decision, warning: result.warning });
    }

    const fallback = buildFallbackDecision(parsed.entry, deterministic, result.warning, providerLabel);
    return NextResponse.json({ decision: fallback, warning: result.warning });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join('; ') }, { status: 400 });
    }
    console.error('[triage-api] unexpected error', error);
    return NextResponse.json({ error: 'Failed to triage entry.' }, { status: 500 });
  }
}

function resolveApiKey(request: Request, provider: Provider) {
  if (provider === 'openrouter') {
    return request.headers.get('x-openrouter-key')?.trim() || process.env.OPENROUTER_API_KEY || undefined;
  }
  return request.headers.get('x-gemini-key')?.trim() || process.env.GEMINI_API_KEY || undefined;
}

async function runOpenRouterPass({
  entry,
  instructions,
  deterministic,
  key,
  dataPolicy,
  effort,
  model,
}: {
  entry: z.infer<typeof entrySchema>;
  instructions: CriteriaTextInput;
  deterministic: ReturnType<typeof triageRecord>;
  key: string;
  dataPolicy?: string;
  effort: ReasoningEffort;
  model: OpenRouterModelConfig;
}): Promise<{ decision: TriageDecision | null; warning?: string }> {
  let lastError: string | undefined;
  const modelLabel = formatOpenRouterLabel(model);
  const effectiveEffort = model.supportsReasoning ? effort : 'none';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = buildOpenRouterPayload(entry, instructions, deterministic, effectiveEffort, model);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://literature-screening.local/',
        'X-Title': 'Literature Screening Assistant',
      };
      if (dataPolicy) {
        headers['X-OpenRouter-Data-Policy'] = dataPolicy;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = formatOpenRouterError(response.status, body);
        if (response.status >= 400 && response.status < 500) {
          break;
        }
        continue;
      }

      const completion: OpenRouterResponse = await response.json();
      const content = extractOpenRouterContent(completion);
      if (!content) {
        lastError = 'OpenRouter response missing content.';
        continue;
      }

      const parsed = safeParseLLMJson(content);
      if (!parsed) {
        lastError = 'Failed to parse OpenRouter JSON response.';
        continue;
      }

      const decision = buildDecision(entry, deterministic, parsed, modelLabel);
      return { decision };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown OpenRouter error.';
    }
  }

  const warning = lastError
    ? `${modelLabel}: ${lastError}`
    : `${modelLabel}: request failed without details.`;
  return { decision: null, warning };
}

async function runGeminiPass({
  entry,
  instructions,
  deterministic,
  key,
}: {
  entry: z.infer<typeof entrySchema>;
  instructions: CriteriaTextInput;
  deterministic: ReturnType<typeof triageRecord>;
  key: string;
}): Promise<{ decision: TriageDecision | null; warning?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const useSimpleMode = attempt > 1;
    try {
      const payload = buildGeminiPayload(entry, instructions, deterministic, useSimpleMode);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        lastError = formatGeminiError(response.status, body);
        if (response.status === 429) {
          await sleep(500 * attempt);
          continue;
        }
        if (response.status === 400 && !useSimpleMode) {
          // retry with simplified payload next iteration
          continue;
        }
        if (response.status >= 400 && response.status < 500) {
          break;
        }
        continue;
      }

      const completion: GeminiResponse = await response.json();
      const content = extractGeminiContent(completion);
      if (!content) {
        lastError = 'Gemini response missing content.';
        await sleep(250 * attempt);
        continue;
      }

      const parsed = safeParseLLMJson(content) ?? extractJsonBlock(content);
      if (!parsed) {
        lastError = 'Failed to parse Gemini JSON response.';
        await sleep(250 * attempt);
        continue;
      }

      const decision = buildDecision(entry, deterministic, parsed, 'google/gemini-2.5-pro');
      return { decision };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown Gemini error.';
    }
  }

  return { decision: null, warning: lastError ? `Gemini: ${lastError}` : 'Gemini failed without details.' };
}

function buildDecision(
  entry: z.infer<typeof entrySchema>,
  deterministic: ReturnType<typeof triageRecord>,
  llm: { status?: string; confidence?: number; rationale?: string; criteria_refs?: string[] },
  modelName: string,
): TriageDecision {
  const status = normalizeStatus(llm.status) || deterministic.status;
  const confidence = typeof llm.confidence === 'number' ? clamp(llm.confidence, 0, 1) : deterministic.confidence;

  return {
    key: entry.key,
    type: entry.type,
    title: entry.fields.title || '',
    year: entry.fields.year || '',
    status,
    confidence,
    inclusionMatches: deterministic.inclusionMatches,
    exclusionMatches: deterministic.exclusionMatches,
    rationale: llm.rationale ?? 'No rationale provided.',
    model: modelName,
    source: 'llm',
  };
}

function buildFallbackDecision(
  entry: z.infer<typeof entrySchema>,
  deterministic: ReturnType<typeof triageRecord>,
  warning: string | undefined,
  providerLabel: string,
): TriageDecision {
  return {
    key: entry.key,
    type: entry.type,
    title: entry.fields.title || '',
    year: entry.fields.year || '',
    status: deterministic.status,
    confidence: deterministic.confidence,
    inclusionMatches: deterministic.inclusionMatches,
    exclusionMatches: deterministic.exclusionMatches,
    rationale:
      warning
        ? `LLM fallback (${providerLabel}): ${warning}. Decision reflects deterministic heuristics.`
        : `LLM fallback (${providerLabel}): heuristics decision.`,
    model: 'deterministic-rules',
    source: 'deterministic',
  };
}

function normalizeStatus(status?: string) {
  if (!status) {
    return null;
  }
  const normalized = status.toLowerCase();
  if (normalized === 'include') return 'Include';
  if (normalized === 'exclude') return 'Exclude';
  if (normalized === 'maybe') return 'Maybe';
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeParseLLMJson(raw: string) {
  const stripped = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (error) {
    return null;
  }
}

function extractJsonBlock(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

function extractOpenRouterContent(completion: OpenRouterResponse): string | null {
  const choice = completion.choices?.[0];
  if (!choice) {
    return null;
  }

  const messageContent = choice.message?.content;
  if (typeof messageContent === 'string') {
    return messageContent;
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((segment) => ('text' in segment ? segment.text : typeof segment === 'string' ? segment : ''))
      .join('')
      .trim();
  }

  const topLevelContent = (choice as { content?: unknown }).content;
  if (typeof topLevelContent === 'string') {
    return topLevelContent;
  }

  return null;
}

function extractGeminiContent(response: GeminiResponse): string | null {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return null;
  }

  const parts = candidate.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part) => ('text' in part && part.text ? part.text : typeof part === 'string' ? part : ''))
      .join('')
      .trim();
  }

  if (typeof candidate.output === 'string') {
    return candidate.output;
  }

  return null;
}

function formatOpenRouterError(status: number, body: string) {
  if (status === 404 && body.includes('data policy')) {
    return 'OpenRouter could not match your current data policy to the selected model. Adjust privacy settings at https://openrouter.ai/settings/privacy or use a paid tier.';
  }
  if (status === 400 && body.includes('maximum context length')) {
    return 'Prompt exceeds model context window. Try shortening criteria text or abstracts.';
  }
  if (status === 402) {
    return 'OpenRouter indicates insufficient credits for this request.';
  }
  return body.slice(0, 280);
}

function formatGeminiError(status: number, body: string) {
  if (status === 400 && body.includes('INVALID_ARGUMENT')) {
    return 'Gemini rejected the request (invalid argument). Consider simplifying criteria or record content.';
  }
  if (status === 429) {
    return 'Gemini rate limit reached. Wait before retrying or reduce request frequency.';
  }
  if (status === 403) {
    return 'Gemini API key lacks permission for gemini-2.5-pro. Enable the model in Google AI Studio or Cloud.';
  }
  return body.slice(0, 280);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpenRouterResponse {
  choices: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
    content?: string;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    output?: string;
  }>;
}
