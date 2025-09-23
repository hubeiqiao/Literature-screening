import '@/lib/config/validateEnv';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { z } from 'zod';
import { buildCriteriaFromText } from '@/lib/criteria';
import { triageRecord } from '@/lib/triage';
import type { CriteriaTextInput } from '@/lib/criteria';
import {
  type ScreeningCriteria,
  type TriageDecision,
  type TokenUsageBreakdown,
  type TriageRunCost,
  type TriageRunRecord,
} from '@/lib/types';
import { getFirestore } from '@/lib/cloud/firestore';
import { authOptions } from '@/lib/auth/options';
import { USAGE_MODES, type UsageMode } from '@/lib/usageMode';
import { getSessionUserId } from '@/lib/auth/session';
import {
  debitBalance,
  getLedgerBalance,
  InsufficientCreditError,
  isLedgerEnabled,
} from '@/lib/billing/ledger';
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  OPENROUTER_MODEL_IDS,
  formatOpenRouterLabel,
  getOpenRouterModel,
  type OpenRouterModelConfig,
  type OpenRouterReasoningEffort,
} from '@/lib/openrouter';
import { buildGeminiPayload, buildOpenRouterPayload, type OpenRouterRequest } from './payloads';

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
  usageMode: z.enum(USAGE_MODES).default('byok'),
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

    const usageMode: UsageMode =
      parsed.provider === 'openrouter' ? parsed.usageMode ?? 'byok' : 'byok';

    let session = null;
    if (parsed.provider === 'openrouter' && usageMode === 'managed') {
      session = await getServerSession(authOptions);
      if (!session) {
        return NextResponse.json(
          { error: 'Sign in required for managed OpenRouter access.' },
          { status: 401 },
        );
      }
    }

    const key = resolveApiKey(request, parsed.provider, usageMode, session);
    if (!key) {
      const label = parsed.provider === 'gemini' ? 'Gemini' : 'OpenRouter';
      return NextResponse.json({ error: `Missing ${label} API key.` }, { status: 401 });
    }

    const criteriaRules = (
      parsed.heuristics ?? buildCriteriaFromText(parsed.instructions as CriteriaTextInput)
    ) as ScreeningCriteria;
    const deterministic = triageRecord(parsed.entry, criteriaRules);

    let providerLabel: string;
    let decisionFromProvider: TriageDecision | null = null;
    let warning: string | undefined;
    let tokenUsage: TokenUsageBreakdown | null = null;
    let rawUsage: OpenRouterUsage | null = null;
    let costSummary: TriageRunCost | null = null;

    if (parsed.provider === 'openrouter') {
      const dataPolicy = request.headers.get('x-openrouter-data-policy')?.trim() || undefined;
      const model = getOpenRouterModel(parsed.model);
      const requestedEffort: ReasoningEffort = parsed.reasoning ?? 'high';
      const effectiveEffort: ReasoningEffort = model.supportsReasoning ? requestedEffort : 'none';
      const payload = buildOpenRouterPayload(
        parsed.entry,
        parsed.instructions as CriteriaTextInput,
        deterministic,
        effectiveEffort,
        model,
      );
      const usageEstimate = estimateOpenRouterUsage(payload);
      const estimatedCostCents = estimateOpenRouterCostCents(model, usageEstimate);
      const ledgerActive = usageMode === 'managed' && isLedgerEnabled();
      let managedUserId: string | null = null;
      let balanceBeforeCents: number | null = null;
      let balanceAfterCents: number | null = null;
      let actualCostCents: number | null = null;

      if (usageMode === 'managed') {
        managedUserId = getSessionUserId(session);
        if (!managedUserId) {
          return NextResponse.json(
            { error: 'Unable to resolve user identity for managed usage.' },
            { status: 403 },
          );
        }
      }

      if (ledgerActive && managedUserId) {
        const firestore = getFirestore();
        const balanceSnapshot = await getLedgerBalance({ firestore, userId: managedUserId });
        balanceBeforeCents = balanceSnapshot.balanceCents;
        if (estimatedCostCents > 0 && balanceSnapshot.balanceCents < estimatedCostCents) {
          return NextResponse.json(
            {
              error: 'Managed credits too low for this run. Add funds before retrying.',
              balanceCents: balanceSnapshot.balanceCents,
              estimatedCostCents,
            },
            { status: 402 },
          );
        }
      }

      const result = await runOpenRouterPass({
        entry: parsed.entry,
        deterministic,
        key,
        dataPolicy,
        model,
        payload,
      });
      decisionFromProvider = result.decision;
      warning = result.warning;
      tokenUsage = result.usage ?? null;
      rawUsage = result.rawUsage ?? null;
      providerLabel = formatOpenRouterLabel(model);

      if (ledgerActive && managedUserId) {
        const firestore = getFirestore();
        actualCostCents = calculateActualCostCents({
          rawUsage,
          tokenUsage,
          model,
          estimatedCostCents,
          fallbackUsage: usageEstimate,
        });

        let amountToDebit = actualCostCents ?? estimatedCostCents ?? 0;
        if (balanceBeforeCents !== null) {
          amountToDebit = Math.min(amountToDebit, Math.max(balanceBeforeCents, 0));
        }

        if (amountToDebit > 0) {
          try {
            const debit = await debitBalance({
              firestore,
              userId: managedUserId,
              amountCents: Math.max(0, Math.round(amountToDebit)),
              metadata: {
                provider: 'openrouter',
                model: model.id,
                usageMode,
                estimatedCostCents,
                actualCostCents: actualCostCents ?? null,
              },
            });
            balanceBeforeCents = debit.previousBalanceCents;
            balanceAfterCents = debit.newBalanceCents;
            actualCostCents = Math.max(0, Math.round(amountToDebit));
          } catch (debitError) {
            if (debitError instanceof InsufficientCreditError) {
              return NextResponse.json(
                {
                  error: 'Managed credits were exhausted while finalizing this run. Please top up and retry.',
                  balanceCents: balanceBeforeCents ?? 0,
                  attemptedDebitCents: Math.max(0, Math.round(amountToDebit)),
                },
                { status: 402 },
              );
            }
            throw debitError;
          }
        } else if (balanceBeforeCents !== null) {
          balanceAfterCents = balanceBeforeCents;
        }

        costSummary = {
          currency: 'usd',
          estimatedCents: estimatedCostCents,
          actualCents: actualCostCents ?? (amountToDebit > 0 ? Math.max(0, Math.round(amountToDebit)) : 0),
          balanceBeforeCents,
          balanceAfterCents,
        };
      }
    } else {
      const result = await runGeminiPass({
        entry: parsed.entry,
        instructions: parsed.instructions as CriteriaTextInput,
        deterministic,
        key,
      });
      decisionFromProvider = result.decision;
      warning = result.warning;
      providerLabel = 'Gemini 2.5 Pro';
    }

    const finalDecision =
      decisionFromProvider ??
      buildFallbackDecision(parsed.entry, deterministic, warning, providerLabel);

    const loggingSession = session ?? (await getServerSession(authOptions));

    await recordTriageRun({
      session: loggingSession,
      provider: parsed.provider,
      usageMode,
      heuristics: criteriaRules,
      decision: finalDecision,
      warning,
      tokenUsage,
      cost: costSummary,
    });

    return NextResponse.json({
      decision: finalDecision,
      warning,
      usage: tokenUsage,
      cost: costSummary,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join('; ') }, { status: 400 });
    }
    console.error('[triage-api] unexpected error', error);
    return NextResponse.json({ error: 'Failed to triage entry.' }, { status: 500 });
  }
}

