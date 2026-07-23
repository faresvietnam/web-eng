const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createListHandler, createItemHandler } = require('../../lib/wordPartsCrud');

const handleList = createListHandler('roots', 'root');
const handleItem = createItemHandler('roots', 'root');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (id) {
    await handleItem(req, res, supabase, id);
  } else {
    await handleList(req, res, supabase);
  }
};
