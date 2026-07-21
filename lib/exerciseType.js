function pickExerciseType({ status, correct_count, hasSegments }) {
  if (status === 'difficult') return 'full_type';
  if (correct_count === 0) return 'mc_en_vi';
  if (correct_count === 1) return 'mc_vi_en';
  return hasSegments ? 'segment' : 'full_type';
}

module.exports = { pickExerciseType };
