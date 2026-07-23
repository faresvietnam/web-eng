# Word Components Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 1-prefix + 1-root + 1-suffix word model with a general, ordered `components` model (root/prefix/suffix/combining_form, roots taggable free/bound) and an auto-derived `word_type` (simple/derived/compound/compound_derived).

**Architecture:** One shared `components` table (discriminated by `component_type`) plus an ordered `word_components` join table replace the three fixed-shape tables and the three FK columns on `words`. `word_type` is never stored — it's computed from a word's joined components by a pure function shared across API endpoints. Every layer (migration → lib → API routes → frontend) is touched, in that order, so each task builds on a working previous one.

**Tech Stack:** Node.js serverless functions (Vercel `/api`), Supabase/Postgres, Vitest for `lib/` unit tests, React (no component-level tests in this repo — verified manually in-browser).

## Global Constraints

- RLS: every new table follows the exact pattern already used by `words`/`prefixes`/`roots`/`suffixes` — `user_id uuid not null references auth.users(id) on delete cascade default auth.uid()`, RLS enabled, single `"own rows" ... using (user_id = auth.uid()) with check (user_id = auth.uid())` policy. Never pass `user_id` explicitly from application code — it's always the column default, matching every existing insert in this codebase.
- Existing data must be migrated, not dropped (unlike the earlier `segments` migration).
- No automated tests exist for SQL migrations, API route files (`api/**/*.js`), or React components (`src/**/*.jsx`) in this repo today — only files under `lib/` have Vitest coverage. Keep that boundary: add/update tests only under `tests/` for `lib/` changes; verify route and UI changes manually in the browser (steps say exactly what to click).
- Run `npm test` after every `lib/` change and `npm run build` after every frontend change, per task.

---

### Task 1: Migration `0006_components.sql`

**Files:**
- Create: `supabase/migrations/0006_components.sql`

**Interfaces:**
- Produces: tables `components(id, component_type, root_subtype, text, meaning, user_id, created_at)` and `word_components(id, word_id, component_id, position, user_id)`. Later tasks (2–11) read/write these table and column names exactly.

There is no automated test harness for migrations in this repo (`0005_prefix_root_suffix.sql` has none either) — this task is self-contained SQL, checked by careful reading, and applied for real when the app is deployed/connected to Supabase.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0006_components.sql
create table components (
  id bigint generated always as identity primary key,
  component_type text not null check (component_type in ('root','prefix','suffix','combining_form')),
  root_subtype text check (root_subtype in ('free_root','bound_root')),
  text text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  check (root_subtype is null or component_type = 'root'),
  unique (user_id, component_type, text)
);

create table word_components (
  id bigint generated always as identity primary key,
  word_id bigint not null references words(id) on delete cascade,
  component_id bigint not null references components(id) on delete cascade,
  position int not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  unique (word_id, position)
);

alter table components enable row level security;
alter table word_components enable row level security;

create policy "own rows" on components for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on word_components for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Migrate existing prefix/root/suffix rows into the shared components table.
insert into components (component_type, text, meaning, user_id, created_at)
select 'prefix', prefix, meaning, user_id, created_at from prefixes;

insert into components (component_type, text, meaning, user_id, created_at)
select 'root', root, meaning, user_id, created_at from roots;

insert into components (component_type, text, meaning, user_id, created_at)
select 'suffix', suffix, meaning, user_id, created_at from suffixes;

-- Migrate each word's prefix_id/root_id/suffix_id into word_components rows.
-- Fixed slots (0=prefix, 1=root, 2=suffix) rather than a gapless sequence:
-- consumers only ever sort by `position` ascending, so gaps (e.g. a word
-- with only root+suffix landing on positions 1 and 2) are harmless.
insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 0, w.user_id
from words w
join prefixes p on p.id = w.prefix_id
join components c on c.component_type = 'prefix' and c.user_id = w.user_id and c.text = p.prefix
where w.prefix_id is not null;

insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 1, w.user_id
from words w
join roots r on r.id = w.root_id
join components c on c.component_type = 'root' and c.user_id = w.user_id and c.text = r.root
where w.root_id is not null;

insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 2, w.user_id
from words w
join suffixes s on s.id = w.suffix_id
join components c on c.component_type = 'suffix' and c.user_id = w.user_id and c.text = s.suffix
where w.suffix_id is not null;

alter table words
  drop column prefix_id,
  drop column root_id,
  drop column suffix_id;

drop table prefixes;
drop table roots;
drop table suffixes;
```

- [ ] **Step 2: Re-read the file top to bottom**

Confirm: every `create table` has RLS enabled + a policy; the three data-migration inserts run *before* the `drop table` statements; `drop column`/`drop table` order doesn't reference anything after it's dropped.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_components.sql
git commit -m "feat: add components/word_components migration replacing prefix/root/suffix tables"
```

---

### Task 2: `lib/wordType.js` — derive word_type from components

**Files:**
- Create: `lib/wordType.js`
- Test: `tests/wordType.test.js`

**Interfaces:**
- Produces: `deriveWordType(componentTypes: string[]): 'simple'|'derived'|'compound'|'compound_derived'` and `attachWordType(word): word` (returns a shallow copy of `word` with `word_components` sorted by `position` and a new `word_type` field). Tasks 8 and 11 call `attachWordType` on every word object before sending an API response.

- [ ] **Step 1: Write the failing test**

