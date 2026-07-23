import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseWordsCsv, parseComponentsField } = require('../lib/csv');

describe('parseWordsCsv', () => {
  it('parses valid rows with all columns', () => {
    const csv = 'word,meaning,category,part_of_speech,ipa,example,example_vi,components\nunbelievable,không thể tin được,adjectives,adj,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,prefix:un|root:believ:free_root|suffix:able';
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
        components: [
          { component_type: 'prefix', text: 'un', root_subtype: null },
          { component_type: 'root', text: 'believ', root_subtype: 'free_root' },
          { component_type: 'suffix', text: 'able', root_subtype: null },
        ],
      },
    ]);
  });

  it('fills optional columns with null and components with an empty array when missing', () => {
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
      components: [],
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

describe('parseComponentsField', () => {
  it('returns an empty array for empty or missing input', () => {
    expect(parseComponentsField('')).toEqual([]);
    expect(parseComponentsField(undefined)).toEqual([]);
  });

  it('drops tokens with an unknown component_type', () => {
    expect(parseComponentsField('bogus:x|root:act')).toEqual([{ component_type: 'root', text: 'act', root_subtype: null }]);
  });

  it('drops tokens missing text', () => {
    expect(parseComponentsField('prefix:|root:act')).toEqual([{ component_type: 'root', text: 'act', root_subtype: null }]);
  });
});