function resolveApiKey(
  request: Request,
  provider: Provider,
  usageMode: UsageMode,
  session: Session | null,
) {
  if (provider === 'openrouter') {
    if (usageMode === 'managed') {
      if (!session) {
        return undefined;
      }
      return process.env.OPENROUTER_API_KEY?.trim() || undefined;
    }
    return request.headers.get('x-openrouter-key')?.trim() || undefined;
  }
  return request.headers.get('x-gemini-key')?.trim() || process.env.GEMINI_API_KEY || undefined;
}

async function recordTriageRun({
  session,
  provider,
  usageMode,
  heuristics,
  decision,
  warning,
  tokenUsage,
  cost,
}: {
  session: Session | null;
  provider: Provider;
  usageMode: UsageMode;
  heuristics: ScreeningCriteria;
  decision: TriageDecision;
  warning?: string;
  tokenUsage: TokenUsageBreakdown | null;
  cost: TriageRunCost | null;
}) {
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return;
  }

  try {
    const firestore = getFirestore();
    const userId = getSessionUserId(session);
    const record: TriageRunRecord = {
      userId,
      provider,
      usageMode,
      heuristics,
      decision,
      tokenUsage,
      cost: cost ?? null,
      warning: warning ?? null,
      timestamp: new Date().toISOString(),
    };

    await firestore.collection('triageRuns').add(record);
  } catch (error) {
    console.error('[triage-api] failed to record triage run', error);
  }
}

