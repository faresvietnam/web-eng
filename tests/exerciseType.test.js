import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasParts: true, hasExample: true })).toBe('full_type');
  });

  it('returns new_combo at correct_count 0', () => {
    expect(pickExerciseType({ status: 'new', correct_count: 0, hasParts: false, hasExample: false })).toBe('new_combo');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasParts: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns mc_sentence at correct_count 2 when hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasParts: false, hasExample: true })).toBe('mc_sentence');
  });

  it('falls back to mc_vi_en at correct_count 2 when not hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasParts: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns parts at correct_count 3 when hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasParts: true, hasExample: false })).toBe('parts');
  });

  it('returns full_type at correct_count 3 when not hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasParts: false, hasExample: false })).toBe('full_type');
  });

  it('keeps returning parts at correct_count 4+ when hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 4, hasParts: true, hasExample: true })).toBe('parts');
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasParts: true, hasExample: false })).toBe('parts');
  });

  it('returns full_type at correct_count 10 when not hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasParts: false, hasExample: false })).toBe('full_type');
  });
});
