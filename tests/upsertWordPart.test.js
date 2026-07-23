import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { upsertWordPart } = require('../lib/upsertWordPart');

function makeSupabase({ existingId = null, insertedId = null } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingId ? { id: existingId } : null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: insertedId }, error: null }),
        }),
      }),
    }),
  };
}

describe('upsertWordPart', () => {
  it('returns null for empty text without querying supabase', async () => {
    const id = await upsertWordPart(null, 'roots', 'root', '');
    expect(id).toBeNull();
  });

  it('returns null for whitespace-only text', async () => {
    const id = await upsertWordPart(null, 'roots', 'root', '   ');
    expect(id).toBeNull();
  });

  it('returns the existing row id when the trimmed text already exists', async () => {
    const supabase = makeSupabase({ existingId: 5 });
    const id = await upsertWordPart(supabase, 'roots', 'root', ' act ');
    expect(id).toBe(5);
  });

  it('creates a new row and returns its id when the text does not exist', async () => {
    const supabase = makeSupabase({ existingId: null, insertedId: 9 });
    const id = await upsertWordPart(supabase, 'roots', 'root', 'spect');
    expect(id).toBe(9);
  });
});
