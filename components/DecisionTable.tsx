'use client';

import { useMemo, useState } from 'react';
import type { TriageDecision } from '@/lib/types';

interface DecisionTableProps {
  decisions: TriageDecision[];
}

export function DecisionTable({ decisions }: DecisionTableProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | 'Include' | 'Exclude' | 'Maybe'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    return decisions.filter((decision) => {
      if (statusFilter !== 'All' && decision.status !== statusFilter) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }
      const haystack = `${decision.title} ${decision.key} ${decision.year}`.toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });
  }, [decisions, statusFilter, searchTerm]);

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {['All', 'Include', 'Exclude', 'Maybe'].map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status as typeof statusFilter)}
                className={`rounded-full px-3 py-1 text-sm ${
                  active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search title or key…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm sm:w-64"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed divide-y divide-slate-200 text-left text-sm">
          <colgroup>
            <col className="w-12" />
            <col className="w-36" />
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-40" />
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-[60%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-12 px-2 py-3">Key</th>
              <th className="w-36 px-4 py-3">Title</th>
              <th className="w-16 px-4 py-3">Year</th>
              <th className="w-20 px-4 py-3">Status</th>
              <th className="w-20 px-4 py-3">Confidence</th>
              <th className="w-40 px-4 py-3">Matched rules</th>
              <th className="w-16 px-4 py-3">Source</th>
              <th className="w-20 px-4 py-3">Model</th>
              <th className="w-[60%] px-4 py-3">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filtered.map((decision) => (
              <tr key={decision.key}>
                <td className="w-12 px-2 py-3 font-mono text-xs text-slate-500 break-all whitespace-normal">{decision.key}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{decision.title || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{decision.year || '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{decision.status}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{decision.confidence.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <RulesBadge label="Inclusion" items={decision.inclusionMatches.map((match) => match.id)} />
                  <RulesBadge label="Exclusion" items={decision.exclusionMatches.map((match) => match.id)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{decision.source ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{decision.model ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 align-top">{decision.rationale ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                  No records match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesBadge({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0 || (items.length === 1 && items[0] === 'none')) {
    return (
      <span className="mr-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
        {label}: none
      </span>
    );
  }
  return (
    <span className="mr-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
      {label}: {items.join(', ')}
    </span>
  );
}
