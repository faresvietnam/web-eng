// api/words/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { resolveComponentIds, replaceWordComponents } = require('../../lib/wordComponents');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const id = req.query.id;

  if (req.method === 'PUT') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, components } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    let componentIds;
    try {
      componentIds = await resolveComponentIds(supabase, components);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data, error } = await supabase
      .from('words')
      .update({ word, meaning, category, part_of_speech, ipa, example, example_vi })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    try {
      await replaceWordComponents(supabase, id, componentIds);
    } catch (err) {
      res.status(500).json({ error: err.message });
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
