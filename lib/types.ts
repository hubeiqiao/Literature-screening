import type { UsageMode } from './usageMode';

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

export interface TokenUsageBreakdown {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface TriageRunCost {
  currency: 'usd';
  estimatedCents: number | null;
  actualCents: number | null;
  balanceBeforeCents: number | null;
  balanceAfterCents: number | null;
}

export interface TriageRunRecord {
  userId: string | null;
  provider: 'openrouter' | 'gemini';
  usageMode: UsageMode;
  heuristics: ScreeningCriteria;
  decision: TriageDecision;
  tokenUsage: TokenUsageBreakdown | null;
  cost?: TriageRunCost | null;
  warning?: string | null;
  timestamp: string;
}

export interface TriageRunHistoryEntry extends TriageRunRecord {
  id: string;
}
