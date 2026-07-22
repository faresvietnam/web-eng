const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({
      new_daily_limit: data?.new_daily_limit ?? 20,
      review_daily_limit: data?.review_daily_limit ?? 100,
    });
    return;
  }

  if (req.method === 'PUT') {
    const { new_daily_limit, review_daily_limit } = req.body || {};
    const isValid = (x) => Number.isInteger(x) && x > 0;
    if (!isValid(new_daily_limit) || !isValid(review_daily_limit)) {
      res.status(400).json({ error: 'new_daily_limit và review_daily_limit phải là số nguyên dương' });
      return;
    }
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ new_daily_limit, review_daily_limit })
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
