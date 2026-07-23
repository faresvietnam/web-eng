const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { parseWordsCsv } = require('../../lib/csv');
const { resolveComponentIds, replaceWordComponents } = require('../../lib/wordComponents');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;

  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!csvText) {
    res.status(400).json({ error: 'Thiếu nội dung CSV' });
    return;
  }

  const { rows, errors } = parseWordsCsv(csvText);
  if (rows.length === 0) {
    res.status(200).json({ imported: 0, errors });
    return;
  }

  const supabase = getSupabaseClient(token);
  const now = new Date().toISOString();
  const importedIds = [];

  try {
    for (const row of rows) {
      const { components, ...wordFields } = row;
      const { data: insertedWord, error: insertError } = await supabase
        .from('words')
        .insert(wordFields)
        .select()
        .single();
      if (insertError) throw insertError;

      const componentIds = await resolveComponentIds(supabase, components);
      await replaceWordComponents(supabase, insertedWord.id, componentIds);

      const { error: reviewStateError } = await supabase.from('review_state').insert({
        word_id: insertedWord.id,
        status: 'new',
        step_index: 0,
        interval_days: 0,
        correct_count: 0,
        failure_count: 0,
        next_review_at: now,
      });
      if (reviewStateError) throw reviewStateError;

      importedIds.push(insertedWord.id);
    }
  } catch (err) {
    if (importedIds.length > 0) {
      const { error: cleanupError } = await supabase.from('words').delete().in('id', importedIds);
      if (cleanupError) {
        console.error('Failed to clean up partially imported words:', cleanupError.message);
      }
    }
    res.status(500).json({ error: err.message });
    return;
  }

  res.status(200).json({ imported: importedIds.length, errors });
};
