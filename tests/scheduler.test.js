// tests/scheduler.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { applyReview } = require('../lib/scheduler');

function baseState(overrides = {}) {
  return {
    status: 'new',
    step_index: 0,
    interval_days: 0,
    correct_count: 0,
    failure_count: 0,
    last_review_at: null,
    next_review_at: '2026-07-21T00:00:00.000Z',
    difficult_stage: null,
    ...overrides,
  };
}

const NOW = new Date('2026-07-21T00:00:00.000Z');

describe('applyReview - fixed step phase', () => {
  it('advances step_index and schedules the next fixed step on correct answer', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 0 }), result: 'good', now: NOW });
    expect(next.step_index).toBe(1);
    expect(next.status).toBe('learning');
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('resets to step_index 1 and marks 10-minute retry on Again', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 4, failure_count: 0 }), result: 'again', now: NOW });
    expect(next.step_index).toBe(1);
    expect(next.correct_count).toBe(0);
    expect(next.failure_count).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('marks status difficult after 3 failures', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 3, failure_count: 2 }), result: 'again', now: NOW });
    expect(next.status).toBe('difficult');
    expect(next.difficult_stage).toBe(0);
  });

  it('enters interval mode with interval_days=60 after passing step 7', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 7, status: 'learning' }), result: 'good', now: NOW });
    expect(next.status).toBe('learning');
    expect(next.interval_days).toBe(60);
    expect(next.step_index).toBe(8);
  });
});

describe('applyReview - stabilized interval phase', () => {
  const stable = baseState({ status: 'learning', step_index: 8, interval_days: 10 });

  it('multiplies interval by 2 on good', () => {
    const next = applyReview({ reviewState: stable, result: 'good', now: NOW });
    expect(next.interval_days).toBe(20);
  });

  it('multiplies interval by 1.2 on hard', () => {
    const next = applyReview({ reviewState: stable, result: 'hard', now: NOW });
    expect(next.interval_days).toBeCloseTo(12, 5);
  });

  it('resets interval_days to 1 and schedules 10min retry on again', () => {
    const next = applyReview({ reviewState: stable, result: 'again', now: NOW });
    expect(next.interval_days).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('marks difficult after 3rd failure', () => {
    const next = applyReview({ reviewState: baseState({ status: 'learning', step_index: 8, interval_days: 5, failure_count: 2 }), result: 'again', now: NOW });
    expect(next.status).toBe('difficult');
    expect(next.difficult_stage).toBe(0);
  });
});

describe('applyReview - difficult phase', () => {
  const difficult = baseState({ status: 'difficult', difficult_stage: 0, failure_count: 3 });

  it('advances difficult_stage on correct answer', () => {
    const next = applyReview({ reviewState: difficult, result: 'good', now: NOW });
    expect(next.difficult_stage).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 24 * 60 * 60000).toISOString());
  });

  it('graduates to learning with interval_days=7 after stage 2 passed', () => {
    const next = applyReview({ reviewState: baseState({ status: 'difficult', difficult_stage: 2, failure_count: 3 }), result: 'good', now: NOW });
    expect(next.status).toBe('learning');
    expect(next.interval_days).toBe(7);
    expect(next.difficult_stage).toBe(null);
  });

  it('resets difficult_stage to 0 on again', () => {
    const next = applyReview({ reviewState: baseState({ status: 'difficult', difficult_stage: 1, failure_count: 3 }), result: 'again', now: NOW });
    expect(next.difficult_stage).toBe(0);
    expect(next.failure_count).toBe(4);
  });
});
