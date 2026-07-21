const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabaseClient() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return client;
}

module.exports = { getSupabaseClient };
