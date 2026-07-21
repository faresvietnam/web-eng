const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  const supabase = getSupabaseClient();

  if (req.method === 'GET') {
    let query = supabase.from('words').select('*, review_state(*)');
    if (req.query.status) {
      query = query.eq('review_state.status', req.query.status);
    }
    if (req.query.q) {
      const term = `%${req.query.q}%`;
      query = query.or(`word.ilike.${term},meaning.ilike.${term},category.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ words: data });
    return;
  }

  if (req.method === 'POST') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, segments } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('words')
      .insert({ word, meaning, category, part_of_speech, ipa, example, example_vi, segments })
      .select()
      .single();
    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }
    const { error: reviewStateError } = await supabase.from('review_state').insert({
      word_id: inserted.id,
      status: 'new',
      step_index: 0,
      interval_days: 0,
      correct_count: 0,
      failure_count: 0,
      next_review_at: now,
    });
    if (reviewStateError) {
      res.status(500).json({ error: reviewStateError.message });
      return;
    }
    res.status(201).json({ word: inserted });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
