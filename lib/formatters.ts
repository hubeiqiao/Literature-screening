import type { BibEntry, TriageDecision } from './types';

export function decisionsToCsv(decisions: TriageDecision[]): string {
  const header = [
    'key',
    'type',
    'title',
    'year',
    'status',
    'confidence',
    'inclusion_matches',
    'exclusion_matches',
    'source',
    'model',
    'rationale',
  ];

  const rows = decisions.map((decision) => {
    return [
      decision.key,
      decision.type,
      escapeCsv(decision.title),
      decision.year,
      decision.status,
      decision.confidence.toString(),
      decision.inclusionMatches.map((match) => match.id).join('|'),
      decision.exclusionMatches.map((match) => match.id).join('|'),
      decision.source ?? '',
      decision.model ?? '',
      escapeCsv(decision.rationale ?? ''),
    ].join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

function escapeCsv(value: string) {
  const stringValue = value ?? '';
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

export function decisionsToAnnotatedBib(entries: BibEntry[], decisions: TriageDecision[]): string {
  const decisionByKey = new Map(decisions.map((decision) => [decision.key, decision]));

  return entries
    .map((entry) => annotateEntry(entry, decisionByKey.get(entry.key)))
    .join('\n\n');
}

function annotateEntry(entry: BibEntry, decision?: TriageDecision) {
  const fields = { ...entry.fields };

  const keywordSet = new Set<string>(
    (fields.keywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

  if (decision) {
    keywordSet.add(decision.status);
  }

  if (keywordSet.size > 0) {
    fields.keywords = Array.from(keywordSet).sort().join(', ');
  }

  if (decision) {
    const inclusion = decision.inclusionMatches.map((match) => match.id).join('|') || 'none';
    const exclusion = decision.exclusionMatches.map((match) => match.id).join('|') || 'none';
    const source = decision.source ? `; Source: ${decision.source}` : '';
    const model = decision.model ? `; Model: ${decision.model}` : '';
    const rationale = decision.rationale ? `; Rationale: ${decision.rationale}` : '';
    fields.annote = `Decision: ${decision.status}; Confidence: ${decision.confidence}; InclusionRules: ${inclusion}; ExclusionRules: ${exclusion}${source}${model}${rationale}`;
  }

  const fieldOrder = [
    'title',
    'author',
    'journal',
    'booktitle',
    'year',
    'volume',
    'number',
    'pages',
    'month',
    'publisher',
    'abstract',
    'keywords',
    'annote',
  ];

  const orderedPairs: Array<[string, string]> = [];
  const seen = new Set<string>();

  fieldOrder.forEach((fieldName) => {
    if (fields[fieldName]) {
      orderedPairs.push([fieldName, fields[fieldName]]);
      seen.add(fieldName);
    }
  });

  Object.entries(fields)
    .filter(([name]) => !seen.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, value]) => {
      orderedPairs.push([name, value]);
    });

  const formattedFields = orderedPairs
    .map(([name, value]) => `  ${name} = ${formatBibValue(value)},`)
    .join('\n');

  return `@${entry.type}{${entry.key},\n${formattedFields}\n}`;
}

function formatBibValue(value: string) {
  const safeValue = String(value)
    .replace(/\s+/g, ' ')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
  return `{${safeValue}}`;
}
