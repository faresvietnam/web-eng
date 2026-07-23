# Prefix / Root / Suffix with meanings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `segments` word-breakdown field with structured, reusable prefix/root/suffix entries that each carry their own meaning, shown under the word breakdown chips, with root chips clickable to filter the Vocabulary list.

**Architecture:** Three new Supabase tables (`prefixes`, `roots`, `suffixes`), each with `text` + `meaning` + RLS by `user_id`. `words` gets nullable `prefix_id`/`root_id`/`suffix_id` FKs (dropping `segments`). A shared `lib/upsertWordPart.js` resolves plain text typed by the user into a row id (find-or-create) whenever a word is saved. A shared `lib/wordPartsCrud.js` factory backs three parallel sets of thin CRUD routes for a new "Gốc từ" management screen. A shared `WordBreakdown.jsx` component renders the chip+meaning breakdown in both places it appears (Dashboard preview card, Study screen reveal panel), and is the one place the root-click-to-filter behavior lives.

**Tech Stack:** React 18 (plain JS, no router), Vite, Vitest (Node environment, no DOM — components are verified manually in the browser, matching existing repo convention), Supabase (Postgres + RLS) via Vercel serverless functions under `/api`.

## Global Constraints

- All user-facing copy is Vietnamese, matching existing screens.
- No new routing library — new screens are added as another `TABS` entry in `App.jsx`, switched via `activeTab` state (existing pattern).
- New tables' RLS must mirror the exact "own rows" policy shape already used for `words` (`supabase/migrations/0002_add_user_id_and_rls.sql`).
- Single-user personal app — no concurrency handling beyond the DB `unique(user_id, text)` constraint; a plain select-then-insert in `upsertWordPart` is sufficient.
- Old `segments` data is not migrated; the column is dropped outright.
- No autocomplete/typeahead on prefix/root/suffix text inputs — plain text, exact-match find-or-create (same as how `category` works today).
- Only the **root** chip is clickable (navigates to a filtered Vocabulary list); prefix/suffix chips are never clickable.
- `lib/*.js` files stay CommonJS (`require`/`module.exports`), matching every existing file in `lib/`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0005_prefix_root_suffix.sql`

**Interfaces:**
- Produces: tables `prefixes(id, prefix, meaning, user_id, created_at)`, `roots(id, root, meaning, user_id, created_at)`, `suffixes(id, suffix, meaning, user_id, created_at)`; `words` gains `prefix_id`, `root_id`, `suffix_id` (nullable bigint FKs); `words.segments` is dropped.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0005_prefix_root_suffix.sql
create table prefixes (
  id bigint generated always as identity primary key,
  prefix text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, prefix)
);

create table roots (
  id bigint generated always as identity primary key,
  root text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, root)
);

create table suffixes (
  id bigint generated always as identity primary key,
  suffix text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, suffix)
);

alter table prefixes enable row level security;
alter table roots enable row level security;
alter table suffixes enable row level security;

create policy "own rows" on prefixes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on roots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on suffixes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table words
  add column prefix_id bigint references prefixes(id) on delete set null,
  add column root_id bigint references roots(id) on delete set null,
  add column suffix_id bigint references suffixes(id) on delete set null,
  drop column segments;
```

- [ ] **Step 2: Apply the migration**

Paste the contents of `supabase/migrations/0005_prefix_root_suffix.sql` into the Supabase project's SQL editor and run it (same process used for `0001_init.sql` per `README.md`).

- [ ] **Step 3: Verify the schema**

Run this query in the SQL editor:

```sql
select table_name, column_name from information_schema.columns
where table_name in ('prefixes', 'roots', 'suffixes', 'words')
  and column_name in ('prefix', 'root', 'suffix', 'meaning', 'prefix_id', 'root_id', 'suffix_id', 'segments')
order by table_name, column_name;
```

Expected: rows for `prefixes.prefix`, `prefixes.meaning`, `roots.root`, `roots.meaning`, `suffixes.suffix`, `suffixes.meaning`, `words.prefix_id`, `words.root_id`, `words.suffix_id` — and **no** `words.segments` row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_prefix_root_suffix.sql
git commit -m "feat: add prefixes/roots/suffixes tables, drop words.segments"
```

---

### Task 2: `lib/upsertWordPart.js` — find-or-create helper

**Files:**
- Create: `lib/upsertWordPart.js`
- Test: `tests/upsertWordPart.test.js`

**Interfaces:**
- Produces: `upsertWordPart(supabase, table, column, text) -> Promise<number|null>` — used by Task 6 (`api/words`) and Task 7 (`api/words/import.js`).

- [ ] **Step 1: Write the failing test**

```js
// tests/upsertWordPart.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- upsertWordPart`
Expected: FAIL with `Cannot find module '../lib/upsertWordPart'`

- [ ] **Step 3: Write the implementation**

