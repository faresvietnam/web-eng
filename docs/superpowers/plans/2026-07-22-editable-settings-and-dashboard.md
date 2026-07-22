# Editable Settings + Dashboard Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily new-word/review limits user-configurable (Settings screen), apply them to the real scheduling, fix the sidebar "Daily goal" widget to account for new words too, and change the Dashboard's 1-word preview carousel to browse the whole vocabulary (difficult/due words first) instead of just today's capped queue.

**Architecture:** New `user_settings` table (one row per user, RLS-isolated like the other 4 tables) replaces the hard-coded `NEW_DAILY_LIMIT`/`REVIEW_DAILY_LIMIT` constants. A new `api/settings` endpoint (GET/PUT) reads/writes it; `api/session/today.js` and `api/dashboard/index.js` fetch it and pass real limits into `buildDailyQueue` and the dashboard summary. Frontend: `SettingsScreen` becomes editable, `App.jsx`'s Daily goal widget is recomputed from data already returned by `/api/dashboard`, and `DashboardScreen.jsx`'s preview carousel switches its data source from `/api/session/today` to `/api/words` with a new client-side sort.

**Tech Stack:** React 18 + Vite, Vercel serverless functions (CommonJS), `@supabase/supabase-js`, Supabase Postgres + RLS, Vitest.

## Global Constraints

- `user_settings.user_id` is the primary key, `references auth.users(id) on delete cascade`, RLS policy `user_id = auth.uid()` — identical pattern to `words`/`review_state`/`review_log`/`daily_progress`.
- `PUT /api/settings` must reject (`400`) any `new_daily_limit`/`review_daily_limit` that is not `Number.isInteger(x) && x > 0`.
- `buildDailyQueue` takes `newDailyLimit`/`reviewDailyLimit` as required parameters — no hard-coded fallback inside `lib/dailyQueue.js` itself (callers decide the fallback for "no settings row yet").
- The "no settings row yet" fallback is `{ new_daily_limit: 20, review_daily_limit: 100 }` — used in both `api/session/today.js` and `api/dashboard/index.js`.
- `StudyScreen.jsx` and `api.getToday()` are NOT touched by this plan — only `DashboardScreen.jsx`'s preview carousel changes its data source.
- Project Supabase: `whsyzhsvsmyzdaxqrvoi` (web-eng, region ap-southeast-2). Use Supabase MCP tools (`apply_migration`, `list_tables`) to apply/verify the migration — no manual SQL editor step for the user.

---

## Task 1: `user_settings` table + RLS

**Files:**
- Create: `supabase/migrations/0004_user_settings.sql`
- Apply to Supabase project `whsyzhsvsmyzdaxqrvoi` via MCP `apply_migration`

**Interfaces:**
- Produces: table `user_settings` with columns `user_id uuid primary key references auth.users(id) on delete cascade`, `new_daily_limit integer not null default 20`, `review_daily_limit integer not null default 100`; RLS enabled; one policy `"own rows"` (`using (user_id = auth.uid()) with check (user_id = auth.uid())`).

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0004_user_settings.sql
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_daily_limit integer not null default 20,
  review_daily_limit integer not null default 100
);

alter table user_settings enable row level security;

create policy "own rows" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply via Supabase MCP**

Load the tool if not already available: `ToolSearch({query: "select:mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration,mcp__6c5f47ff-759a-40a7-ae05-33e169423511__list_tables", max_results: 5})`.

Call `apply_migration` with `project_id: "whsyzhsvsmyzdaxqrvoi"`, `name: "user_settings"`, `query` = the file content above.

Expected: success, no errors.

- [ ] **Step 3: Verify with `list_tables`**

Call `list_tables` with `project_id: "whsyzhsvsmyzdaxqrvoi"`, `schemas: ["public"]`, `verbose: true`.

Expected: `public.user_settings` present, `primary_keys: ["user_id"]`, columns `new_daily_limit` (default `20`) and `review_daily_limit` (default `100`), `rls_enabled: true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_user_settings.sql
git commit -m "feat: add user_settings table with RLS"
```

---

## Task 2: `lib/dailyQueue.js` — accept limits as parameters

