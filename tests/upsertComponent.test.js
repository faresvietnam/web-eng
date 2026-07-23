import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { upsertComponent } = require('../lib/upsertComponent');

function makeSupabase({ existingId = null, existingRootSubtype = null, insertedId = null } = {}) {
  const updates = [];
  return {
    _updates: updates,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: existingId ? { id: existingId, root_subtype: existingRootSubtype } : null,
              error: null,
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: insertedId }, error: null }),
        }),
      }),
      update: (payload) => ({
        eq: async () => {
          updates.push(payload);
          return { error: null };
        },
      }),
    }),
  };
}

describe('upsertComponent', () => {
  it('returns null for empty text without querying supabase', async () => {
    const id = await upsertComponent(null, 'root', '');
    expect(id).toBeNull();
  });

  it('returns null for whitespace-only text', async () => {
    const id = await upsertComponent(null, 'root', '   ');
    expect(id).toBeNull();
  });

  it('returns the existing row id when the trimmed text already exists', async () => {
    const supabase = makeSupabase({ existingId: 5 });
    const id = await upsertComponent(supabase, 'root', ' act ');
    expect(id).toBe(5);
  });

  it('creates a new row and returns its id when the text does not exist', async () => {
    const supabase = makeSupabase({ existingId: null, insertedId: 9 });
    const id = await upsertComponent(supabase, 'root', 'spect');
    expect(id).toBe(9);
  });

  it('updates root_subtype on the existing row when a different value is passed', async () => {
    const supabase = makeSupabase({ existingId: 5, existingRootSubtype: null });
    const id = await upsertComponent(supabase, 'root', 'act', 'free_root');
    expect(id).toBe(5);
    expect(supabase._updates).toEqual([{ root_subtype: 'free_root' }]);
  });

  it('does not issue an update when root_subtype already matches', async () => {
    const supabase = makeSupabase({ existingId: 5, existingRootSubtype: 'free_root' });
    const id = await upsertComponent(supabase, 'root', 'act', 'free_root');
    expect(id).toBe(5);
    expect(supabase._updates).toEqual([]);
  });
});
