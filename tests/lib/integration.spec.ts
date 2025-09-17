import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseBibtex } from '@/lib/bibtexParser';
import { buildDecisions, summarizeDecisions } from '@/lib/triage';

describe('integration: Exported Items', () => {
  it('parses and triages the sample export', () => {
    const filePath = path.join(process.cwd(), 'Exported Items.bib');
    const content = fs.readFileSync(filePath, 'utf8');
    const entries = parseBibtex(content);
    const decisions = buildDecisions(entries);
    const summary = summarizeDecisions(decisions);

    expect(summary.total).toBe(1371);
    const statusSum = Object.values(summary.byStatus).reduce((acc, value) => acc + value, 0);
    expect(statusSum).toBe(1371);
  });
});
