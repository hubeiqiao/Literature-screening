import type { BibEntry } from './types';

export function parseBibtex(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    if (content[i] !== '@') {
      i += 1;
      continue;
    }

    const entryStart = i;
    i += 1; // skip '@'
    const typeStart = i;
    while (i < len && content[i] !== '{' && !/\s/.test(content[i])) {
      i += 1;
    }
    const type = content.slice(typeStart, i).trim();

    while (i < len && content[i] !== '{') {
      i += 1;
    }
    if (i >= len) {
      break;
    }
    i += 1; // skip '{'

    skipWhitespace();
    const keyStart = i;
    while (i < len && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') {
      i += 1;
    }
    const key = content.slice(keyStart, i).trim();

    while (i < len && content[i] !== '\n' && content[i] !== '\r') {
      if (content[i] === ',') {
        i += 1;
        break;
      }
      i += 1;
    }

    const fields: Record<string, string> = {};
    let finishedEntry = false;

    while (i < len) {
      skipWhitespace();
      if (i >= len) {
        break;
      }
      const ch = content[i];
      if (ch === '}') {
        finishedEntry = true;
        i += 1;
        break;
      }

      const nameStart = i;
      while (i < len && !['=', '\n', '\r'].includes(content[i])) {
        if (content[i] === ' ' || content[i] === '\t') {
          break;
        }
        i += 1;
      }
      const rawName = content.slice(nameStart, i).trim();
      if (!rawName) {
        skipToNextLine();
        continue;
      }

      while (i < len && content[i] !== '=') {
        i += 1;
      }
      if (content[i] !== '=') {
        skipToNextLine();
        continue;
      }
      i += 1; // skip '='

      skipWhitespace();
      if (i >= len) {
        break;
      }

      let valueResult;
      if (content[i] === '{') {
        valueResult = readBraceValue(content, i);
      } else if (content[i] === '"') {
        valueResult = readQuotedValue(content, i);
      } else {
        valueResult = readSimpleValue(content, i);
      }

      const { value, nextIndex } = valueResult;
      i = nextIndex;

      fields[rawName.toLowerCase()] = value.trim();

      while (i < len && [',', '\n', '\r', ' ', '\t'].includes(content[i])) {
        if (content[i] === ',') {
          i += 1;
          break;
        }
        i += 1;
      }
    }

    if (finishedEntry) {
      entries.push({
        type: type.toLowerCase(),
        key,
        fields,
        raw: content.slice(entryStart, i),
      });
    }
  }

  return entries;

  function skipWhitespace() {
    while (i < len && [' ', '\t', '\n', '\r'].includes(content[i])) {
      i += 1;
    }
  }

  function skipToNextLine() {
    while (i < len && content[i] !== '\n') {
      i += 1;
    }
    if (content[i] === '\n') {
      i += 1;
    }
  }
}

function readBraceValue(content: string, start: number) {
  let depth = 0;
  let i = start;
  const len = content.length;
  if (content[i] !== '{') {
    throw new Error('Expected brace value');
  }
  i += 1;
  depth += 1;
  const valueStart = i;

  while (i < len && depth > 0) {
    const ch = content[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const value = content.slice(valueStart, i);
        return { value, nextIndex: i + 1 };
      }
    }
    i += 1;
  }
  throw new Error('Unterminated brace value in BibTeX entry');
}

function readQuotedValue(content: string, start: number) {
  let i = start + 1;
  const len = content.length;
  const valueStart = i;

  while (i < len) {
    const ch = content[i];
    if (ch === '"' && content[i - 1] !== '\\') {
      const value = content.slice(valueStart, i);
      return { value, nextIndex: i + 1 };
    }
    i += 1;
  }
  throw new Error('Unterminated quoted value in BibTeX entry');
}

function readSimpleValue(content: string, start: number) {
  let i = start;
  const len = content.length;
  const valueStart = i;
  while (i < len && ![',', '\n', '\r'].includes(content[i])) {
    i += 1;
  }
  const value = content.slice(valueStart, i);
  return { value: value.trim(), nextIndex: i };
}
