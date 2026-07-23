import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasSegments: true, hasExample: true })).toBe('full_type');
  });

  it('returns new_combo at correct_count 0', () => {
    expect(pickExerciseType({ status: 'new', correct_count: 0, hasSegments: false, hasExample: false })).toBe('new_combo');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasSegments: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns mc_sentence at correct_count 2 when hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: false, hasExample: true })).toBe('mc_sentence');
  });

  it('falls back to mc_vi_en at correct_count 2 when not hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns segment at correct_count 3 when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasSegments: true, hasExample: false })).toBe('segment');
  });

  it('returns full_type at correct_count 3 when not hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasSegments: false, hasExample: false })).toBe('full_type');
  });

  it('returns full_type at correct_count 4 even when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 4, hasSegments: true, hasExample: true })).toBe('full_type');
  });

  it('returns full_type at correct_count 10 when not hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasSegments: false, hasExample: false })).toBe('full_type');
  });
});
