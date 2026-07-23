function pickExerciseType({ status, correct_count, hasSegments, hasExample }) {
  if (status === 'difficult') return 'full_type';
  if (correct_count === 0) return 'new_combo';
  if (correct_count === 1) return 'mc_vi_en';
  if (correct_count === 2) return hasExample ? 'mc_sentence' : 'mc_vi_en';
  return hasSegments ? 'segment' : 'full_type';
}

module.exports = { pickExerciseType };
