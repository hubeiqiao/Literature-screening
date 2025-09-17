'use client';

import { useMemo, useState } from 'react';
import { decisionsToAnnotatedBib, decisionsToCsv } from '@/lib/formatters';
import { summarizeDecisions } from '@/lib/triage';
import type { BibEntry, TriageDecision, TriageSummary } from '@/lib/types';

interface ExportButtonsProps {
  entries: BibEntry[];
  decisions: TriageDecision[];
  summary: TriageSummary;
}

export function ExportButtons({ entries, decisions, summary }: ExportButtonsProps) {
  type ExportScope = 'all' | 'Include' | 'Exclude' | 'Maybe';

  const [scope, setScope] = useState<ExportScope>('all');

  const filteredDecisions = useMemo(() => {
    if (scope === 'all') {
      return decisions;
    }
    return decisions.filter((decision) => decision.status === scope);
  }, [decisions, scope]);

  const filteredEntries = useMemo(() => {
    if (scope === 'all') {
      return entries;
    }
    const allowedKeys = new Set(filteredDecisions.map((decision) => decision.key));
    return entries.filter((entry) => allowedKeys.has(entry.key));
  }, [entries, filteredDecisions, scope]);

  const filteredSummary = useMemo(() => summarizeDecisions(filteredDecisions), [filteredDecisions]);

  const disabled = filteredDecisions.length === 0;

  const triggerDownload = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleJson = () => {
    triggerDownload(
      JSON.stringify({ summary: filteredSummary, decisions: filteredDecisions }, null, 2),
      'application/json',
      scope === 'all' ? 'decisions.json' : `decisions-${scope.toLowerCase()}.json`,
    );
  };

  const handleCsv = () => {
    triggerDownload(
      decisionsToCsv(filteredDecisions),
      'text/csv',
      scope === 'all' ? 'decisions.csv' : `decisions-${scope.toLowerCase()}.csv`,
    );
  };

  const handleBib = () => {
    triggerDownload(
      decisionsToAnnotatedBib(filteredEntries, filteredDecisions),
      'application/x-bibtex',
      scope === 'all' ? 'triaged.bib' : `triaged-${scope.toLowerCase()}.bib`,
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <label className="block text-sm font-semibold text-slate-700">Download scope</label>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as ExportScope)}
          className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm lg:w-48"
        >
          <option value="all">All articles ({summary.total})</option>
          <option value="Include">Included ({summary.byStatus.Include || 0})</option>
          <option value="Exclude">Excluded ({summary.byStatus.Exclude || 0})</option>
          <option value="Maybe">Maybe ({summary.byStatus.Maybe || 0})</option>
        </select>
        <p className="mt-2 text-xs text-slate-500">
          Only records matching this filter will appear in the exported files.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleBib}
          disabled={disabled}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download BibTeX
        </button>
        <button
          onClick={handleCsv}
          disabled={disabled}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download CSV
        </button>
        <button
          onClick={handleJson}
          disabled={disabled}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}
