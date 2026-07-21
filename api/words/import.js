const { getSupabaseClient } = require('../../lib/supabaseClient');
const { parseWordsCsv } = require('../../lib/csv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase.from('words').insert(rows).select();
  if (insertError) {
    res.status(500).json({ error: insertError.message });
    return;
  }

  const reviewStates = inserted.map((w) => ({
    word_id: w.id,
    status: 'new',
    step_index: 0,
    interval_days: 0,
    correct_count: 0,
    failure_count: 0,
    next_review_at: now,
  }));

  const { error: reviewStateError } = await supabase.from('review_state').insert(reviewStates);
  if (reviewStateError) {
    const { error: cleanupError } = await supabase
      .from('words')
      .delete()
      .in('id', inserted.map((w) => w.id));
    if (cleanupError) {
      console.error('Failed to clean up orphaned words after review_state insert failure:', cleanupError.message);
    }
    res.status(500).json({ error: reviewStateError.message });
    return;
  }

  res.status(200).json({ imported: inserted.length, errors });
};
