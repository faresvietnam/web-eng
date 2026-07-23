function createListHandler(table, column) {
  return async function handleList(req, res, supabase) {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from(table).select('*').order(column);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ [table]: data });
      return;
    }

    if (req.method === 'POST') {
      const text = req.body?.[column];
      if (!text || !text.trim()) {
        res.status(400).json({ error: `Thiếu ${column}` });
        return;
      }
      const { data, error } = await supabase
        .from(table)
        .insert({ [column]: text.trim(), meaning: req.body?.meaning || null })
        .select()
        .single();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(201).json({ [column]: data });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  };
}

function createItemHandler(table, column) {
  return async function handleItem(req, res, supabase, id) {
    if (req.method === 'PUT') {
      const text = req.body?.[column];
      if (!text || !text.trim()) {
        res.status(400).json({ error: `Thiếu ${column}` });
        return;
      }
      const { data, error } = await supabase
        .from(table)
        .update({ [column]: text.trim(), meaning: req.body?.meaning ?? null })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ [column]: data });
      return;
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(204).end();
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  };
}

module.exports = { createListHandler, createItemHandler };
