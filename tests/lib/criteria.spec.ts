import { describe, expect, it } from 'vitest';
import { buildCriteriaFromText, getDefaultCriteria, getDefaultCriteriaText } from '@/lib/criteria';

describe('criteria helpers', () => {
  it('derives heuristics from text input', () => {
    const rules = buildCriteriaFromText({
      inclusion: '1. Adults only; include L2, ESL learners',
      exclusion: 'E01. Non adult sample',
    });
    expect(rules.inclusion).toHaveLength(1);
    expect(rules.inclusion[0].id).toContain('inc');
    expect(rules.inclusion[0].terms).toEqual(expect.arrayContaining(['adults', 'learners', 'esl', 'l2']));
    expect(rules.exclusion[0].terms).toContain('adult');
  });

  it('keeps short discipline-specific tokens like L2 and ESL', () => {
    const rules = buildCriteriaFromText({
      inclusion: 'L2 speaking performance in ESL contexts',
      exclusion: 'Exclude K-12',
    });
    expect(rules.inclusion[0].terms).toEqual(expect.arrayContaining(['l2', 'esl']));
  });

  it('provides default text that round-trips to heuristics', () => {
    const defaults = getDefaultCriteria();
    const text = getDefaultCriteriaText();
    const rebuilt = buildCriteriaFromText(text);
    expect(defaults.inclusion.length).toBeGreaterThan(0);
    expect(rebuilt.inclusion.length).toEqual(defaults.inclusion.length);
  });
});