async function runOpenRouterPass({
  entry,
  deterministic,
  key,
  dataPolicy,
  model,
  payload,
}: {
  entry: z.infer<typeof entrySchema>;
  deterministic: ReturnType<typeof triageRecord>;
  key: string;
  dataPolicy?: string;
  model: OpenRouterModelConfig;
  payload: OpenRouterRequest;
}): Promise<{
  decision: TriageDecision | null;
  warning?: string;
  usage: TokenUsageBreakdown | null;
  rawUsage: OpenRouterUsage | null;
}> {
  let lastError: string | undefined;
  const modelLabel = formatOpenRouterLabel(model);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
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
      const usage = parseTokenUsage(completion.usage);
      const rawUsage = completion.usage ?? null;
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
      return { decision, usage, rawUsage };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown OpenRouter error.';
    }
  }

  const warning = lastError
    ? `${modelLabel}: ${lastError}`
    : `${modelLabel}: request failed without details.`;
  return { decision: null, warning, usage: null, rawUsage: null };
}

function parseTokenUsage(usage?: OpenRouterUsage | null): TokenUsageBreakdown | null {
  if (!usage) {
    return null;
  }

  const tokenUsage: TokenUsageBreakdown = {};

  if (typeof usage.prompt_tokens === 'number') {
    tokenUsage.promptTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === 'number') {
    tokenUsage.completionTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === 'number') {
    tokenUsage.totalTokens = usage.total_tokens;
  }

  return Object.keys(tokenUsage).length > 0 ? tokenUsage : null;
}

interface UsageEstimate {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const COST_ESTIMATE_BUFFER = 1.35;

function estimateOpenRouterUsage(payload: OpenRouterRequest): UsageEstimate {
  const promptCharacters = payload.messages.reduce((total, message) => total + message.content.length, 0);
  const promptTokens = Math.max(400, Math.ceil(promptCharacters / 3.8));
  const completionRatio = payload.reasoning ? 0.65 : 0.5;
  const completionEstimate = Math.round(payload.max_tokens * completionRatio);
  const completionTokens = Math.max(512, Math.min(payload.max_tokens, completionEstimate));
  const totalTokens = promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function estimateOpenRouterCostCents(model: OpenRouterModelConfig, usage: UsageEstimate): number {
  const pricing = model.pricing;
  if (!pricing) {
    return 0;
  }
  const promptUsd = (usage.promptTokens / 1000) * pricing.promptCostPer1K;
  const completionUsd = (usage.completionTokens / 1000) * pricing.completionCostPer1K;
  const bufferedUsd = (promptUsd + completionUsd) * COST_ESTIMATE_BUFFER;
  const cents = Math.round(bufferedUsd * 100);
  const minimum = pricing.minimumChargeCents ?? 0;
  return Math.max(cents, minimum);
}

function calculateActualCostCents({
  rawUsage,
  tokenUsage,
  model,
  estimatedCostCents,
  fallbackUsage,
}: {
  rawUsage: OpenRouterUsage | null;
  tokenUsage: TokenUsageBreakdown | null;
  model: OpenRouterModelConfig;
  estimatedCostCents: number;
  fallbackUsage: UsageEstimate;
}): number {
  const directCostUsd =
    extractUsdCost(rawUsage?.total_cost) ?? extractUsdCost(rawUsage?.estimated_cost);
  if (directCostUsd != null) {
    return Math.max(0, Math.round(directCostUsd * 100));
  }

  const promptCostUsd = extractUsdCost(rawUsage?.prompt_cost);
  const completionCostUsd = extractUsdCost(rawUsage?.completion_cost);
  if (promptCostUsd != null || completionCostUsd != null) {
    const totalUsd = (promptCostUsd ?? 0) + (completionCostUsd ?? 0);
    return Math.max(0, Math.round(totalUsd * 100));
  }

  const pricing = model.pricing;
  if (pricing) {
    const promptTokens =
      tokenUsage?.promptTokens ??
      (typeof rawUsage?.prompt_tokens === 'number' ? rawUsage.prompt_tokens : fallbackUsage.promptTokens);
    const completionTokens =
      tokenUsage?.completionTokens ??
      (typeof rawUsage?.completion_tokens === 'number'
        ? rawUsage.completion_tokens
        : fallbackUsage.completionTokens);
    const promptUsd = (promptTokens / 1000) * pricing.promptCostPer1K;
    const completionUsd = (completionTokens / 1000) * pricing.completionCostPer1K;
    const cents = Math.max(
      Math.round((promptUsd + completionUsd) * 100),
      pricing.minimumChargeCents ?? 0,
    );
    if (cents > 0) {
      return cents;
    }
  }

  return estimatedCostCents > 0 ? estimatedCostCents : 0;
}

function extractUsdCost(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.usd === 'number') {
      return record.usd;
    }
    if (typeof record.amount === 'number') {
      return record.amount;
    }
    if (typeof record.value === 'number') {
      return record.value;
    }
  }
  return null;
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

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  total_cost?: unknown;
  prompt_cost?: unknown;
  completion_cost?: unknown;
  estimated_cost?: unknown;
}

interface OpenRouterResponse {
  choices: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
    content?: string;
  }>;
  usage?: OpenRouterUsage;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    output?: string;
  }>;
}
