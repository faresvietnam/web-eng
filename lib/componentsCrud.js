const VALID_TYPES = ['root', 'prefix', 'suffix', 'combining_form'];

async function handleList(req, res, supabase) {
  if (req.method === 'GET') {
    const type = req.query.type;
    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({ error: 'Thiếu hoặc sai type' });
      return;
    }
    const { data, error } = await supabase
      .from('components')
      .select('*')
      .eq('component_type', type)
      .order('text');
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ components: data });
    return;
  }

  if (req.method === 'POST') {
    const { component_type, text, meaning, root_subtype } = req.body || {};
    if (!VALID_TYPES.includes(component_type)) {
      res.status(400).json({ error: 'Thiếu hoặc sai component_type' });
      return;
    }
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Thiếu text' });
      return;
    }
    const resolvedRootSubtype = component_type === 'root' ? (root_subtype || null) : null;
    const { data, error } = await supabase
      .from('components')
      .insert({ component_type, text: text.trim(), meaning: meaning || null, root_subtype: resolvedRootSubtype })
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ component: data });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function handleItem(req, res, supabase, id) {
  if (req.method === 'PUT') {
    const { component_type, text, meaning, root_subtype } = req.body || {};
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Thiếu text' });
      return;
    }
    const resolvedRootSubtype = component_type === 'root' ? (root_subtype ?? null) : null;
    const { data, error } = await supabase
      .from('components')
      .update({ text: text.trim(), meaning: meaning ?? null, root_subtype: resolvedRootSubtype })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ component: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('components').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

module.exports = { handleList, handleItem };