```js
// lib/upsertWordPart.js
async function upsertWordPart(supabase, table, column, text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq(column, trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from(table)
    .insert({ [column]: trimmed })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

module.exports = { upsertWordPart };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- upsertWordPart`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/upsertWordPart.js tests/upsertWordPart.test.js
git commit -m "feat: add upsertWordPart find-or-create helper"
```

---

### Task 3: `lib/wordPartsCrud.js` — shared CRUD handler factory

**Files:**
- Create: `lib/wordPartsCrud.js`
- Test: `tests/wordPartsCrud.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createListHandler(table, column) -> async (req, res, supabase) => void` (GET list, POST create) and `createItemHandler(table, column) -> async (req, res, supabase, id) => void` (PUT update, DELETE) — used by Task 4's six route files.

- [ ] **Step 1: Write the failing test**

```js
// tests/wordPartsCrud.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createListHandler, createItemHandler } = require('../lib/wordPartsCrud');

function makeRes() {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('createListHandler', () => {
  const handleList = createListHandler('roots', 'root');

  it('GET returns the list under the table name', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ id: 1, root: 'act', meaning: 'hành động' }], error: null }),
        }),
      }),
    };
    const req = { method: 'GET' };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ roots: [{ id: 1, root: 'act', meaning: 'hành động' }] });
  });

  it('POST creates a row and returns it under the singular key', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 2, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { root: ' spect ', meaning: 'nhìn' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ root: { id: 2, root: 'spect', meaning: 'nhìn' } });
  });

  it('POST rejects a blank root without touching supabase', async () => {
    const req = { method: 'POST', body: { root: '   ' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects unsupported methods', async () => {
    const req = { method: 'DELETE' };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(405);
  });
});

describe('createItemHandler', () => {
  const handleItem = createItemHandler('roots', 'root');

  it('PUT updates the row and returns it under the singular key', async () => {
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
    const req = { method: 'PUT', body: { root: 'act', meaning: 'hành động' } };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ root: { id: 3, root: 'act', meaning: 'hành động' } });
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

Run: `npm test -- wordPartsCrud`
Expected: FAIL with `Cannot find module '../lib/wordPartsCrud'`

- [ ] **Step 3: Write the implementation**

```js
// lib/wordPartsCrud.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- wordPartsCrud`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/wordPartsCrud.js tests/wordPartsCrud.test.js
git commit -m "feat: add shared CRUD handler factory for word-part tables"
```

---

### Task 4: CRUD API routes for prefixes/roots/suffixes

**Files:**
- Create: `api/prefixes/index.js`, `api/prefixes/[id].js`
- Create: `api/roots/index.js`, `api/roots/[id].js`
- Create: `api/suffixes/index.js`, `api/suffixes/[id].js`

**Interfaces:**
- Consumes: `getSupabaseClient(token)` (`lib/supabaseClient.js`), `requireUser(req, res)` (`lib/auth.js`), `createListHandler`/`createItemHandler` (Task 3).
- Produces: `GET/POST /api/prefixes`, `PUT/DELETE /api/prefixes/:id` (and the same for `roots`, `suffixes`) — consumed by Task 5's `src/api.js`.

- [ ] **Step 1: Create the prefixes routes**

```js
// api/prefixes/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createListHandler } = require('../../lib/wordPartsCrud');

const handleList = createListHandler('prefixes', 'prefix');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleList(req, res, supabase);
};
```

```js
// api/prefixes/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createItemHandler } = require('../../lib/wordPartsCrud');

const handleItem = createItemHandler('prefixes', 'prefix');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleItem(req, res, supabase, req.query.id);
};
```

- [ ] **Step 2: Create the roots routes**

```js
// api/roots/index.js
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
```

```js
// api/roots/[id].js
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
```

- [ ] **Step 3: Create the suffixes routes**

```js
// api/suffixes/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createListHandler } = require('../../lib/wordPartsCrud');

const handleList = createListHandler('suffixes', 'suffix');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleList(req, res, supabase);
};
```

```js
// api/suffixes/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { createItemHandler } = require('../../lib/wordPartsCrud');

