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

  const { data: dailyProgress } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  const { data: dueStates, error: dueError } = await supabase
    .from('review_state')
    .select('*, words(*)')
    .neq('status', 'new')
    .lte('next_review_at', now.toISOString());
  if (dueError) {
    res.status(500).json({ error: dueError.message });
    return;
  }

  const { data: newStates, error: newError } = await supabase
    .from('review_state')
    .select('*, words(*)')
    .eq('status', 'new');
  if (newError) {
    res.status(500).json({ error: newError.message });
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
