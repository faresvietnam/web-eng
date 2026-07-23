async function upsertWordPart(supabase, table, column, text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq(column, trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from(table)
    .insert({ [column]: trimmed })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

module.exports = { upsertWordPart };
