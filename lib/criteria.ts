import type { CriteriaRule, ScreeningCriteria } from './types';

export interface CriteriaTextInput {
  inclusion: string;
  exclusion: string;
}

const DEFAULT_INCLUSION_TEXT = `1. Adults only – learners are adults (higher ed, workplace, community, immigration) or adult subgroup is clearly analyzable.
2. Speaking performance target – study targets L2 English speaking or a real-time production analog (speaking, oral proficiency, conversation, fluency, CAF, CEFR/ACTFL/OPIc ratings, pronunciation intelligibility, speech rate, articulation rate, pause metrics, response latency, role-play performance).
3. Behavioral-science mechanism present – intervention explicitly implements a skill-acquisition or adherence mechanism (spacing, interleaving, variable practice, retrieval/production practice, scaffolding, feedback timing/bandwidth/focus, adaptive difficulty/mastery criteria, implementation intentions, habit formation, reminders/prompts, commitment devices, incentives/reinforcement, goal/plan prompts, progress feedback, social accountability).
4. Performance outcome, not vibes – reports change in speaking performance or validated proxy for automaticity/transfer (CAF on novel tasks, latency, error decay, CEFR/ACTFL level change, intelligibility ratings). Attitudes/engagement alone do not qualify.
5. Design provides evidence – empirical primary study (RCT, quasi-experimental, pre-post with documented practice dose, field/classroom deployment) or a systematic/scoping review that maps mechanisms to outcomes with methods. Mixed methods allowed if performance outcomes are reported.
6. Scope fit – published 2015–present, or pre-2015 only if foundational mechanism directly applied to speaking design. ESL/EAL/EFL context or language-general mechanism with explicit mapping to speaking.
7. Technology neutrality – AI use is optional; include human-delivered mechanisms if portable to AI-assisted speaking systems.`;

const DEFAULT_EXCLUSION_TEXT = `E01. Not adult population or adult data not separable.
E02. No speaking or real-time production outcome (knowledge tests, attitudes, usage only).
E03. No behavioral mechanism (tech/tool use without an explicit skill/adherence mechanism).
E04. Opinion/theory only; no data or evaluative pathway.
E05. AI/system paper with zero learner outcomes.
E06. Gray/industry report without transparent methods or outcomes.
E07. Out of timeframe and not a foundational mechanism applied to speaking.
E08. Mixed population where adult/speaking subset cannot be disaggregated.
E09. No comparator and practice dose uncontrolled/unstated in a way that prevents interpreting performance change.
E10. Insufficient intervention detail to implement the mechanism (cannot tell what was spaced/interleaved, how feedback was timed, what the adherence device was).
E11. Language/skill mismatch with no explicit mapping to speaking (e.g., reading/listening only, motor-skill analogs with no L2 transfer argument).
E12. Duplicate publication of an included study (retain the most complete version).`;

export function getDefaultCriteriaText(): CriteriaTextInput {
  return {
    inclusion: DEFAULT_INCLUSION_TEXT,
    exclusion: DEFAULT_EXCLUSION_TEXT,
  };
}

export function getDefaultCriteria(): ScreeningCriteria {
  return buildCriteriaFromText(getDefaultCriteriaText());
}

export function buildCriteriaFromText({ inclusion, exclusion }: CriteriaTextInput): ScreeningCriteria {
  return {
    inclusion: textToRules(inclusion, 'inc'),
    exclusion: textToRules(exclusion, 'exc'),
  };
}

function textToRules(text: string, prefix: string): CriteriaRule[] {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .map((line, index) => {
      const id = deriveRuleId(line, prefix, index);
      const terms = extractTerms(line);
      return {
        id,
        terms,
      } satisfies CriteriaRule;
    })
    .filter((rule) => rule.terms.length > 0);
}

function deriveRuleId(line: string, prefix: string, index: number): string {
  const stripped = line.replace(/^[-*•\s]+/, '');
  const firstToken = stripped.split(/\s+/)[0] ?? '';
  const cleaned = firstToken.replace(/[^a-z0-9-_]/gi, '').toLowerCase();
  if (cleaned.length >= 2) {
    return `${prefix}_${cleaned}`;
  }
  return `${prefix}_${index + 1}`;
}

const STOP_WORDS = new Set([
  'with',
  'without',
  'where',
  'which',
  'from',
  'that',
  'this',
  'these',
  'those',
  'their',
  'there',
  'about',
  'using',
  'among',
  'after',
  'before',
  'study',
  'studies',
  'report',
  'reports',
  'paper',
  'papers',
  'analysis',
  'include',
  'includes',
  'including',
  'exclusion',
  'criteria',
  'only',
  'not',
  'and',
  'both',
  'such',
  'present',
  'neutrality',
  'design',
  'provides',
  'evidence',
  'scope',
  'technology',
]);

const ALWAYS_KEEP = new Set([
  'l2',
  'esl',
  'efl',
  'ell',
  'tesol',
  'toefl',
  'ielts',
  'ai',
  'caf',
  'cefr',
  'actfl',
  'opic',
]);

const MAX_TERMS_PER_RULE = 20;

function extractTerms(line: string): string[] {
  const words = line
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{1,}/g);

  if (!words) {
    return [];
  }

  const unique = new Set<string>();
  for (const raw of words) {
    const word = raw.toLowerCase();
    const hasDigits = /\d/.test(word);
    const keep =
      ALWAYS_KEEP.has(word) ||
      hasDigits ||
      (word.length >= 4 && !STOP_WORDS.has(word));

    if (!keep) {
      continue;
    }

    unique.add(word);

    if (word.length > 4 && word.endsWith('s')) {
      unique.add(word.replace(/s$/i, ''));
    }

    if (word.includes('-')) {
      unique.add(word.replace(/-/g, ''));
    }
  }
  return Array.from(unique).slice(0, MAX_TERMS_PER_RULE);
}
