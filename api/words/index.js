// api/words/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { upsertWordPart } = require('../../lib/upsertWordPart');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
    let query = supabase
      .from('words')
      .select('*, review_state!inner(*), prefix:prefixes(*), root:roots(*), suffix:suffixes(*)');
    if (req.query.status) {
      query = query.eq('review_state.status', req.query.status);
    }
    if (req.query.root_id) {
      query = query.eq('root_id', req.query.root_id);
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
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const now = new Date().toISOString();
    let prefix_id, root_id, suffix_id;
    try {
      [prefix_id, root_id, suffix_id] = await Promise.all([
        upsertWordPart(supabase, 'prefixes', 'prefix', prefix),
        upsertWordPart(supabase, 'roots', 'root', root),
        upsertWordPart(supabase, 'suffixes', 'suffix', suffix),
      ]);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data: inserted, error: insertError } = await supabase
      .from('words')
      .insert({ word, meaning, category, part_of_speech, ipa, example, example_vi, prefix_id, root_id, suffix_id })
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
      await supabase.from('words').delete().eq('id', inserted.id);
      res.status(500).json({ error: reviewStateError.message });
      return;
    }
    res.status(201).json({ word: inserted });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
