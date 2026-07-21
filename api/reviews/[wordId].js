const { getSupabaseClient } = require('../../lib/supabaseClient');
const { applyReview } = require('../../lib/scheduler');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const wordId = req.query.wordId;
  const { exercise_type, result } = req.body || {};
  if (!exercise_type || !result) {
    res.status(400).json({ error: 'Thiếu exercise_type hoặc result' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();

  const { data: reviewState, error: fetchError } = await supabase
    .from('review_state')
    .select('*')
    .eq('word_id', wordId)
    .single();
  if (fetchError || !reviewState) {
    res.status(404).json({ error: 'Không tìm thấy review_state' });
    return;
  }

  const wasNew = reviewState.status === 'new';
  const nextState = applyReview({ reviewState, result, now });

  const { error: updateError } = await supabase
    .from('review_state')
    .update(nextState)
    .eq('word_id', wordId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  await supabase.from('review_log').insert({
    word_id: wordId,
    reviewed_at: now.toISOString(),
    result,
    exercise_type,
  });

  const today = now.toISOString().slice(0, 10);
  const { data: progress, error: progressError } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (progressError) {
    res.status(500).json({ error: progressError.message });
    return;
  }

  await supabase.from('daily_progress').upsert({
    date: today,
    new_learned: (progress?.new_learned || 0) + (wasNew ? 1 : 0),
    reviewed_count: (progress?.reviewed_count || 0) + (wasNew ? 0 : 1),
  });

  res.status(200).json({ review_state: nextState });
};
