import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasSegments: true })).toBe('full_type');
  });

  it('returns mc_en_vi at correct_count 0', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 0, hasSegments: false })).toBe('mc_en_vi');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasSegments: false })).toBe('mc_vi_en');
  });

  it('returns segment at correct_count >= 2 when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: true })).toBe('segment');
  });

  it('returns full_type at correct_count >= 2 when no segments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 5, hasSegments: false })).toBe('full_type');
  });
});
