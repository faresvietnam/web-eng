// api/words/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { upsertWordPart } = require('../../lib/upsertWordPart');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const id = req.query.id;

  if (req.method === 'PUT') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
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
    const { data, error } = await supabase
      .from('words')
      .update({ word, meaning, category, part_of_speech, ipa, example, example_vi, prefix_id, root_id, suffix_id })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ word: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('words').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
