'use client';

import { useRef, useState } from 'react';

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function FileUploader({ onUpload, isLoading }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Select a BibTeX file to continue.');
      return;
    }
    try {
      await onUpload(file);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (err) {
      console.error(err);
      setError('Upload failed. Check console for details.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-600">BibTeX export</label>
          <input
            ref={inputRef}
            type="file"
            accept=".bib"
            className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Drop the Zotero &quot;Exported Items.bib&quot; or any BibTeX export.
          </p>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Processing…' : 'Run triage'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}
