async function upsertComponent(supabase, componentType, text, rootSubtype) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('components')
    .select('id, root_subtype')
    .eq('component_type', componentType)
    .eq('text', trimmed)
    .maybeSingle();

  if (existing) {
    if (rootSubtype && rootSubtype !== existing.root_subtype) {
      const { error } = await supabase
        .from('components')
        .update({ root_subtype: rootSubtype })
        .eq('id', existing.id);
      if (error) throw error;
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('components')
    .insert({ component_type: componentType, text: trimmed, root_subtype: rootSubtype || null })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

module.exports = { upsertComponent };
