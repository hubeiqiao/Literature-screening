import { describe, expect, it } from 'vitest';
import { buildDecisions, triageRecord } from '@/lib/triage';
import { buildCriteriaFromText } from '@/lib/criteria';
import type { BibEntry } from '@/lib/types';

describe('triage', () => {
  const baseEntry: BibEntry = {
    type: 'article',
    key: 'sample',
    fields: {
      title: 'Adult learners improving speaking skills through behavioral coaching',
      abstract: 'An experiment with adult ESL students focusing on oral proficiency and motivation.',
      keywords: 'Adult, ESL',
      year: '2024',
    },
  };

  it('captures multiple inclusion rule matches for relevant studies', () => {
    const [decision] = buildDecisions([baseEntry]);
    expect(decision.status).not.toBe('Exclude');
    expect(decision.inclusionMatches.length).toBeGreaterThanOrEqual(1);
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it('flags exclusion criteria terms when population mismatches', () => {
    const entry: BibEntry = {
      ...baseEntry,
      key: 'k12',
      fields: {
        ...baseEntry.fields,
        abstract: 'A commentary on K-12 secondary school teachers.',
      },
    };
    const [decision] = buildDecisions([entry]);
    expect(decision.exclusionMatches.length).toBeGreaterThanOrEqual(1);
    expect(decision.status).toBe('Exclude');
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it('returns Maybe when inclusion and exclusion evidence conflict', () => {
    const criteria = buildCriteriaFromText({
      inclusion: 'Adults speaking outcomes reported',
      exclusion: 'Exclude K-12 populations',
    });

    const result = triageRecord(
      {
        ...baseEntry,
        fields: {
          ...baseEntry.fields,
          abstract:
            'Adult ESL learners focus on speaking proficiency but the cohort mixes K-12 students, so results are ambiguous.',
        },
      },
      criteria,
    );

    expect(result.status).toBe('Maybe');
    expect(result.confidence).toBeLessThanOrEqual(0.65);
    expect(result.confidence).toBeGreaterThan(0.3);
  });
});
