const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');
const { hasUsableSentence } = require('../../lib/sentenceBlank');
const { attachWordType } = require('../../lib/wordType');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const wordsSelect = '*, word_components(position, component:components(*))';

  const [
    { data: dailyProgress, error: dailyProgressError },
    { data: dueStates, error: dueError },
    { data: newStates, error: newError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select(`*, words(${wordsSelect})`)
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select(`*, words(${wordsSelect})`).eq('status', 'new'),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  const queryError = dailyProgressError || dueError || newError || settingsError;
  if (queryError) {
    res.status(500).json({ error: queryError.message });
    return;
  }

  const queue = buildDailyQueue({
    dueReviewStates: dueStates,
    newWordStates: newStates,
    dailyProgress: dailyProgress || { new_learned: 0, reviewed_count: 0 },
    now,
    newDailyLimit: settings?.new_daily_limit ?? 20,
    reviewDailyLimit: settings?.review_daily_limit ?? 100,
  });

  const cards = queue.map((state) => {
    const word = attachWordType(state.words);
    return {
      word,
      review_state: state,
      exercise_type: pickExerciseType({
        status: state.status,
        correct_count: state.correct_count,
        hasParts: word.word_components.length > 0,
        hasExample: hasUsableSentence(state.words.example, state.words.word),
      }),
    };
  });

  res.status(200).json({ cards, total: cards.length });
};
