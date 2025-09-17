'use client';

import { decisionsToAnnotatedBib, decisionsToCsv } from '@/lib/formatters';
import type { BibEntry, TriageDecision, TriageSummary } from '@/lib/types';

interface ExportButtonsProps {
  entries: BibEntry[];
  decisions: TriageDecision[];
  summary: TriageSummary;
}

export function ExportButtons({ entries, decisions, summary }: ExportButtonsProps) {
  const disabled = decisions.length === 0;

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
    triggerDownload(JSON.stringify({ summary, decisions }, null, 2), 'application/json', 'decisions.json');
  };

  const handleCsv = () => {
    triggerDownload(decisionsToCsv(decisions), 'text/csv', 'decisions.csv');
  };

  const handleBib = () => {
    triggerDownload(
      decisionsToAnnotatedBib(entries, decisions),
      'application/x-bibtex',
      'triaged.bib',
    );
  };

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        onClick={handleJson}
        disabled={disabled}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
      >
        Download JSON
      </button>
      <button
        onClick={handleCsv}
        disabled={disabled}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        Download CSV
      </button>
      <button
        onClick={handleBib}
        disabled={disabled}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        Download BibTeX
      </button>
    </div>
  );
}