**Files:**
- Modify: `lib/dailyQueue.js`
- Modify: `tests/dailyQueue.test.js`

**Interfaces:**
- Consumes: none
- Produces: `buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now, newDailyLimit, reviewDailyLimit })` — same return shape as before (array of review-state-like objects, review states first then new-word states). `NEW_DAILY_LIMIT`/`REVIEW_DAILY_LIMIT` exports are removed.

- [ ] **Step 1: Update the test file to the new signature (still asserting the same behavior as before)**

```javascript
// tests/dailyQueue.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildDailyQueue } = require('../lib/dailyQueue');

const NOW = new Date('2026-07-21T00:00:00.000Z');

function due(word_id, failure_count, next_review_at) {
  return { word_id, failure_count, next_review_at, status: 'learning' };
}

function fresh(word_id) {
  return { word_id, status: 'new' };
}

describe('buildDailyQueue', () => {
  it('puts review words before new words', () => {
    const queue = buildDailyQueue({
      dueReviewStates: [due(1, 0, '2026-07-20T00:00:00.000Z')],
      newWordStates: [fresh(2)],
      dailyProgress: { new_learned: 0, reviewed_count: 0 },
      now: NOW,
      newDailyLimit: 20,
      reviewDailyLimit: 100,
    });
    expect(queue.map((s) => s.word_id)).toEqual([1, 2]);
  });

  it('sorts due reviews by failure_count desc, then next_review_at asc', () => {
    const queue = buildDailyQueue({
      dueReviewStates: [
        due(1, 0, '2026-07-20T00:00:00.000Z'),
        due(2, 2, '2026-07-19T00:00:00.000Z'),
        due(3, 2, '2026-07-18T00:00:00.000Z'),
      ],
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 0 },
      now: NOW,
      newDailyLimit: 20,
      reviewDailyLimit: 100,
    });
    expect(queue.map((s) => s.word_id)).toEqual([3, 2, 1]);
  });

  it('caps review count at reviewDailyLimit minus reviewed_count today', () => {
    const dueReviewStates = Array.from({ length: 5 }, (_, i) => due(i + 1, 0, '2026-07-20T00:00:00.000Z'));
    const queue = buildDailyQueue({
      dueReviewStates,
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 98 },
      now: NOW,
      newDailyLimit: 20,
      reviewDailyLimit: 100,
    });
    expect(queue.length).toBe(2);
  });

  it('caps new words at newDailyLimit minus new_learned today, ordered by word_id', () => {
    const newWordStates = [fresh(3), fresh(1), fresh(2)];
    const queue = buildDailyQueue({
      dueReviewStates: [],
      newWordStates,
      dailyProgress: { new_learned: 19, reviewed_count: 0 },
      now: NOW,
      newDailyLimit: 20,
      reviewDailyLimit: 100,
    });
    expect(queue.map((s) => s.word_id)).toEqual([1]);
  });

  it('respects a custom reviewDailyLimit smaller than the default', () => {
    const dueReviewStates = [due(1, 0, '2026-07-20T00:00:00.000Z'), due(2, 0, '2026-07-20T00:00:00.000Z')];
    const queue = buildDailyQueue({
      dueReviewStates,
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 0 },
      now: NOW,
      newDailyLimit: 20,
      reviewDailyLimit: 1,
    });
    expect(queue.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to see the new/changed cases fail against the old implementation**

Run: `npx vitest run tests/dailyQueue.test.js`
Expected: FAIL — `buildDailyQueue` ignores `newDailyLimit`/`reviewDailyLimit` (still uses the hard-coded constants), so the new "custom reviewDailyLimit" test fails, and possibly others depending on how the old constants compare.

- [ ] **Step 3: Update the implementation**

```javascript
// lib/dailyQueue.js
function buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now, newDailyLimit, reviewDailyLimit }) {
  const reviewSlots = Math.max(0, reviewDailyLimit - (dailyProgress.reviewed_count || 0));
  const newSlots = Math.max(0, newDailyLimit - (dailyProgress.new_learned || 0));

  const sortedDue = [...dueReviewStates].sort((a, b) => {
    if (b.failure_count !== a.failure_count) return b.failure_count - a.failure_count;
    return new Date(a.next_review_at) - new Date(b.next_review_at);
  });
  const reviewQueue = sortedDue.slice(0, reviewSlots);

  const sortedNew = [...newWordStates].sort((a, b) => a.word_id - b.word_id);
  const newQueue = sortedNew.slice(0, newSlots);

  return [...reviewQueue, ...newQueue];
}

