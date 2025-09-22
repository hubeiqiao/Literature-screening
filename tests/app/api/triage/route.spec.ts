import { describe, expect, it } from 'vitest';
import { buildOpenRouterPayload } from '../../../../app/api/triage/payloads';
import { getOpenRouterModel } from '@/lib/openrouter';
import type { CriteriaTextInput } from '@/lib/criteria';
import type { RuleMatch } from '@/lib/types';

type DeterministicResult = {
  status: 'Include' | 'Exclude' | 'Maybe';
  confidence: number;
  inclusionMatches: RuleMatch[];
  exclusionMatches: RuleMatch[];
};

const entry = {
  type: 'article',
  key: 'smith2024',
  fields: {
    title: 'Sample Title',
    abstract: 'Example abstract discussing language practice.',
    keywords: 'practice, english',
    year: '2024',
  },
};

const instructions: CriteriaTextInput = {
  inclusion: 'Adults only. Speaking performance target.',
  exclusion: 'No behavioral mechanism.',
};

const deterministic: DeterministicResult = {
  status: 'Include',
  confidence: 0.75,
  inclusionMatches: [],
  exclusionMatches: [],
};

describe('buildOpenRouterPayload', () => {
  it('enables reasoning when effort is provided', () => {
    const model = getOpenRouterModel('x-ai/grok-4-fast:free');
    const payload = buildOpenRouterPayload(entry, instructions, deterministic, 'minimal', model);

    expect(payload.reasoning).toEqual({ enabled: true, effort: 'minimal' });
  });

  it('omits reasoning when effort is none', () => {
    const model = getOpenRouterModel('x-ai/grok-4-fast:free');
    const payload = buildOpenRouterPayload(entry, instructions, deterministic, 'none', model);

    expect(payload.reasoning).toBeUndefined();
  });
});
