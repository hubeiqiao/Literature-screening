'use client';

interface TriageProgressProps {
  current: number;
  total: number;
  status: 'idle' | 'running' | 'finished' | 'error';
}

export function TriageProgress({ current, total, status }: TriageProgressProps) {
  if (status === 'idle') {
    return null;
  }

  const percent = total === 0 ? 0 : Math.min(100, Math.round((current / total) * 100));
  const label =
    status === 'running'
      ? `Processing record ${current} of ${total}`
      : status === 'finished'
      ? 'LLM triage complete'
      : 'Triage halted';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm font-medium text-slate-700">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full ${status === 'error' ? 'bg-red-500' : 'bg-slate-900'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
