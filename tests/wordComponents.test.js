import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveComponentIds, replaceWordComponents } = require('../lib/wordComponents');

function makeSupabase() {
  const componentsByKey = new Map();
  let nextComponentId = 1;
  const deletedWordIds = [];
  const insertedRows = [];

  return {
    _insertedRows: insertedRows,
    _deletedWordIds: deletedWordIds,
    from(table) {
      if (table === 'components') {
        return {
          select: () => ({
            eq: (_col1, val1) => ({
              eq: (_col2, val2) => ({
                maybeSingle: async () => {
                  const key = `${val1}:${val2}`;
                  return {
                    data: componentsByKey.has(key) ? { id: componentsByKey.get(key), root_subtype: null } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
          insert: (row) => ({
            select: () => ({
              single: async () => {
                const key = `${row.component_type}:${row.text}`;
                const id = nextComponentId++;
                componentsByKey.set(key, id);
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'word_components') {
        return {
          delete: () => ({
            eq: async (_col, val) => {
              deletedWordIds.push(val);
              return { error: null };
            },
          }),
          insert: async (rows) => {
            insertedRows.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('resolveComponentIds', () => {
  it('returns an empty array for undefined or empty input', async () => {
    const supabase = makeSupabase();
    expect(await resolveComponentIds(supabase, undefined)).toEqual([]);
    expect(await resolveComponentIds(supabase, [])).toEqual([]);
  });

  it('resolves each component to an id, preserving order', async () => {
    const supabase = makeSupabase();
    const ids = await resolveComponentIds(supabase, [
      { component_type: 'prefix', text: 'un' },
      { component_type: 'root', text: 'believ' },
      { component_type: 'suffix', text: 'able' },
    ]);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('reuses the same id for a component seen twice', async () => {
    const supabase = makeSupabase();
    const ids = await resolveComponentIds(supabase, [
      { component_type: 'root', text: 'act' },
      { component_type: 'root', text: 'act' },
    ]);
    expect(ids[0]).toBe(ids[1]);
  });
});

describe('replaceWordComponents', () => {
  it('deletes existing rows for the word then inserts new ones with sequential positions', async () => {
    const supabase = makeSupabase();
    await replaceWordComponents(supabase, 42, [5, 6, 7]);
    expect(supabase._deletedWordIds).toEqual([42]);
    expect(supabase._insertedRows).toEqual([
      { word_id: 42, component_id: 5, position: 0 },
      { word_id: 42, component_id: 6, position: 1 },
      { word_id: 42, component_id: 7, position: 2 },
    ]);
  });

  it('deletes existing rows but inserts nothing when componentIds is empty', async () => {
    const supabase = makeSupabase();
    await replaceWordComponents(supabase, 42, []);
    expect(supabase._deletedWordIds).toEqual([42]);
    expect(supabase._insertedRows).toEqual([]);
  });
});
