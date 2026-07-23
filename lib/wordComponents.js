const { upsertComponent } = require('./upsertComponent');

async function resolveComponentIds(supabase, components) {
  if (!Array.isArray(components) || components.length === 0) return [];
  const ids = [];
  for (const c of components) {
    const id = await upsertComponent(supabase, c.component_type, c.text, c.root_subtype);
    if (id) ids.push(id);
  }
  return ids;
}

async function replaceWordComponents(supabase, wordId, componentIds) {
  const { error: deleteError } = await supabase.from('word_components').delete().eq('word_id', wordId);
  if (deleteError) throw deleteError;
  if (!componentIds || componentIds.length === 0) return;
  const rows = componentIds.map((component_id, position) => ({ word_id: wordId, component_id, position }));
  const { error: insertError } = await supabase.from('word_components').insert(rows);
  if (insertError) throw insertError;
}

module.exports = { resolveComponentIds, replaceWordComponents };
