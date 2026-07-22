export function dailyGoalStats(dailyGoal) {
  const remainingReview = Math.max(0, Math.min(dailyGoal.due_count, dailyGoal.review_limit - dailyGoal.reviewed_today));
  const remainingNew = Math.max(0, Math.min(dailyGoal.totals.new || 0, dailyGoal.new_limit - dailyGoal.new_learned_today));
  const doneToday = dailyGoal.reviewed_today + dailyGoal.new_learned_today;
  const totalToday = doneToday + remainingReview + remainingNew;
  return { remainingReview, remainingNew, doneToday, totalToday };
}

export function renderDailyGoalText(dailyGoal) {
  if (!dailyGoal) return '...';
  const { remainingReview, remainingNew, doneToday, totalToday } = dailyGoalStats(dailyGoal);
  if (remainingReview + remainingNew === 0) return 'Đã hoàn thành hôm nay! 🎉';
  return `${doneToday} / ${totalToday} việc`;
}

export function dailyGoalProgress(dailyGoal) {
  if (!dailyGoal) return 0;
  const { remainingReview, remainingNew, doneToday, totalToday } = dailyGoalStats(dailyGoal);
  if (remainingReview + remainingNew === 0) return 100;
  return Math.min(100, (doneToday / totalToday) * 100);
}
