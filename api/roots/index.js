const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createListHandler } = require('../../lib/wordPartsCrud');

const handleList = createListHandler('roots', 'root');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleList(req, res, supabase);
};