```js
// tests/wordType.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { deriveWordType, attachWordType } = require('../lib/wordType');

describe('deriveWordType', () => {
  it('returns simple for no components', () => {
    expect(deriveWordType([])).toBe('simple');
  });

  it('returns simple for a combining_form with no root', () => {
    expect(deriveWordType(['combining_form'])).toBe('simple');
  });

  it('returns derived for one root plus an affix', () => {
    expect(deriveWordType(['prefix', 'root', 'suffix'])).toBe('derived');
    expect(deriveWordType(['root', 'suffix'])).toBe('derived');
  });

  it('returns simple for a single root with no affix', () => {
    expect(deriveWordType(['root'])).toBe('simple');
  });

  it('returns compound for two or more roots with no affix', () => {
    expect(deriveWordType(['root', 'root'])).toBe('compound');
    expect(deriveWordType(['root', 'combining_form', 'root'])).toBe('compound');
  });

  it('returns compound_derived for two or more roots plus an affix', () => {
    expect(deriveWordType(['prefix', 'root', 'root', 'suffix'])).toBe('compound_derived');
  });
});

describe('attachWordType', () => {
  it('sorts word_components by position and sets word_type', () => {
    const word = {
      word: 'unbelievable',
      word_components: [
        { position: 2, component: { component_type: 'suffix', text: 'able' } },
        { position: 0, component: { component_type: 'prefix', text: 'un' } },
        { position: 1, component: { component_type: 'root', text: 'believ' } },
      ],
    };
    const result = attachWordType(word);
    expect(result.word_components.map((wc) => wc.component.text)).toEqual(['un', 'believ', 'able']);
    expect(result.word_type).toBe('derived');
  });

  it('defaults to simple with an empty word_components list', () => {
    const result = attachWordType({ word: 'hi', word_components: [] });
    expect(result.word_type).toBe('simple');
  });

  it('handles a missing word_components field', () => {
    const result = attachWordType({ word: 'hi' });
    expect(result.word_type).toBe('simple');
    expect(result.word_components).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/wordType.test.js`
Expected: FAIL — `lib/wordType` module not found.

- [ ] **Step 3: Write the implementation**

```js
// lib/wordType.js
function deriveWordType(componentTypes) {
  const rootCount = componentTypes.filter((t) => t === 'root').length;
  const hasAffix = componentTypes.includes('prefix') || componentTypes.includes('suffix');
  if (rootCount === 0) return 'simple';
  if (rootCount === 1) return hasAffix ? 'derived' : 'simple';
  return hasAffix ? 'compound_derived' : 'compound';
}

function attachWordType(word) {
  const wordComponents = [...(word.word_components || [])].sort((a, b) => a.position - b.position);
  const componentTypes = wordComponents.map((wc) => wc.component.component_type);
  return { ...word, word_components: wordComponents, word_type: deriveWordType(componentTypes) };
}

module.exports = { deriveWordType, attachWordType };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/wordType.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/wordType.js tests/wordType.test.js
git commit -m "feat: add deriveWordType/attachWordType helpers"
```

---

### Task 3: `lib/upsertComponent.js` — find-or-create a component (replaces `upsertWordPart.js`)

**Files:**
- Create: `lib/upsertComponent.js`
- Delete: `lib/upsertWordPart.js`
- Test: create `tests/upsertComponent.test.js`, delete `tests/upsertWordPart.test.js`

**Interfaces:**
- Consumes: a Supabase client scoped to the current user (via RLS — no `user_id` passed explicitly).
- Produces: `upsertComponent(supabase, componentType: string, text: string, rootSubtype?: string|null): Promise<number|null>`. Task 4's `resolveComponentIds` calls this for each component in an ordered list.

- [ ] **Step 1: Write the failing test**

