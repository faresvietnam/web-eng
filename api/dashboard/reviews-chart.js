const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const days = Math.max(1, Math.floor(Number(req.query.days)) || 7);
  const supabase = getSupabaseClient();
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('daily_progress')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const byDate = new Map((data || []).map((row) => [row.date, row]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    result.push({ date: key, new_learned: row?.new_learned || 0, reviewed_count: row?.reviewed_count || 0 });
  }

  res.status(200).json({ days: result });
};
