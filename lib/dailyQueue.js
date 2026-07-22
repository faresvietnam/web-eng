function buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now, newDailyLimit, reviewDailyLimit }) {
  const reviewSlots = Math.max(0, reviewDailyLimit - (dailyProgress.reviewed_count || 0));
  const newSlots = Math.max(0, newDailyLimit - (dailyProgress.new_learned || 0));

  const sortedDue = [...dueReviewStates].sort((a, b) => {
    if (b.failure_count !== a.failure_count) return b.failure_count - a.failure_count;
    return new Date(a.next_review_at) - new Date(b.next_review_at);
  });
  const reviewQueue = sortedDue.slice(0, reviewSlots);

  const sortedNew = [...newWordStates].sort((a, b) => a.word_id - b.word_id);
  const newQueue = sortedNew.slice(0, newSlots);

  return [...reviewQueue, ...newQueue];
}

module.exports = { buildDailyQueue };