module.exports = { buildDailyQueue };
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run tests/dailyQueue.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/dailyQueue.js tests/dailyQueue.test.js
git commit -m "feat: make buildDailyQueue accept daily limits as parameters"
```

---

## Task 3: `api/settings/index.js` — GET/PUT endpoint

**Files:**
- Create: `api/settings/index.js`

**Interfaces:**
- Consumes: `requireUser(req, res)` from `lib/auth.js`, `getSupabaseClient(token)` from `lib/supabaseClient.js`.
- Produces: `GET /api/settings` → `200 { new_daily_limit: number, review_daily_limit: number }` (default `{ new_daily_limit: 20, review_daily_limit: 100 }` if no row exists for the user). `PUT /api/settings` with body `{ new_daily_limit, review_daily_limit }` → `200` with the saved row, or `400 { error: string }` if either value is not a positive integer.

- [ ] **Step 1: Write the handler**

```javascript
// api/settings/index.js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({
      new_daily_limit: data?.new_daily_limit ?? 20,
      review_daily_limit: data?.review_daily_limit ?? 100,
    });
    return;
  }

  if (req.method === 'PUT') {
    const { new_daily_limit, review_daily_limit } = req.body || {};
    const isValid = (x) => Number.isInteger(x) && x > 0;
    if (!isValid(new_daily_limit) || !isValid(review_daily_limit)) {
      res.status(400).json({ error: 'new_daily_limit và review_daily_limit phải là số nguyên dương' });
      return;
    }
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ new_daily_limit, review_daily_limit })
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
```

- [ ] **Step 2: Verify with a manual smoke check (no unit test — matches the existing convention where `api/**` handlers have no dedicated unit tests, only the pure logic in `lib/` is tested)**

Run: `npx vitest run` (full suite) to confirm nothing else broke.
Expected: PASS (all existing tests, no new failures).

Run: `npm run build`
Expected: succeeds (this file isn't bundled by Vite, but confirms no accidental syntax issue affects the build tooling picking up the repo).

- [ ] **Step 3: Commit**

```bash
git add api/settings/index.js
git commit -m "feat: add GET/PUT /api/settings endpoint"
```

---

## Task 4: Wire real limits into `api/session/today.js` and `api/dashboard/index.js`

**Files:**
- Modify: `api/session/today.js`
- Modify: `api/dashboard/index.js`

**Interfaces:**
- Consumes: `user_settings` table (Task 1), `buildDailyQueue`'s new signature (Task 2).
- Produces: both endpoints now read the user's real `new_daily_limit`/`review_daily_limit` (falling back to `20`/`100` if no row) instead of hard-coded values.

- [ ] **Step 1: Update `api/session/today.js`**

Current content (for reference — only the parts shown change):
```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');

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

  const [
    { data: dailyProgress, error: dailyProgressError },
    { data: dueStates, error: dueError },
    { data: newStates, error: newError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select('*, words(*)')
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select('*, words(*)').eq('status', 'new'),
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
      hasSegments: Boolean(state.words.segments),
    }),
  }));

  res.status(200).json({ cards, total: cards.length });
};
```

(This is the full file — replace `api/session/today.js` with this content. Changes from the current file: added `settings` to the `Promise.all` array and `settingsError` to the combined error check, and pass `newDailyLimit`/`reviewDailyLimit` into `buildDailyQueue` instead of relying on removed constants.)

- [ ] **Step 2: Update `api/dashboard/index.js`**

Full file (replace `api/dashboard/index.js` with this content — changes: added `settings` query to the `Promise.all` array and its error to the combined check; `new_limit`/`review_limit` in the response now come from `settings` instead of hard-coded `20`/`100`):

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

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

  const [
    { data: progressToday, error: progressTodayError },
    { count: dueCount, error: dueCountError },
    { data: statusRows, error: statusRowsError },
    { data: recentLogs, error: recentLogsError },
    { data: allProgress, error: allProgressError },
    { data: difficultWords, error: difficultWordsError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*').eq('date', today).maybeSingle(),
    supabase
      .from('review_state')
      .select('word_id', { count: 'exact', head: true })
      .neq('status', 'new')
      .lte('next_review_at', now.toISOString()),
    supabase.from('review_state').select('status'),
    supabase.from('review_log').select('result').order('reviewed_at', { ascending: false }).limit(200),
    supabase.from('daily_progress').select('*').order('date', { ascending: false }).limit(60),
    supabase
      .from('review_state')
      .select('*, words(word, meaning)')
      .or('status.eq.difficult,failure_count.gt.0')
      .order('failure_count', { ascending: false })
      .limit(10),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  const queryError =
    progressTodayError ||
    dueCountError ||
    statusRowsError ||
    recentLogsError ||
    allProgressError ||
    difficultWordsError ||
    settingsError;
  if (queryError) {
    res.status(500).json({ error: queryError.message });
    return;
  }

  const totals = { new: 0, learning: 0, difficult: 0 };
  (statusRows || []).forEach((row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
  });

  const goodOrHard = (recentLogs || []).filter((l) => l.result === 'good' || l.result === 'hard').length;
  const accuracy = recentLogs && recentLogs.length > 0 ? goodOrHard / recentLogs.length : null;

  const byDate = new Map((allProgress || []).map((p) => [p.date, p]));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const p = byDate.get(key);
    if (p && (p.new_learned > 0 || p.reviewed_count > 0)) {
      streak += 1;
    } else {
      break;
    }
  }

  res.status(200).json({
    new_learned_today: progressToday?.new_learned || 0,
    reviewed_today: progressToday?.reviewed_count || 0,
    new_limit: settings?.new_daily_limit ?? 20,
    review_limit: settings?.review_daily_limit ?? 100,
    due_count: dueCount || 0,
    streak,
    accuracy,
    totals,
    difficult_words: difficultWords || [],
  });
};
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests; neither file has direct unit tests, this confirms nothing else broke)

- [ ] **Step 4: Commit**

```bash
git add api/session/today.js api/dashboard/index.js
git commit -m "feat: use real per-user daily limits in session queue and dashboard"
```

---

## Task 5: `src/api.js` — `getSettings`/`updateSettings`

**Files:**
- Modify: `src/api.js`

**Interfaces:**
- Consumes: existing `request()` helper (unchanged).
- Produces: `api.getSettings()` → `GET /api/settings`. `api.updateSettings(body)` → `PUT /api/settings` with `body` JSON-stringified.

- [ ] **Step 1: Add the two methods to the `api` object**

In `src/api.js`, add these two lines inside the `export const api = { ... }` object (after `getReviewsChart`, before the closing `};`):

```javascript
  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
```

The full `export const api = {...}` block should read:

```javascript
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
  importCsv: (csv) => request('/api/words/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  getDashboard: () => request('/api/dashboard'),
  getReviewsChart: (days = 7) => request(`/api/dashboard/reviews-chart?days=${days}`),
  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
};
```

- [ ] **Step 2: Verify with build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/api.js
git commit -m "feat: add getSettings/updateSettings to api client"
```

---

## Task 6: `src/screens/SettingsScreen.jsx` — editable settings

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

**Interfaces:**
- Consumes: `api.getSettings()`, `api.updateSettings(body)` from Task 5.
- Produces: same default export `SettingsScreen()`, now stateful.

- [ ] **Step 1: Replace the file content**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch((err) => setMessage({ type: 'error', text: err.message }));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateSettings(settings);
      setSettings(saved);
      setMessage({ type: 'success', text: 'Đã lưu' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Settings</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số từ mới tối đa mỗi ngày</label>
          <input
            className="input"
            type="number"
            min="1"
            value={settings ? settings.new_daily_limit : ''}
            disabled={!settings}
            onChange={(e) => setSettings({ ...settings, new_daily_limit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số lượt ôn tối đa mỗi ngày</label>
          <input
            className="input"
            type="number"
            min="1"
            value={settings ? settings.review_daily_limit : ''}
            disabled={!settings}
            onChange={(e) => setSettings({ ...settings, review_daily_limit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Giọng đọc (TTS)</label>
          <div className="seg">
            <span className="seg-opt checked">en-US</span>
            <span className="seg-opt">en-GB</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={!settings || saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: make daily limit settings editable"
```

---

## Task 7: `src/App.jsx` — Daily goal widget counts new words too

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `dailyGoal` state (already populated by `api.getDashboard()`, unchanged) — now relies on `dailyGoal.totals.new`, `dailyGoal.new_limit`, `dailyGoal.new_learned_today`, `dailyGoal.due_count`, `dailyGoal.review_limit`, `dailyGoal.reviewed_today` (all already present in the `/api/dashboard` response, see Task 4).

- [ ] **Step 1: Replace the "Daily goal" sidebar widget block**

Current block (`src/App.jsx`, inside `sidebar-footer`, right after the "Cloud sync" widget):

```jsx
          <div className="card sidebar-widget">
            <div className="sidebar-widget-title">🔥 Daily goal</div>
            <div className="sidebar-widget-text">
              {dailyGoal ? `${dailyGoal.reviewed_today} / ${dailyGoal.review_limit} reviews` : '...'}
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${dailyGoal ? Math.min(100, (dailyGoal.reviewed_today / dailyGoal.review_limit) * 100) : 0}%` }}
              />
            </div>
          </div>
```

Replace with:

```jsx
          <div className="card sidebar-widget">
            <div className="sidebar-widget-title">🔥 Daily goal</div>
            <div className="sidebar-widget-text">{renderDailyGoalText(dailyGoal)}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${dailyGoalProgress(dailyGoal)}%` }} />
            </div>
          </div>
```

- [ ] **Step 2: Add two helper functions above `export default function App()`**

Insert right after the `TABS` constant declaration, before `export default function App() {`:

```javascript
function dailyGoalStats(dailyGoal) {
  const remainingReview = Math.max(0, Math.min(dailyGoal.due_count, dailyGoal.review_limit - dailyGoal.reviewed_today));
  const remainingNew = Math.max(0, Math.min(dailyGoal.totals.new || 0, dailyGoal.new_limit - dailyGoal.new_learned_today));
  const doneToday = dailyGoal.reviewed_today + dailyGoal.new_learned_today;
  const totalToday = doneToday + remainingReview + remainingNew;
  return { remainingReview, remainingNew, doneToday, totalToday };
}

function renderDailyGoalText(dailyGoal) {
  if (!dailyGoal) return '...';
  const { remainingReview, remainingNew, doneToday, totalToday } = dailyGoalStats(dailyGoal);
  if (remainingReview + remainingNew === 0) return 'Đã hoàn thành hôm nay! 🎉';
  return `${doneToday} / ${totalToday} việc`;
}

function dailyGoalProgress(dailyGoal) {
  if (!dailyGoal) return 0;
  const { remainingReview, remainingNew, doneToday, totalToday } = dailyGoalStats(dailyGoal);
  if (remainingReview + remainingNew === 0) return 100;
  return Math.min(100, (doneToday / totalToday) * 100);
}
```

- [ ] **Step 3: Verify with build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: count new words in Daily goal widget completion"
```

---

## Task 8: `src/screens/DashboardScreen.jsx` — preview carousel browses full vocabulary

**Files:**
- Modify: `src/screens/DashboardScreen.jsx`

**Interfaces:**
- Consumes: `api.getWords(params)` (existing, from `src/api.js` — returns `{ words: [...] }` where each word is `{ id, word, meaning, category, part_of_speech, ipa, example, example_vi, segments, created_at, user_id, review_state: {...} }`).
- Produces: `previewCards` state now holds `{ word, review_state }` objects sourced from the full vocabulary, sorted by `sortForPreview` (defined in this file).

- [ ] **Step 1: Replace the `api.getToday()` call with `api.getWords({})` + sorting**

Current (`src/screens/DashboardScreen.jsx` lines 15-18):
```javascript
  useEffect(() => {
    api.getDashboard().then(setSummary).catch((err) => setError(err.message));
    api.getToday().then((data) => setPreviewCards(data.cards)).catch((err) => setError(err.message));
  }, []);
```

Replace with:
```javascript
  useEffect(() => {
    api.getDashboard().then(setSummary).catch((err) => setError(err.message));
    api.getWords({}).then((data) => {
      const cards = sortForPreview(data.words).map((w) => ({ word: w, review_state: w.review_state }));
      setPreviewCards(cards);
    }).catch((err) => setError(err.message));
  }, []);
```

- [ ] **Step 2: Add the `sortForPreview` function**

Insert above `export default function DashboardScreen(...)`, after the `STATUS_TAG_CLASS` constant:

```javascript
function sortForPreview(words) {
  const now = Date.now();
  return [...words].sort((a, b) => {
    const as = a.review_state;
    const bs = b.review_state;
    const aDue = as.status !== 'new' && new Date(as.next_review_at).getTime() <= now;
    const bDue = bs.status !== 'new' && new Date(bs.next_review_at).getTime() <= now;
    if (aDue !== bDue) return aDue ? -1 : 1;
    if (aDue && bDue) {
      if (bs.failure_count !== as.failure_count) return bs.failure_count - as.failure_count;
      return new Date(as.next_review_at) - new Date(bs.next_review_at);
    }
    const aNew = as.status === 'new';
    const bNew = bs.status === 'new';
    if (aNew !== bNew) return aNew ? -1 : 1;
    if (aNew && bNew) return a.id - b.id;
    return new Date(as.next_review_at) - new Date(bs.next_review_at);
  });
}
```

- [ ] **Step 3: Verify with build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Verify the rest of the file's carousel JSX still compiles against the new data shape**

The render code (`previewCard.word.word`, `previewCard.word.ipa`, `previewCard.word.meaning`, `previewCard.word.segments`, `previewCard.word.example`, `previewCard.word.example_vi`, `previewCard.review_state.status`) is unchanged — `w` from `api.getWords()` has all these fields directly (confirmed by reading the current `api/words/index.js` GET handler, which does `select('*, review_state!inner(*)')`), and `w.review_state` has `status`. No JSX edits needed in this step; this step is just confirming that claim by reading the file after Step 1/2 changes and checking no reference to a field this shape doesn't have.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DashboardScreen.jsx
git commit -m "feat: dashboard preview carousel browses full vocabulary, due/difficult first"
```

---

## Task 9: End-to-end verify (manual)

**Files:** none — verification only.

- [ ] **Step 1: Run full automated suite**

```bash
npx vitest run
```
Expected: PASS (all tests, including the updated `tests/dailyQueue.test.js`).

- [ ] **Step 2: Run build**

```bash
npm run build
```
Expected: succeeds.

- [ ] **Step 3: Manual check — Settings persists and affects scheduling**

Run `vercel dev` (plain `vite` doesn't execute `api/**`, per prior session notes), sign in, go to Settings, change "Số từ mới tối đa mỗi ngày" to a small number (e.g. `2`) and save, confirm the "Đã lưu" message appears. Reload the page, go back to Settings — confirm the value persisted (came from `GET /api/settings`, not a stale default). Go to tab Learn — confirm the number of new words offered per session respects the new limit.

- [ ] **Step 4: Manual check — Daily goal widget**

On the Dashboard/sidebar, confirm the "🔥 Daily goal" widget shows `X / Y việc` where `Y` accounts for both due reviews and remaining new words (not just reviews). Study until both are exhausted for the day — confirm the widget switches to "Đã hoàn thành hôm nay! 🎉" and the bar reaches 100%.

- [ ] **Step 5: Manual check — Dashboard preview carousel**

On Dashboard, confirm the "Next" carousel card cycles through the *entire* vocabulary (word count matches the total in Vocabulary tab, not just today's due/new queue), and that a difficult word with a high forgotten-count and a past due date appears before a `new`-status word.
