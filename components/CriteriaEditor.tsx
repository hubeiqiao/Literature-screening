'use client';

interface CriteriaEditorProps {
  inclusion: string;
  exclusion: string;
  onInclusionChange: (value: string) => void;
  onExclusionChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}

export function CriteriaEditor({
  inclusion,
  exclusion,
  onInclusionChange,
  onExclusionChange,
  disabled,
  error,
}: CriteriaEditorProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Screening Criteria</h2>
        <span className="text-xs uppercase tracking-wide text-slate-500">Human-readable</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Paste or type the criteria exactly as you would share them with a reviewer. We derive keyword heuristics for
        deterministic checks and feed the full text to the LLM triage step.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-700">Inclusion criteria</label>
          <textarea
            value={inclusion}
            onChange={(event) => onInclusionChange(event.target.value)}
            spellCheck={false}
            disabled={disabled}
            className="mt-2 h-60 w-full rounded border border-slate-300 bg-slate-50 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">Exclusion criteria</label>
          <textarea
            value={exclusion}
            onChange={(event) => onExclusionChange(event.target.value)}
            spellCheck={false}
            disabled={disabled}
            className="mt-2 h-60 w-full rounded border border-slate-300 bg-slate-50 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
          />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