```js
// tests/upsertComponent.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/upsertComponent.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation, then delete the old files**

```js
// lib/upsertComponent.js
async function upsertComponent(supabase, componentType, text, rootSubtype) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('components')
    .select('id, root_subtype')
    .eq('component_type', componentType)
    .eq('text', trimmed)
    .maybeSingle();

  if (existing) {
    if (rootSubtype && rootSubtype !== existing.root_subtype) {
      const { error } = await supabase
        .from('components')
        .update({ root_subtype: rootSubtype })
        .eq('id', existing.id);
      if (error) throw error;
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('components')
    .insert({ component_type: componentType, text: trimmed, root_subtype: rootSubtype || null })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

module.exports = { upsertComponent };
```

```bash
git rm lib/upsertWordPart.js tests/upsertWordPart.test.js
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/upsertComponent.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full suite to confirm nothing else references the deleted file**

Run: `npm test`
Expected: PASS (no failures from a stale `lib/upsertWordPart` import)

- [ ] **Step 6: Commit**

```bash
git add lib/upsertComponent.js tests/upsertComponent.test.js
git commit -m "feat: replace upsertWordPart with type-aware upsertComponent"
```

---

### Task 4: `lib/wordComponents.js` — resolve and persist a word's ordered component list

**Files:**
- Create: `lib/wordComponents.js`
- Test: `tests/wordComponents.test.js`

**Interfaces:**
- Consumes: `upsertComponent` from Task 3 (`lib/upsertComponent.js`).
- Produces: `resolveComponentIds(supabase, components: {component_type, text, root_subtype?}[]): Promise<number[]>` and `replaceWordComponents(supabase, wordId: number, componentIds: number[]): Promise<void>`. Tasks 8, 9, and 10 call both of these when saving a word.

- [ ] **Step 1: Write the failing test**

```js
// tests/wordComponents.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/wordComponents.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// lib/wordComponents.js
const { upsertComponent } = require('./upsertComponent');

async function resolveComponentIds(supabase, components) {
  if (!Array.isArray(components) || components.length === 0) return [];
  const ids = [];
  for (const c of components) {
    const id = await upsertComponent(supabase, c.component_type, c.text, c.root_subtype);
    if (id) ids.push(id);
  }
  return ids;
}

async function replaceWordComponents(supabase, wordId, componentIds) {
  const { error: deleteError } = await supabase.from('word_components').delete().eq('word_id', wordId);
  if (deleteError) throw deleteError;
  if (!componentIds || componentIds.length === 0) return;
  const rows = componentIds.map((component_id, position) => ({ word_id: wordId, component_id, position }));
  const { error: insertError } = await supabase.from('word_components').insert(rows);
  if (insertError) throw insertError;
}

module.exports = { resolveComponentIds, replaceWordComponents };
```

Note: components are resolved **sequentially** (a `for` loop, not `Promise.all`) — the existing `api/words/import.js` had a bug where concurrent `upsertWordPart` calls for the same new text raced on the unique constraint (fixed in commit `7f9c3cf`). Keep the same sequential pattern here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/wordComponents.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/wordComponents.js tests/wordComponents.test.js
git commit -m "feat: add resolveComponentIds/replaceWordComponents helpers"
```

---

### Task 5: `lib/componentsCrud.js` — CRUD handlers keyed by component_type (replaces `wordPartsCrud.js`)

**Files:**
- Create: `lib/componentsCrud.js`
- Delete: `lib/wordPartsCrud.js`
- Test: create `tests/componentsCrud.test.js`, delete `tests/wordPartsCrud.test.js`

**Interfaces:**
- Produces: `handleList(req, res, supabase): Promise<void>` (GET `?type=root|prefix|suffix|combining_form` list, POST create) and `handleItem(req, res, supabase, id): Promise<void>` (PUT update, DELETE). Task 7's `api/components/[[...id]].js` route calls these directly (no more per-table factory — there's only one table now).

- [ ] **Step 1: Write the failing test**

```js
// tests/componentsCrud.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handleList, handleItem } = require('../lib/componentsCrud');

function makeRes() {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('handleList', () => {
  it('GET with a valid type returns components filtered by that type', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (col, val) => {
            expect(col).toBe('component_type');
            expect(val).toBe('root');
            return {
              order: async () => ({
                data: [{ id: 1, component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: null }],
                error: null,
              }),
            };
          },
        }),
      }),
    };
    const req = { method: 'GET', query: { type: 'root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ components: [{ id: 1, component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: null }] });
  });

  it('GET with a missing or invalid type is rejected', async () => {
    const req = { method: 'GET', query: {} };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('POST creates a component with the given type', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 2, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { component_type: 'root', text: ' spect ', meaning: 'nhìn', root_subtype: 'bound_root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      component: { id: 2, component_type: 'root', text: 'spect', meaning: 'nhìn', root_subtype: 'bound_root' },
    });
  });

  it('POST ignores root_subtype for non-root types', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 3, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { component_type: 'prefix', text: 'un', root_subtype: 'free_root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.body.component.root_subtype).toBeNull();
  });

  it('POST rejects a blank text without touching supabase', async () => {
    const req = { method: 'POST', body: { component_type: 'root', text: '   ' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects unsupported methods', async () => {
    const req = { method: 'DELETE', query: { type: 'root' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(405);
  });
});

describe('handleItem', () => {
  it('PUT updates the row and returns it under "component"', async () => {
    const supabase = {
      from: () => ({
        update: (row) => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: 3, ...row }, error: null }),
            }),
          }),
        }),
      }),
    };
    const req = { method: 'PUT', body: { component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: 'free_root' } };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ component: { id: 3, text: 'act', meaning: 'hành động', root_subtype: 'free_root' } });
  });

  it('DELETE removes the row and returns 204', async () => {
    const supabase = {
      from: () => ({
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const req = { method: 'DELETE' };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/componentsCrud.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation, then delete the old files**

```js
// lib/componentsCrud.js
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
```

```bash
git rm lib/wordPartsCrud.js tests/wordPartsCrud.test.js
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/componentsCrud.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/componentsCrud.js tests/componentsCrud.test.js
git commit -m "feat: replace per-table wordPartsCrud with type-keyed componentsCrud"
```

---

### Task 6: `lib/csv.js` — replace prefix/root/suffix columns with a `components` column

**Files:**
- Modify: `lib/csv.js`
- Modify: `tests/csv.test.js`

**Interfaces:**
- Produces: `parseWordsCsv(text): { rows: Row[], errors }` where `Row.components` is now `{component_type, text, root_subtype}[]` (replacing the old flat `prefix`/`root`/`suffix` string fields); and `parseComponentsField(value: string): {component_type, text, root_subtype}[]`. Task 10 (`api/words/import.js`) consumes `row.components` directly.

- [ ] **Step 1: Update the test file first**

```js
// tests/csv.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseWordsCsv, parseComponentsField } = require('../lib/csv');

describe('parseWordsCsv', () => {
  it('parses valid rows with all columns', () => {
    const csv = 'word,meaning,category,part_of_speech,ipa,example,example_vi,components\nunbelievable,không thể tin được,adjectives,adj,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,prefix:un|root:believ:free_root|suffix:able';
    const { rows, errors } = parseWordsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        word: 'unbelievable',
        meaning: 'không thể tin được',
        category: 'adjectives',
        part_of_speech: 'adj',
        ipa: '/ʌnbɪˈliːvəbl/',
        example: 'It is unbelievable.',
        example_vi: 'Nó thật khó tin.',
        components: [
          { component_type: 'prefix', text: 'un', root_subtype: null },
          { component_type: 'root', text: 'believ', root_subtype: 'free_root' },
          { component_type: 'suffix', text: 'able', root_subtype: null },
        ],
      },
    ]);
  });

  it('fills optional columns with null and components with an empty array when missing', () => {
    const csv = 'word,meaning\nhi,chào';
    const { rows } = parseWordsCsv(csv);
    expect(rows[0]).toEqual({
      word: 'hi',
      meaning: 'chào',
      category: null,
      part_of_speech: null,
      ipa: null,
      example: null,
      example_vi: null,
      components: [],
    });
  });

  it('reports an error and skips rows missing word or meaning', () => {
    const csv = 'word,meaning\n,chào\nhi,';
    const { rows, errors } = parseWordsCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { line: 2, reason: 'Thiếu field: word' },
      { line: 3, reason: 'Thiếu field: meaning' },
    ]);
  });

  it('returns empty rows and errors for empty input', () => {
    expect(parseWordsCsv('')).toEqual({ rows: [], errors: [] });
  });

  it('reports the correct line number even when a blank line precedes the bad row', () => {
    const csv = 'word,meaning\nhi,chào\n\nbye,';
    const { errors } = parseWordsCsv(csv);
    expect(errors).toEqual([{ line: 4, reason: 'Thiếu field: meaning' }]);
  });
});

describe('parseComponentsField', () => {
  it('returns an empty array for empty or missing input', () => {
    expect(parseComponentsField('')).toEqual([]);
    expect(parseComponentsField(undefined)).toEqual([]);
  });

  it('drops tokens with an unknown component_type', () => {
    expect(parseComponentsField('bogus:x|root:act')).toEqual([{ component_type: 'root', text: 'act', root_subtype: null }]);
  });

  it('drops tokens missing text', () => {
    expect(parseComponentsField('prefix:|root:act')).toEqual([{ component_type: 'root', text: 'act', root_subtype: null }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/csv.test.js`
Expected: FAIL — `rows[0].components` undefined / old `prefix`/`root`/`suffix` fields still present.

- [ ] **Step 3: Update the implementation**

```js
// lib/csv.js
const REQUIRED_HEADERS = ['word', 'meaning'];
const OPTIONAL_HEADERS = ['category', 'part_of_speech', 'ipa', 'example', 'example_vi'];
const COMPONENT_TYPES = ['root', 'prefix', 'suffix', 'combining_form'];

function parseComponentsField(value) {
  if (!value) return [];
  return value
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [type, text, rootSubtype] = token.split(':').map((s) => (s || '').trim());
      return { component_type: type, text, root_subtype: rootSubtype || null };
    })
    .filter((c) => COMPONENT_TYPES.includes(c.component_type) && c.text);
}

function parseWordsCsv(text) {
  const allLines = text.split(/\r?\n/);
  const hasContent = allLines.some((line) => line.trim().length > 0);
  if (!hasContent) return { rows: [], errors: [] };

  const headers = allLines[0].split(',').map((h) => h.trim());
  const rows = [];
  const errors = [];

  for (let i = 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.trim().length === 0) continue;

    const values = line.split(',').map((v) => v.trim());
    const raw = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] ?? '';
    });

    const missing = REQUIRED_HEADERS.filter((h) => !raw[h]);
    if (missing.length > 0) {
      errors.push({ line: i + 1, reason: `Thiếu field: ${missing[0]}` });
      continue;
    }

    const row = { word: raw.word, meaning: raw.meaning };
    OPTIONAL_HEADERS.forEach((h) => {
      row[h] = raw[h] ? raw[h] : null;
    });
    row.components = parseComponentsField(raw.components);
    rows.push(row);
  }

  return { rows, errors };
}

module.exports = { parseWordsCsv, parseComponentsField };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/csv.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/csv.js tests/csv.test.js
git commit -m "feat: parse a pipe-delimited components CSV column instead of prefix/root/suffix"
```

---

### Task 7: `api/components/[[...id]].js` route (replaces `api/prefixes`, `api/roots`, `api/suffixes`)

**Files:**
- Create: `api/components/[[...id]].js`
- Delete: `api/prefixes/[[...id]].js`, `api/roots/[[...id]].js`, `api/suffixes/[[...id]].js` (and their now-empty directories)
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `handleList`/`handleItem` from Task 5 (`lib/componentsCrud.js`), `requireUser` from `lib/auth.js`, `getSupabaseClient` from `lib/supabaseClient.js`.
- Produces: `GET /api/components?type=X`, `POST /api/components`, `PUT /api/components/:id`, `DELETE /api/components/:id`. Task 12's `src/api.js` calls these routes.

No automated test for this file (route files aren't unit-tested in this repo) — verified in Task 18's manual pass.

- [ ] **Step 1: Create the route file**

```js
// api/components/[[...id]].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { handleList, handleItem } = require('../../lib/componentsCrud');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  // '_' is a sentinel from vercel.json's rewrite of the bare /api/components path:
  // Vercel's non-Next.js function router doesn't match [[...id]].js against zero path segments.
  if (id && id !== '_') {
    await handleItem(req, res, supabase, id);
  } else {
    await handleList(req, res, supabase);
  }
};
```

- [ ] **Step 2: Delete the old per-table routes**

```bash
git rm api/prefixes/\[\[...id\]\].js api/roots/\[\[...id\]\].js api/suffixes/\[\[...id\]\].js
```

- [ ] **Step 3: Update `vercel.json`'s rewrites**

```json
{
  "buildCommand": "vite build",
  "devCommand": "vite",
  "outputDirectory": "dist",
  "regions": ["sin1"],
  "rewrites": [
    { "source": "/api/components", "destination": "/api/components/_" }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add api/components vercel.json
git commit -m "feat: replace /api/prefixes,roots,suffixes with a single /api/components route"
```

---

### Task 8: `api/words/index.js` — GET join + word_type, POST components resolution

**Files:**
- Modify: `api/words/index.js`

**Interfaces:**
- Consumes: `attachWordType` (Task 2), `resolveComponentIds`/`replaceWordComponents` (Task 4).
- Produces: `GET /api/words` response items each carry `word_components` (sorted, `{position, component}`) and `word_type`; `POST /api/words` body's `components` array (replacing `prefix`/`root`/`suffix` text fields) is persisted via the join table.

No automated test for this file — verified manually in Task 18.

- [ ] **Step 1: Rewrite the file**

```js
// api/words/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { resolveComponentIds, replaceWordComponents } = require('../../lib/wordComponents');
const { attachWordType } = require('../../lib/wordType');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
    const rootId = req.query.root_id;
    const wordComponentsEmbed = rootId
      ? 'word_components!inner(position, component:components(*))'
      : 'word_components(position, component:components(*))';
    let query = supabase
      .from('words')
      .select(`*, review_state!inner(*), ${wordComponentsEmbed}`);
    if (req.query.status) {
      query = query.eq('review_state.status', req.query.status);
    }
    if (rootId) {
      query = query.eq('word_components.component_id', rootId);
    }
    if (req.query.q) {
      const term = `%${req.query.q}%`;
      query = query.or(`word.ilike.${term},meaning.ilike.${term},category.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ words: data.map(attachWordType) });
    return;
  }

  if (req.method === 'POST') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, components } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const now = new Date().toISOString();
    let componentIds;
    try {
      componentIds = await resolveComponentIds(supabase, components);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data: inserted, error: insertError } = await supabase
      .from('words')
      .insert({ word, meaning, category, part_of_speech, ipa, example, example_vi })
      .select()
      .single();
    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }
    try {
      await replaceWordComponents(supabase, inserted.id, componentIds);
    } catch (err) {
      await supabase.from('words').delete().eq('id', inserted.id);
      res.status(500).json({ error: err.message });
      return;
    }
    const { error: reviewStateError } = await supabase.from('review_state').insert({
      word_id: inserted.id,
      status: 'new',
      step_index: 0,
      interval_days: 0,
      correct_count: 0,
      failure_count: 0,
      next_review_at: now,
    });
    if (reviewStateError) {
      await supabase.from('words').delete().eq('id', inserted.id);
      res.status(500).json({ error: reviewStateError.message });
      return;
    }
    res.status(201).json({ word: inserted });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
```

- [ ] **Step 2: Commit**

```bash
git add api/words/index.js
git commit -m "feat: join words with the components model in GET/POST /api/words"
```

---

### Task 9: `api/words/[id].js` — PUT components resolution

**Files:**
- Modify: `api/words/[id].js`

**Interfaces:**
- Consumes: `resolveComponentIds`/`replaceWordComponents` (Task 4).

- [ ] **Step 1: Rewrite the file**

```js
// api/words/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { resolveComponentIds, replaceWordComponents } = require('../../lib/wordComponents');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const id = req.query.id;

  if (req.method === 'PUT') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, components } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    let componentIds;
    try {
      componentIds = await resolveComponentIds(supabase, components);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data, error } = await supabase
      .from('words')
      .update({ word, meaning, category, part_of_speech, ipa, example, example_vi })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    try {
      await replaceWordComponents(supabase, id, componentIds);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(200).json({ word: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('words').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
```

- [ ] **Step 2: Commit**

```bash
git add api/words/[id].js
git commit -m "feat: persist ordered components on word update"
```

---

### Task 10: `api/words/import.js` — CSV components resolution

**Files:**
- Modify: `api/words/import.js`

**Interfaces:**
- Consumes: `parseWordsCsv` (Task 6, already returns `row.components`), `resolveComponentIds`/`replaceWordComponents` (Task 4).

This task changes the insert strategy from one bulk `words` insert to a per-row loop (word → components → review_state), because each row's `word_components` must reference that specific row's new word id — a bulk insert can't be safely zipped back to per-row component lists without relying on unordered-return assumptions.

- [ ] **Step 1: Rewrite the file**

```js
// api/words/import.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { parseWordsCsv } = require('../../lib/csv');
const { resolveComponentIds, replaceWordComponents } = require('../../lib/wordComponents');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;

  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!csvText) {
    res.status(400).json({ error: 'Thiếu nội dung CSV' });
    return;
  }

  const { rows, errors } = parseWordsCsv(csvText);
  if (rows.length === 0) {
    res.status(200).json({ imported: 0, errors });
    return;
  }

  const supabase = getSupabaseClient(token);
  const now = new Date().toISOString();
  const importedIds = [];

  try {
    for (const row of rows) {
      const { components, ...wordFields } = row;
      const { data: insertedWord, error: insertError } = await supabase
        .from('words')
        .insert(wordFields)
        .select()
        .single();
      if (insertError) throw insertError;

      const componentIds = await resolveComponentIds(supabase, components);
      await replaceWordComponents(supabase, insertedWord.id, componentIds);

      const { error: reviewStateError } = await supabase.from('review_state').insert({
        word_id: insertedWord.id,
        status: 'new',
        step_index: 0,
        interval_days: 0,
        correct_count: 0,
        failure_count: 0,
        next_review_at: now,
      });
      if (reviewStateError) throw reviewStateError;

      importedIds.push(insertedWord.id);
    }
  } catch (err) {
    if (importedIds.length > 0) {
      const { error: cleanupError } = await supabase.from('words').delete().in('id', importedIds);
      if (cleanupError) {
        console.error('Failed to clean up partially imported words:', cleanupError.message);
      }
    }
    res.status(500).json({ error: err.message });
    return;
  }

  res.status(200).json({ imported: importedIds.length, errors });
};
```

- [ ] **Step 2: Commit**

```bash
git add api/words/import.js
git commit -m "feat: resolve CSV components per-row on import"
```

---

### Task 11: `api/session/today.js` — join change + hasParts

**Files:**
- Modify: `api/session/today.js`

**Interfaces:**
- Consumes: `attachWordType` (Task 2).

- [ ] **Step 1: Update the join and card-building logic**

```js
// api/session/today.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');
const { hasUsableSentence } = require('../../lib/sentenceBlank');
const { attachWordType } = require('../../lib/wordType');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const wordsSelect = '*, word_components(position, component:components(*))';

  const [
    { data: dailyProgress, error: dailyProgressError },
    { data: dueStates, error: dueError },
    { data: newStates, error: newError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select(`*, words(${wordsSelect})`)
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select(`*, words(${wordsSelect})`).eq('status', 'new'),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  const queryError = dailyProgressError || dueError || newError || settingsError;
  if (queryError) {
    res.status(500).json({ error: queryError.message });
    return;
  }

  const queue = buildDailyQueue({
    dueReviewStates: dueStates,
    newWordStates: newStates,
    dailyProgress: dailyProgress || { new_learned: 0, reviewed_count: 0 },
    now,
    newDailyLimit: settings?.new_daily_limit ?? 20,
    reviewDailyLimit: settings?.review_daily_limit ?? 100,
  });

  const cards = queue.map((state) => {
    const word = attachWordType(state.words);
    return {
      word,
      review_state: state,
      exercise_type: pickExerciseType({
        status: state.status,
        correct_count: state.correct_count,
        hasParts: word.word_components.length > 0,
        hasExample: hasUsableSentence(state.words.example, state.words.word),
      }),
    };
  });

  res.status(200).json({ cards, total: cards.length });
};
```

- [ ] **Step 2: Commit**

```bash
git add api/session/today.js
git commit -m "feat: join word_components in the daily queue and compute hasParts from it"
```

---

### Task 12: `src/api.js` — components API client functions

**Files:**
- Modify: `src/api.js`

**Interfaces:**
- Produces: `getComponents(type)`, `createComponent(body)`, `updateComponent(id, body)`, `deleteComponent(id)` (replacing 12 prefix/root/suffix-specific functions). Task 14 (`WordPartsScreen.jsx`) is the consumer.

- [ ] **Step 1: Update the file**

```js
// src/api.js
import { supabase } from './supabaseClient.js';

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getToday: () => request('/api/session/today'),
  postReview: (wordId, body) =>
    request(`/api/reviews/${wordId}`, { method: 'POST', body: JSON.stringify(body) }),
  getWords: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/words${qs ? `?${qs}` : ''}`);
  },
  createWord: (body) => request('/api/words', { method: 'POST', body: JSON.stringify(body) }),
  updateWord: (id, body) => request(`/api/words/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWord: (id) => request(`/api/words/${id}`, { method: 'DELETE' }),
  getComponents: (type) => request(`/api/components?type=${type}`),
  createComponent: (body) => request('/api/components', { method: 'POST', body: JSON.stringify(body) }),
  updateComponent: (id, body) => request(`/api/components/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteComponent: (id) => request(`/api/components/${id}`, { method: 'DELETE' }),
  importCsv: (csv) => request('/api/words/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  getDashboard: () => request('/api/dashboard'),
  getReviewsChart: (days = 7) => request(`/api/dashboard/reviews-chart?days=${days}`),
  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "feat: replace prefix/root/suffix API client functions with getComponents/createComponent/etc"
```

---

### Task 13: `src/components/WordBreakdown.jsx` — render the ordered component list

**Files:**
- Modify: `src/components/WordBreakdown.jsx`

**Interfaces:**
- Consumes: `word.word_components` (already sorted by `position`, from `attachWordType`), shape `{position, component: {id, component_type, text, meaning, root_subtype}}`.

- [ ] **Step 1: Rewrite the component**

```jsx
// src/components/WordBreakdown.jsx
import React from 'react';

const CHIP_CLASS = {
  prefix: 'chip-1',
  root: 'chip-2',
  suffix: 'chip-1',
  combining_form: 'chip-1',
};

export default function WordBreakdown({ word, onRootClick }) {
  const parts = word.word_components || [];
  if (parts.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {parts.map((part, i) => {
          const { component } = part;
          const chipClass = CHIP_CLASS[component.component_type] || 'chip-1';
          const isRoot = component.component_type === 'root';
          return (
            <React.Fragment key={part.position}>
              {i > 0 && <span style={{ color: 'var(--ink-3)', marginTop: 6 }}>+</span>}
              <div style={{ textAlign: 'center' }}>
                {isRoot && onRootClick ? (
                  <button
                    className={`chip ${chipClass}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => onRootClick(component)}
                  >
                    {component.text}
                  </button>
                ) : (
                  <span className={`chip ${chipClass}`}>{component.text}</span>
                )}
                {component.meaning && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{component.meaning}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the one caller that passes a root object onward**

`src/App.jsx`'s `handleRootClick(root)` and `rootFilter` state are unchanged in shape expectations except the object now has a `text` field instead of `root` — no change needed in `App.jsx` itself (it just stores whatever `onRootClick` passes through). Task 17 updates the one place that reads `rootFilter.root` (`VocabularyScreen.jsx`) to `rootFilter.text`.

- [ ] **Step 3: Run the build to catch syntax errors**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/WordBreakdown.jsx
git commit -m "feat: render WordBreakdown from the ordered word_components list"
```

---

### Task 14: `src/screens/WordPartsScreen.jsx` — 4 sections via `/api/components`

**Files:**
- Modify: `src/screens/WordPartsScreen.jsx`

**Interfaces:**
- Consumes: `api.getComponents/createComponent/updateComponent/deleteComponent` (Task 12).

- [ ] **Step 1: Rewrite the screen**

```jsx
// src/screens/WordPartsScreen.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const SECTIONS = [
  { type: 'prefix', label: 'Tiền tố', title: 'Prefix (tiền tố)' },
  { type: 'root', label: 'Gốc từ', title: 'Root (gốc từ)' },
  { type: 'suffix', label: 'Hậu tố', title: 'Suffix (hậu tố)' },
  { type: 'combining_form', label: 'Dạng kết hợp', title: 'Combining form (dạng kết hợp)' },
];

