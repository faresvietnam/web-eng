import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseWordsCsv } = require('../lib/csv');

describe('parseWordsCsv', () => {
  it('parses valid rows with all columns', () => {
    const csv = 'word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix\nunbelievable,không thể tin được,adjectives,adj,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,un,believ,able';
    const { rows, errors } = parseWordsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        word: 'unbelievable',
        meaning: 'không thể tin được',
        category: 'adjectives',
        part_of_speech: 'adj',
        ipa: '/ʌnbɪˈliːvəbl/',
        example: 'It is unbelievable.',
        example_vi: 'Nó thật khó tin.',
        prefix: 'un',
        root: 'believ',
        suffix: 'able',
      },
    ]);
  });

  it('fills optional columns with null when missing', () => {
    const csv = 'word,meaning\nhi,chào';
    const { rows } = parseWordsCsv(csv);
    expect(rows[0]).toEqual({
      word: 'hi',
      meaning: 'chào',
      category: null,
      part_of_speech: null,
      ipa: null,
      example: null,
      example_vi: null,
      prefix: null,
      root: null,
      suffix: null,
    });
  });

  it('reports an error and skips rows missing word or meaning', () => {
    const csv = 'word,meaning\n,chào\nhi,';
    const { rows, errors } = parseWordsCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { line: 2, reason: 'Thiếu field: word' },
      { line: 3, reason: 'Thiếu field: meaning' },
    ]);
  });

  it('returns empty rows and errors for empty input', () => {
    expect(parseWordsCsv('')).toEqual({ rows: [], errors: [] });
  });

  it('reports the correct line number even when a blank line precedes the bad row', () => {
    const csv = 'word,meaning\nhi,chào\n\nbye,';
    const { errors } = parseWordsCsv(csv);
    expect(errors).toEqual([{ line: 4, reason: 'Thiếu field: meaning' }]);
  });
});
