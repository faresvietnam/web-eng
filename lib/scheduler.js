const FIXED_STEPS_MINUTES = [0, 10, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 14 * 24 * 60, 30 * 24 * 60, 60 * 24 * 60];
const DIFFICULT_STEPS_MINUTES = [10, 24 * 60, 3 * 24 * 60];

function addMinutesIso(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function applyReview({ reviewState, result, now }) {
  const state = { ...reviewState, last_review_at: now.toISOString() };

  if (state.status === 'difficult') {
    if (result === 'again') {
      state.difficult_stage = 0;
      state.next_review_at = addMinutesIso(now, 10);
      state.failure_count += 1;
      state.correct_count = 0;
      return state;
    }
    const nextStage = state.difficult_stage + 1;
    if (nextStage > 2) {
      state.status = 'learning';
      state.interval_days = 7;
      state.difficult_stage = null;
      state.correct_count = 0;
      state.next_review_at = addMinutesIso(now, 7 * 24 * 60);
    } else {
      state.difficult_stage = nextStage;
      state.next_review_at = addMinutesIso(now, DIFFICULT_STEPS_MINUTES[nextStage]);
    }
    return state;
  }

  const inFixedPhase = state.status === 'new' || state.interval_days === 0;
  if (inFixedPhase) {
    if (result === 'again') {
      state.step_index = 1;
      state.next_review_at = addMinutesIso(now, 10);
      state.failure_count += 1;
      state.correct_count = 0;
      state.status = state.failure_count >= 3 ? 'difficult' : 'learning';
      state.difficult_stage = state.failure_count >= 3 ? 0 : state.difficult_stage;
      return state;
    }
    const nextStep = state.step_index + 1;
    state.correct_count += 1;
    if (nextStep > 7) {
      state.status = 'learning';
      state.interval_days = 60;
      state.step_index = 8;
      state.next_review_at = addMinutesIso(now, 60 * 24 * 60);
    } else {
      state.status = 'learning';
      state.step_index = nextStep;
      state.next_review_at = addMinutesIso(now, FIXED_STEPS_MINUTES[nextStep]);
    }
    return state;
  }

  if (result === 'again') {
    state.next_review_at = addMinutesIso(now, 10);
    state.interval_days = 1;
    state.failure_count += 1;
    state.correct_count = 0;
    if (state.failure_count >= 3) {
      state.status = 'difficult';
      state.difficult_stage = 0;
    }
    return state;
  }

  const multiplier = result === 'hard' ? 1.2 : 2;
  state.interval_days = state.interval_days * multiplier;
  state.correct_count += 1;
  state.next_review_at = addMinutesIso(now, state.interval_days * 24 * 60);
  return state;
}

module.exports = { applyReview, FIXED_STEPS_MINUTES, DIFFICULT_STEPS_MINUTES };
