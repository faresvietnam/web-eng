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

  it('finds the row created by a prior sequential call instead of inserting a duplicate', async () => {
    // Simulates the fixed api/words/import.js behavior: two rows share the same
    // root text ("act"), and their upsertWordPart calls are awaited sequentially
    // (not concurrently). The mock tracks rows across calls so the second call's
    // select() sees what the first call's insert() created.
    const rowsByText = new Map();
    let nextId = 1;
    let insertCount = 0;

    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_column, value) => ({
            maybeSingle: async () => ({
              data: rowsByText.has(value) ? { id: rowsByText.get(value) } : null,
              error: null,
            }),
          }),
        }),
        insert: (payload) => ({
          select: () => ({
            single: async () => {
              insertCount += 1;
              const value = payload.root;
              if (rowsByText.has(value)) {
                return { data: null, error: new Error('duplicate key value violates unique constraint') };
              }
              const id = nextId++;
              rowsByText.set(value, id);
              return { data: { id }, error: null };
            },
          }),
        }),
      }),
    };

    const firstId = await upsertWordPart(supabase, 'roots', 'root', 'act');
    const secondId = await upsertWordPart(supabase, 'roots', 'root', 'act');

    expect(firstId).toBe(secondId);
    expect(insertCount).toBe(1);
  });
});