function PartTable({ section }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newRootSubtype, setNewRootSubtype] = useState('');
  const [error, setError] = useState(null);
  const isRoot = section.type === 'root';

  function reload() {
    api.getComponents(section.type).then((data) => setItems(data.components)).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createComponent({
        component_type: section.type,
        text: newText,
        meaning: newMeaning,
        root_subtype: isRoot && newRootSubtype ? newRootSubtype : null,
      });
      setNewText('');
      setNewMeaning('');
      setNewRootSubtype('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMeaningBlur(item, meaning) {
    try {
      await api.updateComponent(item.id, {
        component_type: section.type,
        text: item.text,
        meaning,
        root_subtype: item.root_subtype,
      });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRootSubtypeChange(item, rootSubtype) {
    try {
      await api.updateComponent(item.id, {
        component_type: section.type,
        text: item.text,
        meaning: item.meaning,
        root_subtype: rootSubtype || null,
      });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteComponent(id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{section.title}</h3>
      {error && <div style={{ color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
      <table className="table">
        <thead>
          <tr><th>{section.label}</th><th>Nghĩa</th>{isRoot && <th>Loại</th>}<th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ fontWeight: 600 }}>{item.text}</td>
              <td>
                <input
                  className="input"
                  defaultValue={item.meaning || ''}
                  onBlur={(e) => handleMeaningBlur(item, e.target.value)}
                />
              </td>
              {isRoot && (
                <td>
                  <select
                    className="input"
                    defaultValue={item.root_subtype || ''}
                    onChange={(e) => handleRootSubtypeChange(item, e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="free_root">Free</option>
                    <option value="bound_root">Bound</option>
                  </select>
                </td>
              )}
              <td>
                <button className="btn btn-secondary" onClick={() => handleDelete(item.id)}>Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="input" placeholder={section.label} value={newText} onChange={(e) => setNewText(e.target.value)} />
        <input className="input" placeholder="Nghĩa" value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} />
        {isRoot && (
          <select className="input" value={newRootSubtype} onChange={(e) => setNewRootSubtype(e.target.value)}>
            <option value="">—</option>
            <option value="free_root">Free</option>
            <option value="bound_root">Bound</option>
          </select>
        )}
        <button type="submit" className="btn btn-primary">Thêm</button>
      </form>
    </div>
  );
}

export default function WordPartsScreen() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Gốc từ</h1>
      {SECTIONS.map((section) => <PartTable key={section.type} section={section} />)}
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/screens/WordPartsScreen.jsx
git commit -m "feat: add combining_form section and root free/bound tagging to Gốc từ screen"
```

---

### Task 15: `src/screens/StudyScreen.jsx` — derive `parts` from `word_components`

**Files:**
- Modify: `src/screens/StudyScreen.jsx:70-78`

**Interfaces:**
- Consumes: `word.word_components` (already sorted, from `attachWordType`).

- [ ] **Step 1: Replace the `parts` useMemo**

Find this block (currently at `src/screens/StudyScreen.jsx:70-78`):

```js
  const parts = useMemo(() => {
    if (!word) return [];
    const list = [];
    if (word.prefix) list.push({ type: 'prefix', text: word.prefix.prefix });
    if (word.root) list.push({ type: 'root', text: word.root.root });
    if (word.suffix) list.push({ type: 'suffix', text: word.suffix.suffix });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Replace it with:

```js
  const parts = useMemo(() => {
    if (!word) return [];
    return (word.word_components || []).map((wc) => ({ type: wc.component.component_type, text: wc.component.text }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Nothing else in this file references `word.prefix`/`word.root`/`word.suffix` — the rest of the `parts`/`hiddenPartIndex` logic (lines 80-84, 265-299) already only reads `parts[i].type`/`parts[i].text`, so it needs no change.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: derive the parts exercise from word_components instead of fixed prefix/root/suffix fields"
```

---

### Task 16: `src/screens/ImportScreen.jsx` — dynamic component row list

**Files:**
- Modify: `src/screens/ImportScreen.jsx`

**Interfaces:**
- Produces: submits `components: {component_type, text, root_subtype}[]` to `api.createWord`/`api.updateWord` (Task 8/9's expected POST/PUT body shape).
- Consumes: `editingWord.word_components` (sorted, from `attachWordType`) to pre-fill the row list.

- [ ] **Step 1: Rewrite the file**

```jsx
// src/screens/ImportScreen.jsx
import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', components: [] };

const FIELDS = [
  { key: 'word', label: 'Word', placeholder: 'unbelievable' },
  { key: 'meaning', label: 'Meaning', placeholder: 'không thể tin được' },
  { key: 'category', label: 'Category', placeholder: 'appearance' },
  { key: 'part_of_speech', label: 'Part of speech', placeholder: 'adjective' },
  { key: 'ipa', label: 'IPA', placeholder: '/ʌnbɪˈliːvəbl/' },
];

const COMPONENT_TYPE_OPTIONS = [
  { value: 'prefix', label: 'Prefix' },
  { value: 'root', label: 'Root' },
  { value: 'suffix', label: 'Suffix' },
  { value: 'combining_form', label: 'Combining form' },
];

const ROOT_SUBTYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'free_root', label: 'Free' },
  { value: 'bound_root', label: 'Bound' },
];

const TEMPLATE_CSV =
  'word,meaning,category,part_of_speech,ipa,example,example_vi,components\n' +
  'unbelievable,không thể tin được,appearance,adjective,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,prefix:un|root:believ:free_root|suffix:able\n';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;

export default function ImportScreen({ editingWord, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [formError, setFormError] = useState(null);
  const [importError, setImportError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (editingWord) {
      setForm({
        word: editingWord.word,
        meaning: editingWord.meaning,
        category: editingWord.category || '',
        part_of_speech: editingWord.part_of_speech || '',
        ipa: editingWord.ipa || '',
        example: editingWord.example || '',
        example_vi: editingWord.example_vi || '',
        components: (editingWord.word_components || []).map((wc) => ({
          component_type: wc.component.component_type,
          text: wc.component.text,
          root_subtype: wc.component.root_subtype || '',
        })),
      });
    }
  }, [editingWord]);

  function handleFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleComponentChange(index, field, value) {
    setForm((f) => ({
      ...f,
      components: f.components.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  }

  function handleAddComponent() {
    setForm((f) => ({ ...f, components: [...f.components, { component_type: 'prefix', text: '', root_subtype: '' }] }));
  }

  function handleRemoveComponent(index) {
    setForm((f) => ({ ...f, components: f.components.filter((_, i) => i !== index) }));
  }

  function handleMoveComponent(index, direction) {
    setForm((f) => {
      const target = index + direction;
      if (target < 0 || target >= f.components.length) return f;
      const components = [...f.components];
      [components[index], components[target]] = [components[target], components[index]];
      return { ...f, components };
    });
  }

  function readCsvFile(file) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.onerror = () => setImportError('Không đọc được file. Vui lòng thử lại.');
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readCsvFile(file);
  }

  function handleFileInputChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) readCsvFile(file);
    e.target.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const payload = {
      ...form,
      components: form.components
        .filter((c) => c.text.trim())
        .map((c) => ({
          component_type: c.component_type,
          text: c.text.trim(),
          root_subtype: c.component_type === 'root' && c.root_subtype ? c.root_subtype : null,
        })),
    };
    try {
      if (editingWord) {
        await api.updateWord(editingWord.id, payload);
      } else {
        await api.createWord(payload);
      }
      setForm(EMPTY_FORM);
      onDone();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    setImportError(null);
    try {
      const result = await api.importCsv(csvText);
      setImportResult(result);
      setCsvText('');
    } catch (err) {
      setImportError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Import vocabulary</h1>

      <div className="card">
        <div className="seg" style={{ marginBottom: 16 }}>
          <span className="seg-opt checked">CSV / Excel</span>
          <span className="seg-opt">Paste text</span>
          <span className="seg-opt">From clipboard</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `1.5px dashed ${isDragging ? 'var(--sb)' : 'var(--line)'}`,
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              background: '#fafafa',
            }}
          >
            <div style={{ fontSize: 15, marginBottom: 4 }}>Drag &amp; drop a CSV file here</div>
            <a
              href="#"
              style={{ fontSize: 14, fontWeight: 600 }}
              onClick={(e) => { e.preventDefault(); fileInputRef.current.click(); }}
            >
              or click to browse
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </div>
          <div className="card" style={{ background: '#fafafa' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CSV format tip</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
              Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, components
              (pipe-delimited, e.g. <code>prefix:un|root:believ:free_root|suffix:able</code>)
            </div>
            <a href={TEMPLATE_HREF} download="template.csv" style={{ fontSize: 13, fontWeight: 600 }}>
              ↓ Download template.csv
            </a>
          </div>
        </div>
        <form onSubmit={handleImport}>
          <textarea
            className="input"
            rows={4}
            placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,components"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Import</button>
        </form>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10 }}>
          CSV format tip — Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, components
        </div>
        {importError && <div style={{ color: 'var(--red)', marginTop: 10 }}>{importError}</div>}
        {importResult && (
          <div style={{ marginTop: 10 }}>
            <p>Đã import: {importResult.imported}</p>
            {importResult.errors.length > 0 && (
              <ul>
                {importResult.errors.map((e, i) => <li key={i}>Dòng {e.line}: {e.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 16, margin: '0 0 12px' }}>{editingWord ? 'Sửa từ' : 'Hoặc thêm thủ công'}</h3>
      <form className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} onSubmit={handleSubmit}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.label}</label>
            <input
              className="input"
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => handleFieldChange(f.key, e.target.value)}
            />
          </div>
        ))}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Cấu tạo từ (prefix / root / suffix / combining form)
          </label>
          {form.components.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                className="input"
                style={{ width: 160 }}
                value={c.component_type}
                onChange={(e) => handleComponentChange(i, 'component_type', e.target.value)}
              >
                {COMPONENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                className="input"
                placeholder="text"
                value={c.text}
                onChange={(e) => handleComponentChange(i, 'text', e.target.value)}
              />
              {c.component_type === 'root' && (
                <select
                  className="input"
                  style={{ width: 110 }}
                  value={c.root_subtype}
                  onChange={(e) => handleComponentChange(i, 'root_subtype', e.target.value)}
                >
                  {ROOT_SUBTYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => handleMoveComponent(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleMoveComponent(i, 1)} disabled={i === form.components.length - 1}>↓</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleRemoveComponent(i)}>Xóa</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={handleAddComponent}>+ Thêm phần</button>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example</label>
          <input className="input" placeholder="She has a beautiful smile." value={form.example} onChange={(e) => handleFieldChange('example', e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example (VI)</label>
          <input className="input" placeholder="Cô ấy có nụ cười đẹp." value={form.example_vi} onChange={(e) => handleFieldChange('example_vi', e.target.value)} />
        </div>
        {formError && <div style={{ gridColumn: 'span 2', color: 'var(--red)' }}>{formError}</div>}
        <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary">Lưu từ</button>
          {editingWord && <button type="button" className="btn btn-secondary" onClick={onDone}>Hủy</button>}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/screens/ImportScreen.jsx
git commit -m "feat: replace fixed prefix/root/suffix inputs with a dynamic ordered components row list"
```

---

### Task 17: `src/screens/VocabularyScreen.jsx` — "Cấu tạo" column + root filter field rename

**Files:**
- Modify: `src/screens/VocabularyScreen.jsx`

**Interfaces:**
- Consumes: `word.word_type` (from `attachWordType`, added in Task 8's GET response).

- [ ] **Step 1: Add a word_type label map, a new column, and fix the rootFilter field name**

Find this line near the top of the file:

```js
const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };
const STATUS_LABEL = { new: 'New', learning: 'Learning', difficult: 'Difficult' };
```

Add right after it:

```js
const WORD_TYPE_LABEL = { simple: 'Đơn', derived: 'Phái sinh', compound: 'Ghép', compound_derived: 'Ghép phái sinh' };
```

Find the root-filter badge (currently reads `rootFilter.root`):

```jsx
      {rootFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span className="tag tag-pos">Gốc từ: {rootFilter.root}</span>
          <button className="btn btn-secondary" onClick={onClearRootFilter}>×</button>
        </div>
      )}
```

Change `{rootFilter.root}` to `{rootFilter.text}` (components now carry a `text` field, not a type-specific `root` field):

```jsx
      {rootFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span className="tag tag-pos">Gốc từ: {rootFilter.text}</span>
          <button className="btn btn-secondary" onClick={onClearRootFilter}>×</button>
        </div>
      )}
```

Find the table header row:

```jsx
            <tr>
              <th>Từ</th><th>Loại từ</th><th>Nghĩa</th><th>Chủ đề</th><th>Trạng thái</th><th>Ôn tiếp theo</th><th></th>
            </tr>
```

Add a "Cấu tạo" header after "Loại từ":

```jsx
            <tr>
              <th>Từ</th><th>Loại từ</th><th>Cấu tạo</th><th>Nghĩa</th><th>Chủ đề</th><th>Trạng thái</th><th>Ôn tiếp theo</th><th></th>
            </tr>
```

Find the row rendering:

```jsx
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.word}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.part_of_speech}</td>
                  <td>{w.meaning}</td>
```

Add the new cell after the part-of-speech cell:

```jsx
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.word}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.part_of_speech}</td>
                  <td><span className="tag tag-pos">{WORD_TYPE_LABEL[w.word_type] || w.word_type}</span></td>
                  <td>{w.meaning}</td>
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/screens/VocabularyScreen.jsx
git commit -m "feat: show derived word_type in a Cấu tạo column, fix rootFilter field name"
```

---

### Task 18: Full test suite, build, and manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all suites pass, including `wordType.test.js`, `upsertComponent.test.js`, `wordComponents.test.js`, `componentsCrud.test.js`, `csv.test.js`, and the unrelated pre-existing suites (`exerciseType`, `auth`, `sentenceBlank`, `scheduler`, `dailyQueue`).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Search for any leftover references to the old model**

Run: `grep -rn "prefix_id\|root_id\|suffix_id\|\.prefixes\|\.roots\b\|\.suffixes\b\|word\.prefix\b\|word\.root\b\|word\.suffix\b" --include="*.js" --include="*.jsx" api lib src | grep -v node_modules`

Expected: no output (the `?root_id=` query *parameter* name on `GET /api/words` is intentionally kept — grep for `req.query.root_id` separately and confirm it only appears in `api/words/index.js`).

- [ ] **Step 4: Manual verification in the browser**

Start the dev server (`npm run dev`) and, signed in:

1. Gốc từ screen: create a root with a Free/Bound subtype and a meaning; edit both; delete it. Create a `combining_form` entry in its own section.
2. Import screen manual form: build a word with 4 components in a non-default order (root, combining_form, root, suffix — e.g. "speedometer"-like); save; reopen it for edit; confirm the row order and subtype survived.
3. CSV import: paste a row with `components` = `root:act:free_root|suffix:ion` (word "action", meaning "hành động"); confirm the word appears with `word_type` = `derived` in the new "Cấu tạo" column.
4. Vocabulary list: confirm "Cấu tạo" shows the right label for a 0-component word (Đơn), a 1-root+affix word (Phái sinh), and a 2-root word (Ghép).
5. Dashboard preview card and Study screen reveal panel: breakdown chips render in saved order with meanings underneath; clicking the root chip navigates to the Vocabulary tab filtered to that root, and the badge text reads correctly; × clears the filter.
6. Study session: a word with 2+ components hits the `parts` exercise and hides one random component each time (repeat a few cards to see it vary); a 0-component word never shows `parts`.

- [ ] **Step 5: Final commit (only if verification turned up fixes)**

If any of the manual checks above required a code fix, commit it with a message describing what was wrong; otherwise this task produces no commit.
