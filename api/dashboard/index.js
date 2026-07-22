const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

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

  const [
    { data: progressToday, error: progressTodayError },
    { count: dueCount, error: dueCountError },
    { data: statusRows, error: statusRowsError },
    { data: recentLogs, error: recentLogsError },
    { data: allProgress, error: allProgressError },
    { data: difficultWords, error: difficultWordsError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select('word_id', { count: 'exact', head: true })
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select('status'),
    supabase.from('review_log').select('result').order('reviewed_at', { ascending: false }).limit(200),
    supabase.from('daily_progress').select('*').order('date', { ascending: false }).limit(60),
    supabase
      .from('review_state')
      .select('*, words(word, meaning)')
      .or('status.eq.difficult,failure_count.gt.0')
      .order('failure_count', { ascending: false })
      .limit(10),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  const queryError =
    progressTodayError ||
    dueCountError ||
    statusRowsError ||
    recentLogsError ||
    allProgressError ||
    difficultWordsError ||
    settingsError;
  if (queryError) {
    res.status(500).json({ error: queryError.message });
    return;
  }

  const totals = { new: 0, learning: 0, difficult: 0 };
  (statusRows || []).forEach((row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
  });

  const goodOrHard = (recentLogs || []).filter((l) => l.result === 'good' || l.result === 'hard').length;
  const accuracy = recentLogs && recentLogs.length > 0 ? goodOrHard / recentLogs.length : null;

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

  res.status(200).json({
    new_learned_today: progressToday?.new_learned || 0,
    reviewed_today: progressToday?.reviewed_count || 0,
    new_limit: settings?.new_daily_limit ?? 20,
    review_limit: settings?.review_daily_limit ?? 100,
    due_count: dueCount || 0,
    streak,
    accuracy,
    totals,
    difficult_words: difficultWords || [],
  });
};
