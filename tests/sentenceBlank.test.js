import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseSentencePairs, buildBlank, hasUsableSentence } = require('../lib/sentenceBlank');

describe('parseSentencePairs', () => {
  it('parses a single legacy sentence with no delimiter', () => {
    expect(parseSentencePairs('I bought a car.', 'Tôi đã mua xe.')).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
    ]);
  });

  it('splits multiple sentences delimited by ()', () => {
    const example = 'I bought a car.()The report was late.';
    const exampleVi = 'Tôi đã mua xe.()Báo cáo bị trễ.';
    expect(parseSentencePairs(example, exampleVi)).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: 'Báo cáo bị trễ.' },
    ]);
  });

  it('trims whitespace around each sentence and meaning', () => {
    const example = ' I bought a car. () The report was late. ';
    const exampleVi = ' Tôi đã mua xe. () Báo cáo bị trễ. ';
    expect(parseSentencePairs(example, exampleVi)).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: 'Báo cáo bị trễ.' },
    ]);
  });

  it('fills missing meanings with an empty string when fewer meanings than sentences', () => {
    const example = 'I bought a car.()The report was late.';
    expect(parseSentencePairs(example, 'Tôi đã mua xe.')).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: '' },
    ]);
  });

  it('returns an empty array for missing or empty input', () => {
    expect(parseSentencePairs(null, null)).toEqual([]);
    expect(parseSentencePairs('', '')).toEqual([]);
  });
});

describe('buildBlank', () => {
  it('replaces a case-insensitive whole-word match with ____', () => {
    expect(buildBlank('I have money in my Savings Account.', 'savings account'))
      .toBe('I have money in my ____.');
  });

  it('returns null when the word text is not present', () => {
    expect(buildBlank('The report was late again.', 'savings account')).toBeNull();
  });

  it('does not match a substring inside a longer word', () => {
    expect(buildBlank('The category was wrong.', 'cat')).toBeNull();
  });

  it('returns null for empty sentence or word', () => {
    expect(buildBlank('', 'cat')).toBeNull();
    expect(buildBlank('The cat sat.', '')).toBeNull();
  });
});

describe('hasUsableSentence', () => {
  it('returns true when at least one sentence can be blanked', () => {
    const example = 'The report was late.()I have money in my savings account.';
    expect(hasUsableSentence(example, 'savings account')).toBe(true);
  });

  it('returns false when no sentence matches the word', () => {
    const example = 'The report was late.()Nothing else here.';
    expect(hasUsableSentence(example, 'savings account')).toBe(false);
  });

  it('returns false for missing example', () => {
    expect(hasUsableSentence(null, 'savings account')).toBe(false);
  });
});
