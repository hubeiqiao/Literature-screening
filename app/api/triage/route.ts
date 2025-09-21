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
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
          key,
        )}`,
        {
          method: 'POST',