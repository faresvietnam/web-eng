import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildDailyQueue } = require('../lib/dailyQueue');

const NOW = new Date('2026-07-21T00:00:00.000Z');

function due(word_id, failure_count, next_review_at) {
  return { word_id, failure_count, next_review_at, status: 'learning' };
}

function fresh(word_id) {
  return { word_id, status: 'new' };
}

describe('buildDailyQueue', () => {
  it('puts review words before new words', () => {
    const queue = buildDailyQueue({
      dueReviewStates: [due(1, 0, '2026-07-20T00:00:00.000Z')],
      newWordStates: [fresh(2)],
      dailyProgress: { new_learned: 0, reviewed_count: 0 },
      now: NOW,
    });
    expect(queue.map((s) => s.word_id)).toEqual([1, 2]);
  });

  it('sorts due reviews by failure_count desc, then next_review_at asc', () => {
    const queue = buildDailyQueue({
      dueReviewStates: [
        due(1, 0, '2026-07-20T00:00:00.000Z'),
        due(2, 2, '2026-07-19T00:00:00.000Z'),
        due(3, 2, '2026-07-18T00:00:00.000Z'),
      ],
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 0 },
      now: NOW,
    });
    expect(queue.map((s) => s.word_id)).toEqual([3, 2, 1]);
  });

  it('caps review count at 100 minus reviewed_count today', () => {
    const dueReviewStates = Array.from({ length: 5 }, (_, i) => due(i + 1, 0, '2026-07-20T00:00:00.000Z'));
    const queue = buildDailyQueue({
      dueReviewStates,
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 98 },
      now: NOW,
    });
    expect(queue.length).toBe(2);
  });

  it('caps new words at 20 minus new_learned today, ordered by word_id', () => {
    const newWordStates = [fresh(3), fresh(1), fresh(2)];
    const queue = buildDailyQueue({
      dueReviewStates: [],
      newWordStates,
      dailyProgress: { new_learned: 19, reviewed_count: 0 },
      now: NOW,
    });
    expect(queue.map((s) => s.word_id)).toEqual([1]);
  });
});
