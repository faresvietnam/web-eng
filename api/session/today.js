const { getSupabaseClient } = require('../../lib/supabaseClient');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [
    { data: dailyProgress, error: dailyProgressError },
    { data: dueStates, error: dueError },
    { data: newStates, error: newError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select('*, words(*)')
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select('*, words(*)').eq('status', 'new'),
  ]);

  const queryError = dailyProgressError || dueError || newError;
  if (queryError) {
    res.status(500).json({ error: queryError.message });
    return;
  }

  const queue = buildDailyQueue({
    dueReviewStates: dueStates,
    newWordStates: newStates,
    dailyProgress: dailyProgress || { new_learned: 0, reviewed_count: 0 },
    now,
  });

  const cards = queue.map((state) => ({
    word: state.words,
    review_state: state,
    exercise_type: pickExerciseType({
      status: state.status,
      correct_count: state.correct_count,
      hasSegments: Boolean(state.words.segments),
    }),
  }));

  res.status(200).json({ cards, total: cards.length });
};
