import { getDefaultCriteria } from './criteria';
import type {
  BibEntry,
  CriteriaRule,
  RuleMatch,
  ScreeningCriteria,
  TriageDecision,
  TriageSummary,
} from './types';

export function triageRecord(record: BibEntry, criteria = getDefaultCriteria()) {
  const textIndex = buildTextIndex(record);
  const inclusionMatches = matchRules(criteria.inclusion, textIndex);
  const exclusionMatches = matchRules(criteria.exclusion, textIndex, { minTerms: 2 });

  const inclusionScore = scoreMatches(inclusionMatches);
  const exclusionScore = scoreMatches(exclusionMatches);

  let status: TriageDecision['status'] = 'Maybe';
  if (shouldExclude(inclusionScore, exclusionScore, exclusionMatches.length)) {
    status = 'Exclude';
  } else if (shouldInclude(inclusionScore, exclusionScore)) {
    status = 'Include';
  }

  const confidence = computeConfidence(status, inclusionScore, exclusionScore);

  return {
    status,
    confidence,
    inclusionMatches,
    exclusionMatches,
  };
}

export function summarizeDecisions(decisions: TriageDecision[]): TriageSummary {
  return decisions.reduce(
    (acc, decision) => {
      acc.total += 1;
      acc.byStatus[decision.status] = (acc.byStatus[decision.status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> },
  );
}

function buildTextIndex(record: BibEntry) {
  const fieldsToIndex = ['title', 'abstract', 'keywords', 'note', 'notes'];
  const combined = fieldsToIndex
    .map((field) => record.fields[field])
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  const keywordList = new Set<string>();
  (record.fields.keywords || '')
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .forEach((keyword) => keywordList.add(keyword));

  return {
    combined,
    keywords: keywordList,
  };
}

function matchRules(
  rules: CriteriaRule[],
  index: { combined: string; keywords: Set<string> },
  options?: { minTerms?: number },
): RuleMatch[] {
  const minTerms = options?.minTerms ?? 1;
  return rules
    .map((rule) => {
      const matchedTerms = rule.terms.filter((term) => {
        if (rule.scope === 'keywords') {
          return index.keywords.has(term);
        }
        return index.combined.includes(term);
      });
      const hasStrongTerm = matchedTerms.some((term) => term.length >= 6 || /\d/.test(term) || term.includes('-'));
      if (matchedTerms.length >= minTerms || hasStrongTerm) {
        return {
          id: rule.id,
          matchedTerms,
        } satisfies RuleMatch;
      }
      return null;
    })
    .filter(Boolean) as RuleMatch[];
}

function scoreMatches(matches: RuleMatch[]) {
  return matches.reduce((total, match) => total + Math.min(match.matchedTerms.length, 3), 0);
}

function shouldExclude(inclusionScore: number, exclusionScore: number, exclusionHits: number) {
  if (exclusionHits === 0) {
    return false;
  }
  if (inclusionScore === 0) {
    return exclusionScore >= 2 || exclusionHits >= 2;
  }
  if (exclusionScore >= inclusionScore && exclusionScore >= 2) {
    return true;
  }
  return false;
}

function shouldInclude(inclusionScore: number, exclusionScore: number) {
  if (inclusionScore < 2) {
    return false;
  }
  if (exclusionScore > 0) {
    return inclusionScore >= exclusionScore + 2;
  }
  return inclusionScore >= 2;
}

function computeConfidence(
  status: TriageDecision['status'],
  inclusionScore: number,
  exclusionScore: number,
) {
  let confidence: number;

  switch (status) {
    case 'Include': {
      const positiveEvidence = Math.min(inclusionScore, 6) * 0.08;
      const penalty = Math.min(exclusionScore, 3) * 0.05;
      confidence = 0.55 + positiveEvidence - penalty;
      break;
    }
    case 'Exclude': {
      const negativeEvidence = Math.min(exclusionScore, 6) * 0.09;
      const offset = Math.min(inclusionScore, 2) * 0.04;
      confidence = 0.5 + negativeEvidence - offset;
      break;
    }
    default: {
      const mixedEvidence = Math.min(inclusionScore + exclusionScore, 6) * 0.05;
      confidence = 0.35 + mixedEvidence;
    }
  }

  return clamp(confidence, 0.2, status === 'Maybe' ? 0.65 : 0.92);
}

export function buildDecisions(entries: BibEntry[], criteria = getDefaultCriteria()): TriageDecision[] {
  return entries.map((record) => {
    const triage = triageRecord(record, criteria);
    return {
      key: record.key,
      type: record.type,
      title: record.fields.title || '',
      year: record.fields.year || '',
      status: triage.status,
      confidence: triage.confidence,
      inclusionMatches: triage.inclusionMatches,
      exclusionMatches: triage.exclusionMatches,
    } satisfies TriageDecision;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
