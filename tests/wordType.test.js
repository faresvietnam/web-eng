import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { deriveWordType, attachWordType } = require('../lib/wordType');

describe('deriveWordType', () => {
  it('returns simple for no components', () => {
    expect(deriveWordType([])).toBe('simple');
  });

  it('returns simple for a combining_form with no root', () => {
    expect(deriveWordType(['combining_form'])).toBe('simple');
  });

  it('returns derived for one root plus an affix', () => {
    expect(deriveWordType(['prefix', 'root', 'suffix'])).toBe('derived');
    expect(deriveWordType(['root', 'suffix'])).toBe('derived');
  });

  it('returns simple for a single root with no affix', () => {
    expect(deriveWordType(['root'])).toBe('simple');
  });

  it('returns compound for two or more roots with no affix', () => {
    expect(deriveWordType(['root', 'root'])).toBe('compound');
    expect(deriveWordType(['root', 'combining_form', 'root'])).toBe('compound');
  });

  it('returns compound_derived for two or more roots plus an affix', () => {
    expect(deriveWordType(['prefix', 'root', 'root', 'suffix'])).toBe('compound_derived');
  });
});

describe('attachWordType', () => {
  it('sorts word_components by position and sets word_type', () => {
    const word = {
      word: 'unbelievable',
      word_components: [
        { position: 2, component: { component_type: 'suffix', text: 'able' } },
        { position: 0, component: { component_type: 'prefix', text: 'un' } },
        { position: 1, component: { component_type: 'root', text: 'believ' } },
      ],
    };
    const result = attachWordType(word);
    expect(result.word_components.map((wc) => wc.component.text)).toEqual(['un', 'believ', 'able']);
    expect(result.word_type).toBe('derived');
  });

  it('defaults to simple with an empty word_components list', () => {
    const result = attachWordType({ word: 'hi', word_components: [] });
    expect(result.word_type).toBe('simple');
  });

  it('handles a missing word_components field', () => {
    const result = attachWordType({ word: 'hi' });
    expect(result.word_type).toBe('simple');
    expect(result.word_components).toEqual([]);
  });
});