const handleItem = createItemHandler('suffixes', 'suffix');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  await handleItem(req, res, supabase, req.query.id);
};
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions (these route files are thin wrappers already covered by Task 3's handler tests — no route files elsewhere in this repo have dedicated tests either, consistent with `api/words/*.js` today).

- [ ] **Step 5: Commit**

```bash
git add api/prefixes api/roots api/suffixes
git commit -m "feat: add CRUD API routes for prefixes/roots/suffixes"
```

---

### Task 5: "Gốc từ" management screen

**Files:**
- Modify: `src/api.js`
- Create: `src/screens/WordPartsScreen.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `/api/prefixes`, `/api/roots`, `/api/suffixes` routes (Task 4).
- Produces: `api.getPrefixes/createPrefix/updatePrefix/deletePrefix` (and the `Root`/`Suffix` equivalents) on the `api` object exported from `src/api.js`, used by `WordPartsScreen.jsx` and, later, nothing else (Import screen in Task 10 posts `prefix`/`root`/`suffix` text directly on `createWord`/`updateWord`, not through these).

- [ ] **Step 1: Add the CRUD methods to `src/api.js`**

Add these entries to the exported `api` object in `src/api.js`, right after the existing `deleteWord` line:

```js
  getPrefixes: () => request('/api/prefixes'),
  createPrefix: (body) => request('/api/prefixes', { method: 'POST', body: JSON.stringify(body) }),
  updatePrefix: (id, body) => request(`/api/prefixes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePrefix: (id) => request(`/api/prefixes/${id}`, { method: 'DELETE' }),
  getRoots: () => request('/api/roots'),
  createRoot: (body) => request('/api/roots', { method: 'POST', body: JSON.stringify(body) }),
  updateRoot: (id, body) => request(`/api/roots/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRoot: (id) => request(`/api/roots/${id}`, { method: 'DELETE' }),
  getSuffixes: () => request('/api/suffixes'),
  createSuffix: (body) => request('/api/suffixes', { method: 'POST', body: JSON.stringify(body) }),
  updateSuffix: (id, body) => request(`/api/suffixes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSuffix: (id) => request(`/api/suffixes/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Create `WordPartsScreen.jsx`**

```jsx
// src/screens/WordPartsScreen.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const SECTIONS = [
  { key: 'prefix', label: 'Prefix', title: 'Prefix (tiền tố)', column: 'prefix', listKey: 'prefixes', get: api.getPrefixes, create: api.createPrefix, update: api.updatePrefix, remove: api.deletePrefix },
  { key: 'root', label: 'Root', title: 'Root (gốc từ)', column: 'root', listKey: 'roots', get: api.getRoots, create: api.createRoot, update: api.updateRoot, remove: api.deleteRoot },
  { key: 'suffix', label: 'Suffix', title: 'Suffix (hậu tố)', column: 'suffix', listKey: 'suffixes', get: api.getSuffixes, create: api.createSuffix, update: api.updateSuffix, remove: api.deleteSuffix },
];

function PartTable({ section }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [error, setError] = useState(null);

  function reload() {
    section.get().then((data) => setItems(data[section.listKey])).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    try {
      await section.create({ [section.column]: newText, meaning: newMeaning });
      setNewText('');
      setNewMeaning('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMeaningBlur(item, meaning) {
    try {
      await section.update(item.id, { [section.column]: item[section.column], meaning });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await section.remove(id);
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
          <tr><th>{section.label}</th><th>Nghĩa</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ fontWeight: 600 }}>{item[section.column]}</td>
              <td>
                <input
                  className="input"
                  defaultValue={item.meaning || ''}
                  onBlur={(e) => handleMeaningBlur(item, e.target.value)}
                />
              </td>
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
        <button type="submit" className="btn btn-primary">Thêm</button>
      </form>
    </div>
  );
}

export default function WordPartsScreen() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Gốc từ</h1>
      {SECTIONS.map((section) => <PartTable key={section.key} section={section} />)}
    </div>
  );
}
```

- [ ] **Step 3: Wire the new tab into `App.jsx`**

In `src/App.jsx`, add the import:

```js
import WordPartsScreen from './screens/WordPartsScreen.jsx';
```

Update `TABS` (insert between `import` and `settings`):

```js
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'learn', label: 'Learn' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'import', label: 'Import' },
  { key: 'wordparts', label: 'Gốc từ' },
  { key: 'settings', label: 'Settings' },
];
```

Add the render branch (next to the `activeTab === 'import'` line):

```jsx
{activeTab === 'wordparts' && <WordPartsScreen />}
```

- [ ] **Step 4: Manual verification**

```bash
npm test
```
Expected: PASS, no regressions.

Run `vercel dev`, log in, click the new "Gốc từ" tab. Add a root with text `act` and meaning `hành động`, confirm it appears in the table. Edit the meaning field and blur — confirm it persists after a page reload. Delete it — confirm it disappears. Repeat briefly for one prefix and one suffix entry.

- [ ] **Step 5: Commit**

```bash
git add src/api.js src/screens/WordPartsScreen.jsx src/App.jsx
git commit -m "feat: add Gốc từ management screen for prefix/root/suffix meanings"
```

---

### Task 6: `api/words` — joins, find-or-create, root filter

**Files:**
- Modify: `api/words/index.js`
- Modify: `api/words/[id].js`

**Interfaces:**
- Consumes: `upsertWordPart(supabase, table, column, text)` (Task 2).
- Produces: `GET /api/words` now returns each word with nested `prefix`, `root`, `suffix` objects (`{id, prefix|root|suffix, meaning}` or `null`); accepts `?root_id=` to filter. `POST`/`PUT` now accept `prefix`, `root`, `suffix` **text** fields (replacing `segments`) — consumed by Task 10 (Import screen) and Task 11 (Dashboard/Vocabulary display).

- [ ] **Step 1: Update `api/words/index.js`**

```js
// api/words/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { upsertWordPart } = require('../../lib/upsertWordPart');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
    let query = supabase
      .from('words')
      .select('*, review_state!inner(*), prefix:prefixes(*), root:roots(*), suffix:suffixes(*)');
    if (req.query.status) {
      query = query.eq('review_state.status', req.query.status);
    }
    if (req.query.root_id) {
      query = query.eq('root_id', req.query.root_id);
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
    res.status(200).json({ words: data });
    return;
  }

  if (req.method === 'POST') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const now = new Date().toISOString();
    let prefix_id, root_id, suffix_id;
    try {
      [prefix_id, root_id, suffix_id] = await Promise.all([
        upsertWordPart(supabase, 'prefixes', 'prefix', prefix),
        upsertWordPart(supabase, 'roots', 'root', root),
        upsertWordPart(supabase, 'suffixes', 'suffix', suffix),
      ]);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data: inserted, error: insertError } = await supabase
      .from('words')
      .insert({ word, meaning, category, part_of_speech, ipa, example, example_vi, prefix_id, root_id, suffix_id })
      .select()
      .single();
    if (insertError) {
      res.status(500).json({ error: insertError.message });
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

- [ ] **Step 2: Update `api/words/[id].js`**

```js
// api/words/[id].js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { upsertWordPart } = require('../../lib/upsertWordPart');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const id = req.query.id;

  if (req.method === 'PUT') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    let prefix_id, root_id, suffix_id;
    try {
      [prefix_id, root_id, suffix_id] = await Promise.all([
        upsertWordPart(supabase, 'prefixes', 'prefix', prefix),
        upsertWordPart(supabase, 'roots', 'root', root),
        upsertWordPart(supabase, 'suffixes', 'suffix', suffix),
      ]);
    } catch (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const { data, error } = await supabase
      .from('words')
      .update({ word, meaning, category, part_of_speech, ipa, example, example_vi, prefix_id, root_id, suffix_id })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
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

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions. (These route files have no dedicated tests in this repo, same as before this change — `upsertWordPart` itself is already covered by Task 2. Full behavior is verified end-to-end in Task 10 once the Import screen can send `prefix`/`root`/`suffix` text.)

- [ ] **Step 4: Commit**

```bash
git add api/words/index.js "api/words/[id].js"
git commit -m "feat: resolve prefix/root/suffix text on word save, add root_id filter"
```

---

### Task 7: CSV import — prefix/root/suffix columns

**Files:**
- Modify: `lib/csv.js`
- Modify: `tests/csv.test.js`
- Modify: `api/words/import.js`

**Interfaces:**
- Consumes: `upsertWordPart` (Task 2).
- Produces: `parseWordsCsv` rows now carry `prefix`/`root`/`suffix` keys instead of `segments` — consumed by `api/words/import.js`.

- [ ] **Step 1: Update the failing test expectations first**

```js
// tests/csv.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseWordsCsv } = require('../lib/csv');

describe('parseWordsCsv', () => {
  it('parses valid rows with all columns', () => {
    const csv = 'word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix\nunbelievable,không thể tin được,adjectives,adj,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,un,believ,able';
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
        prefix: 'un',
        root: 'believ',
        suffix: 'able',
      },
    ]);
  });

  it('fills optional columns with null when missing', () => {
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
      prefix: null,
      root: null,
      suffix: null,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- csv`
Expected: FAIL (rows still contain `segments` instead of `prefix`/`root`/`suffix`)

- [ ] **Step 3: Update `lib/csv.js`**

```js
// lib/csv.js
const REQUIRED_HEADERS = ['word', 'meaning'];
const OPTIONAL_HEADERS = ['category', 'part_of_speech', 'ipa', 'example', 'example_vi', 'prefix', 'root', 'suffix'];

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
    rows.push(row);
  }

  return { rows, errors };
}

module.exports = { parseWordsCsv };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- csv`
Expected: PASS (5 tests)

- [ ] **Step 5: Update `api/words/import.js` to resolve prefix/root/suffix per row**

```js
// api/words/import.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { parseWordsCsv } = require('../../lib/csv');
const { upsertWordPart } = require('../../lib/upsertWordPart');

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

  let resolvedRows;
  try {
    resolvedRows = await Promise.all(rows.map(async (row) => {
      const { prefix, root, suffix, ...rest } = row;
      const [prefix_id, root_id, suffix_id] = await Promise.all([
        upsertWordPart(supabase, 'prefixes', 'prefix', prefix),
        upsertWordPart(supabase, 'roots', 'root', root),
        upsertWordPart(supabase, 'suffixes', 'suffix', suffix),
      ]);
      return { ...rest, prefix_id, root_id, suffix_id };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
    return;
  }

  const { data: inserted, error: insertError } = await supabase.from('words').insert(resolvedRows).select();
  if (insertError) {
    res.status(500).json({ error: insertError.message });
    return;
  }

  const reviewStates = inserted.map((w) => ({
    word_id: w.id,
    status: 'new',
    step_index: 0,
    interval_days: 0,
    correct_count: 0,
    failure_count: 0,
    next_review_at: now,
  }));

  const { error: reviewStateError } = await supabase.from('review_state').insert(reviewStates);
  if (reviewStateError) {
    const { error: cleanupError } = await supabase
      .from('words')
      .delete()
      .in('id', inserted.map((w) => w.id));
    if (cleanupError) {
      console.error('Failed to clean up orphaned words after review_state insert failure:', cleanupError.message);
    }
    res.status(500).json({ error: reviewStateError.message });
    return;
  }

  res.status(200).json({ imported: inserted.length, errors });
};
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add lib/csv.js tests/csv.test.js api/words/import.js
git commit -m "feat: replace segments CSV column with prefix/root/suffix"
```

---

### Task 8: Study exercise progression — `parts` replaces `segment`

**Files:**
- Modify: `lib/exerciseType.js`
- Modify: `tests/exerciseType.test.js`
- Modify: `api/session/today.js`

**Interfaces:**
- Produces: `pickExerciseType({status, correct_count, hasParts, hasExample})` returns `'parts'` instead of `'segment'` — consumed by Task 12 (`StudyScreen.jsx`).

- [ ] **Step 1: Update the failing test expectations first**

```js
// tests/exerciseType.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasParts: true, hasExample: true })).toBe('full_type');
  });

  it('returns new_combo at correct_count 0', () => {
    expect(pickExerciseType({ status: 'new', correct_count: 0, hasParts: false, hasExample: false })).toBe('new_combo');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasParts: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns mc_sentence at correct_count 2 when hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasParts: false, hasExample: true })).toBe('mc_sentence');
  });

  it('falls back to mc_vi_en at correct_count 2 when not hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasParts: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns parts at correct_count 3 when hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasParts: true, hasExample: false })).toBe('parts');
  });

  it('returns full_type at correct_count 3 when not hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasParts: false, hasExample: false })).toBe('full_type');
  });

  it('keeps returning parts at correct_count 4+ when hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 4, hasParts: true, hasExample: true })).toBe('parts');
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasParts: true, hasExample: false })).toBe('parts');
  });

  it('returns full_type at correct_count 10 when not hasParts', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasParts: false, hasExample: false })).toBe('full_type');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- exerciseType`
Expected: FAIL (`hasSegments` no longer matches; `'segment'` no longer returned)

- [ ] **Step 3: Update `lib/exerciseType.js`**

```js
// lib/exerciseType.js
function pickExerciseType({ status, correct_count, hasParts, hasExample }) {
  if (status === 'difficult') return 'full_type';
  if (correct_count === 0) return 'new_combo';
  if (correct_count === 1) return 'mc_vi_en';
  if (correct_count === 2) return hasExample ? 'mc_sentence' : 'mc_vi_en';
  return hasParts ? 'parts' : 'full_type';
}

module.exports = { pickExerciseType };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- exerciseType`
Expected: PASS (9 tests)

- [ ] **Step 5: Update `api/session/today.js`**

```js
// api/session/today.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');
const { hasUsableSentence } = require('../../lib/sentenceBlank');

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

  const wordsSelect = '*, prefix:prefixes(*), root:roots(*), suffix:suffixes(*)';

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

  const cards = queue.map((state) => ({
    word: state.words,
    review_state: state,
    exercise_type: pickExerciseType({
      status: state.status,
      correct_count: state.correct_count,
      hasParts: Boolean(state.words.prefix_id || state.words.root_id || state.words.suffix_id),
      hasExample: hasUsableSentence(state.words.example, state.words.word),
    }),
  }));

  res.status(200).json({ cards, total: cards.length });
};
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add lib/exerciseType.js tests/exerciseType.test.js api/session/today.js
git commit -m "feat: rename segment exercise to parts, join prefix/root/suffix in today's queue"
```

---

### Task 9: `WordBreakdown` shared component

**Files:**
- Create: `src/components/WordBreakdown.jsx`

**Interfaces:**
- Consumes: a `word` prop shaped `{ prefix: {id, prefix, meaning}|null, root: {id, root, meaning}|null, suffix: {id, suffix, meaning}|null, ... }` (the shape `GET /api/words` and `GET /api/session/today` now return, per Task 6/8).
- Produces: `<WordBreakdown word={word} onRootClick={fn?} />` — renders `null` if the word has no prefix/root/suffix; calls `onRootClick({id, root, meaning})` when the root chip is clicked and `onRootClick` was passed. Used by Task 11 (`DashboardScreen.jsx`) and Task 12 (`StudyScreen.jsx`).

- [ ] **Step 1: Create the component**

```jsx
// src/components/WordBreakdown.jsx
import React from 'react';

const PART_CONFIG = [
  { key: 'prefix', chipClass: 'chip-1', getText: (data) => data.prefix },
  { key: 'root', chipClass: 'chip-2', getText: (data) => data.root },
  { key: 'suffix', chipClass: 'chip-1', getText: (data) => data.suffix },
];

export default function WordBreakdown({ word, onRootClick }) {
  const parts = PART_CONFIG
    .map((cfg) => (word[cfg.key] ? { ...cfg, data: word[cfg.key] } : null))
    .filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {parts.map((part, i) => {
          const text = part.getText(part.data);
          return (
            <React.Fragment key={part.key}>
              {i > 0 && <span style={{ color: 'var(--ink-3)', marginTop: 6 }}>+</span>}
              <div style={{ textAlign: 'center' }}>
                {part.key === 'root' && onRootClick ? (
                  <button
                    className={`chip ${part.chipClass}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => onRootClick(part.data)}
                  >
                    {text}
                  </button>
                ) : (
                  <span className={`chip ${part.chipClass}`}>{text}</span>
                )}
                {part.data.meaning && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{part.data.meaning}</div>
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

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions. (No React component tests exist in this repo — `vitest.config.js` runs in the `node` environment with no DOM — this component is verified manually in the browser once wired up in Tasks 11 and 12.)

- [ ] **Step 3: Commit**

```bash
git add src/components/WordBreakdown.jsx
git commit -m "feat: add shared WordBreakdown component"
```

---

### Task 10: Import screen — prefix/root/suffix fields

**Files:**
- Modify: `src/screens/ImportScreen.jsx`

**Interfaces:**
- Consumes: `api.createWord`/`api.updateWord` now accept `prefix`/`root`/`suffix` text (Task 6).

- [ ] **Step 1: Update `EMPTY_FORM` and `FIELDS`**

```js
const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', prefix: '', root: '', suffix: '' };

const FIELDS = [
  { key: 'word', label: 'Word', placeholder: 'unbelievable' },
  { key: 'meaning', label: 'Meaning', placeholder: 'không thể tin được' },
  { key: 'category', label: 'Category', placeholder: 'appearance' },
  { key: 'part_of_speech', label: 'Part of speech', placeholder: 'adjective' },
  { key: 'ipa', label: 'IPA', placeholder: '/ʌnbɪˈliːvəbl/' },
  { key: 'prefix', label: 'Prefix', placeholder: 'un' },
  { key: 'root', label: 'Root', placeholder: 'believ' },
  { key: 'suffix', label: 'Suffix', placeholder: 'able' },
];
```

- [ ] **Step 2: Update the CSV template**

```js
const TEMPLATE_CSV =
  'word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix\n' +
  'unbelievable,không thể tin được,appearance,adjective,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,un,believ,able\n';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;
```

- [ ] **Step 3: Update the `editingWord` pre-fill effect**

```js
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
        prefix: editingWord.prefix?.prefix || '',
        root: editingWord.root?.root || '',
        suffix: editingWord.suffix?.suffix || '',
      });
    }
  }, [editingWord]);
```

- [ ] **Step 4: Update the two CSV format-tip strings**

Replace both occurrences of `Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, segments` with:

```
Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix
```

And the `placeholder` on the CSV `<textarea>`:

```jsx
placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix"
```

- [ ] **Step 5: Manual verification**

```bash
npm test
```
Expected: PASS, no regressions.

Run `vercel dev`, go to Import, fill in Word=`unbelievable`, Meaning=`không thể tin được`, Prefix=`un`, Root=`believ`, Suffix=`able`, save. Go to the "Gốc từ" tab (Task 5) and confirm new rows `un` / `believ` / `able` appeared in their respective tables (meaning empty). Fill in meanings there (e.g. root `believ` → `tin`).

- [ ] **Step 6: Commit**

```bash
git add src/screens/ImportScreen.jsx
git commit -m "feat: replace segments field with prefix/root/suffix in Import screen"
```

---

### Task 11: Dashboard breakdown display + root click-through to Vocabulary

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/screens/DashboardScreen.jsx`
- Modify: `src/screens/VocabularyScreen.jsx`

**Interfaces:**
- Consumes: `WordBreakdown` (Task 9), `GET /api/words?root_id=` (Task 6).
- Produces: `App.jsx` now owns `rootFilter` (`null | {id, root, meaning}`) and `handleRootClick`/`handleClearRootFilter`, passed down as props.

- [ ] **Step 1: Add root-filter state and handlers to `App.jsx`**

Add next to the existing `editingWord`/`dailyGoal` state:

```js
  const [rootFilter, setRootFilter] = useState(null);
```

Add next to `handleEditWord`/`handleImportDone`:

```js
  function handleRootClick(root) {
    setRootFilter(root);
    setActiveTab('vocabulary');
  }

  function handleClearRootFilter() {
    setRootFilter(null);
  }
```

- [ ] **Step 2: Pass the new props into `DashboardScreen` and `VocabularyScreen`**

```jsx
          {activeTab === 'dashboard' && <DashboardScreen onViewAllDifficult={() => setActiveTab('vocabulary')} onRootClick={handleRootClick} />}
          {activeTab === 'learn' && <StudyScreen />}
          {activeTab === 'vocabulary' && <VocabularyScreen onEdit={handleEditWord} rootFilter={rootFilter} onClearRootFilter={handleClearRootFilter} />}
```

- [ ] **Step 3: Integrate `WordBreakdown` into `DashboardScreen.jsx`**

Add the import:

```js
import WordBreakdown from '../components/WordBreakdown.jsx';
```

Change the component signature:

```js
export default function DashboardScreen({ onViewAllDifficult, onRootClick }) {
```

Replace the `previewCard.word.segments && (...)` block (the "Word breakdown" `div`) with:

```jsx
            <WordBreakdown word={previewCard.word} onRootClick={onRootClick} />
```

- [ ] **Step 4: Add the root-filter badge and query param to `VocabularyScreen.jsx`**

Change the component signature:

```js
export default function VocabularyScreen({ onEdit, rootFilter, onClearRootFilter }) {
```

Update `reload` and its effect dependency:

```js
  function reload() {
    const params = {};
    if (filter !== 'all') params.status = filter;
    if (search) params.q = search;
    if (rootFilter) params.root_id = rootFilter.id;
    api.getWords(params).then((data) => setWords(data.words)).catch((err) => console.error('Failed to load words:', err.message));
  }

  useEffect(reload, [filter, search, rootFilter]);
```

Add the badge, right after the `<h1>` and before the filter/search row:

```jsx
      {rootFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span className="tag tag-pos">Gốc từ: {rootFilter.root}</span>
          <button className="btn btn-secondary" onClick={onClearRootFilter}>×</button>
        </div>
      )}
```

- [ ] **Step 5: Manual verification**

```bash
npm test
```
Expected: PASS, no regressions.

Run `vercel dev`. On the Dashboard, cycle the preview card (Next button) to the `unbelievable` word created in Task 10. Confirm the "Word breakdown" section shows three chips (`un`, `believ`, `able`) with the meaning you set for `believ` shown underneath it. Click the `believ` chip — confirm you land on the Vocabulary tab, a "Gốc từ: believ ×" badge is shown, and the table lists only `unbelievable`. Click × — confirm the badge disappears and the full list returns.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/screens/DashboardScreen.jsx src/screens/VocabularyScreen.jsx
git commit -m "feat: show word breakdown meanings on Dashboard, click root to filter Vocabulary"
```

---

### Task 12: Study screen — `WordBreakdown` + `parts` exercise

**Files:**
- Modify: `src/screens/StudyScreen.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `WordBreakdown` (Task 9), `exercise_type: 'parts'` (Task 8), `handleRootClick` (Task 11).

- [ ] **Step 1: Pass `onRootClick` into `StudyScreen` from `App.jsx`**

```jsx
          {activeTab === 'learn' && <StudyScreen onRootClick={handleRootClick} />}
```

- [ ] **Step 2: Update `StudyScreen.jsx` imports and component signature**

```js
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { speak } from '../speak.js';
import WordBreakdown from '../components/WordBreakdown.jsx';
```

```js
export default function StudyScreen({ onRootClick }) {
```

- [ ] **Step 3: Replace `segmentIndex` state with `partAnswered`**

Replace:

```js
  const [segmentIndex, setSegmentIndex] = useState(0);
```

with:

```js
  const [partAnswered, setPartAnswered] = useState(false);
```

- [ ] **Step 4: Replace the `segments` derivation with a `parts` list and a memoized hidden-part index**

Replace:

```js
  const segments = word && word.segments ? word.segments.split('|') : [];
```

with:

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

  const hiddenPartIndex = useMemo(() => {
    if (parts.length === 0) return -1;
    return Math.floor(Math.random() * parts.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

- [ ] **Step 5: Update `goNext` to reset `partAnswered` instead of `segmentIndex`**

Replace:

```js
        setSegmentIndex(0);
```

with:

```js
        setPartAnswered(false);
```

- [ ] **Step 6: Update the speak-on-reveal effect's exercise_type check**

Replace:

```js
    if (answered && (exercise_type === 'segment' || exercise_type === 'full_type')) {
```

with:

```js
    if (answered && (exercise_type === 'parts' || exercise_type === 'full_type')) {
```

- [ ] **Step 7: Replace `handleSegmentSubmit` with `handlePartSubmit`**

Replace:

```js
  function handleSegmentSubmit(e) {
    e.preventDefault();
    const expected = segments[segmentIndex];
    if (textInput.trim().toLowerCase() === expected.toLowerCase()) {
      setInputError(false);
      setSegmentIndex((s) => s + 1);
      setTextInput('');
    } else {
      setInputError(true);
      setMistakeMade(true);
    }
  }
```

with:

```js
  function handlePartSubmit(e) {
    e.preventDefault();
    const expected = parts[hiddenPartIndex].text;
    if (textInput.trim().toLowerCase() === expected.toLowerCase()) {
      setInputError(false);
      setPartAnswered(true);
      setTextInput('');
    } else {
      setInputError(true);
      setMistakeMade(true);
    }
  }
```

- [ ] **Step 8: Replace the two `exercise_type === 'segment'` form blocks**

Replace both blocks (the "type each segment in order" form and the "type the full word" form that follows it):

```jsx
      {!answered && exercise_type === 'segment' && segmentIndex < segments.length && (
        <form onSubmit={handleSegmentSubmit} style={{ marginBottom: 24 }}>
          <p>
            {segments.map((seg, i) => (
              <span key={i}>{i < segmentIndex ? seg : i === segmentIndex ? '____' : '....'} </span>
            ))}
          </p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}

      {!answered && exercise_type === 'segment' && segmentIndex >= segments.length && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>Nhập lại toàn bộ từ:</p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}
```

with:

```jsx
      {!answered && exercise_type === 'parts' && !partAnswered && (
        <form onSubmit={handlePartSubmit} style={{ marginBottom: 24 }}>
          <p>
            {parts.map((p, i) => (
              <span key={p.type}>{i === hiddenPartIndex ? '____' : p.text} </span>
            ))}
          </p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}

      {!answered && exercise_type === 'parts' && partAnswered && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>Nhập lại toàn bộ từ:</p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}
```

- [ ] **Step 9: Replace the `word.segments` reveal-panel block with `WordBreakdown`**

Replace:

```jsx
          {word.segments && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {segments.map((seg, i) => (
                  <React.Fragment key={seg}>
                    {i > 0 && <span style={{ color: 'var(--ink-3)' }}>+</span>}
                    <span className={`chip ${i === 0 ? 'chip-1' : 'chip-2'}`}>{seg}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
```

with:

```jsx
          <WordBreakdown word={word} onRootClick={onRootClick} />
```

- [ ] **Step 10: Manual verification**

```bash
npm test
```
Expected: PASS, no regressions.

Run `vercel dev`, go to Learn. If no card currently reaches the `parts` exercise naturally (it requires `correct_count >= 3` and `status !== 'difficult'`), open the Supabase SQL editor and temporarily fast-forward one word's review state for the `unbelievable` word created earlier:

```sql
update review_state set status = 'learning', correct_count = 3, next_review_at = now() - interval '1 hour'
where word_id = (select id from words where word = 'unbelievable');
```

Reload the Learn tab. Confirm the card shows two of the three parts as plain text and one as `____`; type the correct hidden part, confirm it advances to "Nhập lại toàn bộ từ", type `unbelievable`, confirm it advances to the reveal panel showing all three chips with meanings underneath, and that clicking the root chip navigates to the Vocabulary tab filtered to that root. Repeat the SQL update 3–4 times and reload to confirm the hidden part varies across attempts.

- [ ] **Step 11: Commit**

```bash
git add src/screens/StudyScreen.jsx src/App.jsx
git commit -m "feat: replace segment exercise with random-part parts exercise, show breakdown meanings"
```

---

### Task 13: Final end-to-end verification

No file changes — this is a checklist pass over the whole feature before considering it done.

- [ ] **Step 1: Run the full automated suite**

```bash
npm test
```
Expected: PASS, all tests green.

- [ ] **Step 2: Confirm no leftover references to the removed `segments` field**

```bash
grep -rn "segments" --include="*.js" --include="*.jsx" src api lib
```
Expected: no output (the only remaining `segments` mentions, if any, should be in `docs/` or old spec files, not in shipped code).

- [ ] **Step 3: Browser walkthrough**

Run `vercel dev` and walk through, in order:
1. Gốc từ screen: create a prefix, a root, and a suffix, each with a meaning; edit one meaning; delete one entry — confirm the table updates each time.
2. Import screen: create a new word with all three fields filled in text that does **not** yet exist in the Gốc từ tables — confirm new rows appear there afterward with empty meaning.
3. Import screen: create a second word reusing the **same** root text as an existing entry — confirm no duplicate root row is created (only one row for that root text).
4. Dashboard preview card: confirm breakdown chips show only the parts a word actually has (a word with just a root and no prefix/suffix shows one chip, not three).
5. Click a root chip from the Dashboard — confirm it lands on Vocabulary filtered to that root, and × clears the filter back to the unfiltered list.
6. Vocabulary screen: confirm the root filter and the status pill filter both apply together when both are set.
7. Study screen: confirm a word with zero prefix/root/suffix never shows the `parts` exercise type (goes straight to `full_type` once past `mc_sentence`).
8. Study screen: confirm a word with 1–3 parts shows the `parts` exercise, hides exactly one part, and that a wrong answer marks `mistakeMade` (subsequent correct full-word entry should result in `hard` rather than `good` — same behavior as the old segment exercise).

- [ ] **Step 4: Report results**

Summarize which of the above passed and any deviations found — do not proceed to any further work until this checklist is clean.
