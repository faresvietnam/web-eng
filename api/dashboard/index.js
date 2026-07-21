const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: progressToday, error: progressTodayError } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (progressTodayError) {
    res.status(500).json({ error: progressTodayError.message });
    return;
  }

  const { count: dueCount, error: dueCountError } = await supabase
    .from('review_state')
    .select('word_id', { count: 'exact', head: true })
    .neq('status', 'new')
    .lte('next_review_at', now.toISOString());
  if (dueCountError) {
    res.status(500).json({ error: dueCountError.message });
    return;
  }

  const { data: statusRows, error: statusRowsError } = await supabase
    .from('review_state')
    .select('status');
  if (statusRowsError) {
    res.status(500).json({ error: statusRowsError.message });
    return;
  }
  const totals = { new: 0, learning: 0, difficult: 0 };
  (statusRows || []).forEach((row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
  });

  const { data: recentLogs, error: recentLogsError } = await supabase
    .from('review_log')
    .select('result')
    .order('reviewed_at', { ascending: false })
    .limit(200);
  if (recentLogsError) {
    res.status(500).json({ error: recentLogsError.message });
    return;
  }
  const goodOrHard = (recentLogs || []).filter((l) => l.result === 'good' || l.result === 'hard').length;
  const accuracy = recentLogs && recentLogs.length > 0 ? goodOrHard / recentLogs.length : null;

  const { data: allProgress, error: allProgressError } = await supabase
    .from('daily_progress')
    .select('*')
    .order('date', { ascending: false })
    .limit(60);
  if (allProgressError) {
    res.status(500).json({ error: allProgressError.message });
    return;
  }
  const byDate = new Map((allProgress || []).map((p) => [p.date, p]));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const p = byDate.get(key);
    if (p && (p.new_learned > 0 || p.reviewed_count > 0)) {
      streak += 1;
    } else {
      break;
    }
  }

  const { data: difficultWords, error: difficultWordsError } = await supabase
    .from('review_state')
    .select('*, words(word, meaning)')
    .or('status.eq.difficult,failure_count.gt.0')
    .order('failure_count', { ascending: false })
    .limit(10);
  if (difficultWordsError) {
    res.status(500).json({ error: difficultWordsError.message });
    return;
  }

  res.status(200).json({
    new_learned_today: progressToday?.new_learned || 0,
    reviewed_today: progressToday?.reviewed_count || 0,
    new_limit: 20,
    review_limit: 100,
    due_count: dueCount || 0,
    streak,
    accuracy,
    totals,
    difficult_words: difficultWords || [],
  });
};
