import { describe, expect, it } from 'vitest';
import { parseBibtex } from '@/lib/bibtexParser';

const sampleBib = `@article{example,
  title = {An Example Entry},
  author = {Doe, Jane},
  year = {2024},
  keywords = {Include, Testing}
}`;

describe('parseBibtex', () => {
  it('parses entries and retains fields', () => {
    const entries = parseBibtex(sampleBib);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('example');
    expect(entries[0].fields.title).toBe('An Example Entry');
    expect(entries[0].fields.keywords).toBe('Include, Testing');
  });

  it('handles nested braces', () => {
    const nested = `@article{nested, title = {A Study on {Nested} Braces}}`;
    const [entry] = parseBibtex(nested);
    expect(entry.fields.title).toBe('A Study on {Nested} Braces');
  });
});
