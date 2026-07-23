const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createItemHandler } = require('../../lib/wordPartsCrud');

const handleItem = createItemHandler('roots', 'root');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleItem(req, res, supabase, req.query.id);
};
