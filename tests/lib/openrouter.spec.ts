import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  OPENROUTER_MODELS,
  formatOpenRouterLabel,
  getOpenRouterModel,
  isOpenRouterModelId,
} from '@/lib/openrouter';

describe('openrouter configuration', () => {
  it('exposes grok-4 fast free as the default OpenRouter model', () => {
    const config = getOpenRouterModel(DEFAULT_OPENROUTER_MODEL_ID);
    expect(config.id).toBe('x-ai/grok-4-fast:free');
    expect(config.supportsReasoning).toBe(true);
    expect(config.promptCharacterLimit).toBe(2_000_000);
    expect(config.maxTokens).toBe(8192);
  });

  it('includes the paid grok-4 fast tier with reasoning support', () => {
    const paidTier = OPENROUTER_MODELS.find((model) => model.id === 'x-ai/grok-4-fast');
    expect(paidTier).toBeDefined();
    expect(paidTier?.supportsReasoning).toBe(true);
  });

  it('falls back to the default model for unknown identifiers', () => {
    const fallback = getOpenRouterModel('unknown/model');
    expect(fallback.id).toBe(DEFAULT_OPENROUTER_MODEL_ID);
  });

  it('validates known OpenRouter model identifiers', () => {
    expect(isOpenRouterModelId(DEFAULT_OPENROUTER_MODEL_ID)).toBe(true);
    expect(isOpenRouterModelId('invalid/model')).toBe(false);
  });

  it('formats human readable labels with an OpenRouter prefix', () => {
    const label = formatOpenRouterLabel(OPENROUTER_MODELS[0]);
    expect(label.startsWith('OpenRouter — ')).toBe(true);
    expect(label).toContain(OPENROUTER_MODELS[0].label);
  });
});
