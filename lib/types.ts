export type BibFieldMap = Record<string, string>;

export interface BibEntry {
  type: string;
  key: string;
  fields: BibFieldMap;
  raw?: string;
}

export interface RuleMatch {
  id: string;
  matchedTerms: string[];
}

export interface CriteriaRule {
  id: string;
  terms: string[];
  scope?: 'keywords';
}

export interface ScreeningCriteria {
  inclusion: CriteriaRule[];
  exclusion: CriteriaRule[];
}

export interface TriageDecision {
  key: string;
  type: string;
  title: string;
  year: string;
  status: 'Include' | 'Exclude' | 'Maybe';
  confidence: number;
  inclusionMatches: RuleMatch[];
  exclusionMatches: RuleMatch[];
  rationale?: string;
  model?: string;
  source?: 'deterministic' | 'llm';
}

export interface TriageSummary {
  total: number;
  byStatus: Record<string, number>;
}

export interface TriageResponse {
  summary: TriageSummary;
  decisions: TriageDecision[];
}
