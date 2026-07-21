# Anki Vocab App (Vercel + Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user English vocabulary spaced-repetition web app (Study / Vocabulary+Import / Dashboard) deployed on Vercel with Supabase (Postgres) as the database.

**Architecture:** React + Vite SPA served as a Vercel static build; backend logic lives in Vercel Serverless Functions under `/api/*` (Node.js runtime, CommonJS). All DB access goes through `@supabase/supabase-js` using a service-role key that only ever runs server-side inside `/api` functions — the browser never talks to Supabase directly. Pure scheduling/selection logic is isolated in `lib/*.js` modules with no I/O so it can be unit-tested without a database.

**Tech Stack:** React 18, Vite 5, Vitest (unit tests), `@supabase/supabase-js`, Vercel CLI (`vercel dev` / `vercel deploy`), plain CSS (no UI framework), no auth, no TypeScript.

## Global Constraints

- No authentication/login anywhere — single-user personal app (per spec).
- Backend code is CommonJS (`module.exports` / `require`) inside `lib/` and `api/`; frontend code under `src/` uses ES modules (`import`/`export`) — Vite handles this without needing `"type": "module"` in `package.json`.
- All Supabase access happens only inside `/api/*.js` functions via the service-role key (env var `SUPABASE_SERVICE_ROLE_KEY`, plus `SUPABASE_URL`). Never expose the service-role key to the frontend bundle.
- Daily limits: max 100 reviews/day, max 20 new words/day (from spec section 5) — hard-coded constants, not user-configurable in v1.
- Fixed schedule steps: `[0, 10min, 1d, 3d, 7d, 14d, 30d, 60d]` for new/learning words; `[10min, 1d, 3d]` for difficult words (spec section 4).
- CSV import columns: `word, meaning, category, part_of_speech, ipa, example, example_vi, segments`; `word` and `meaning` are required, other columns optional.
- Testing: Vitest for all pure-logic modules (`lib/*.js`). No E2E/UI automation required for v1.

---

## File Structure

```
package.json
vercel.json
vitest.config.js
supabase/migrations/0001_init.sql
lib/
  supabaseClient.js
  scheduler.js
  exerciseType.js
  dailyQueue.js
  csv.js
api/
  session/today.js
  reviews/[wordId].js
  words/index.js
  words/[id].js
  words/import.js
  dashboard/index.js
  dashboard/reviews-chart.js
tests/
  scheduler.test.js
  exerciseType.test.js
  dailyQueue.test.js
  csv.test.js
src/
  main.jsx
  App.jsx
  api.js
  screens/StudyScreen.jsx
  screens/VocabularyScreen.jsx
  screens/DashboardScreen.jsx
  styles.css
index.html
```

- `lib/` = pure logic + Supabase client factory, importable from `api/` and `tests/`.
- `api/` = one file per Vercel serverless route (file path = URL path, `[param].js` = dynamic segment).
- `src/` = Vite React frontend, three screens behind a simple tab switcher (no router needed for 3 screens — YAGNI).

---

### Task 1: Project scaffold (Vite + Vercel + Vitest)

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Create: `vitest.config.js`
- Create: `index.html`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `.gitignore` (append, keep existing content)

**Interfaces:**
- Produces: npm scripts `dev` (`vercel dev`), `build` (`vite build`), `test` (`vitest run`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "anki-vocab-app",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "vercel dev",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "functions": {
    "api/**/*.js": {
      "runtime": "nodejs20.x"
    }
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Anki Vocab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Create `src/App.jsx` (placeholder shell, filled in Task 13)**

```jsx
import React from 'react';

export default function App() {
  return <div>Anki Vocab App</div>;
}
```

- [ ] **Step 7: Add `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 8: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: `dist/` produced, no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json vercel.json vitest.config.js vite.config.js index.html src/main.jsx src/App.jsx
git commit -m "chore: scaffold Vite + Vercel + Vitest project"
```

---

### Task 2: Supabase schema + client

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `lib/supabaseClient.js`
- Create: `.env.example`

**Interfaces:**
- Produces: `getSupabaseClient()` returning a singleton `@supabase/supabase-js` client, used by every `api/*.js` file.

- [ ] **Step 1: Create `supabase/migrations/0001_init.sql`**

```sql
create table words (
  id bigint generated always as identity primary key,
  word text not null,
  meaning text not null,
  category text,
  part_of_speech text,
  ipa text,
  example text,
  example_vi text,
  segments text,
  created_at timestamptz not null default now()
);

create table review_state (
  word_id bigint primary key references words(id) on delete cascade,
  status text not null default 'new',
  step_index integer not null default 0,
  interval_days numeric not null default 0,
  correct_count integer not null default 0,
  failure_count integer not null default 0,
  last_review_at timestamptz,
  next_review_at timestamptz not null default now(),
  difficult_stage integer
);

create table review_log (
  id bigint generated always as identity primary key,
  word_id bigint not null references words(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  result text not null,
  exercise_type text not null
);

create table daily_progress (
  date date primary key,
  new_learned integer not null default 0,
  reviewed_count integer not null default 0
);

create index review_state_next_review_at_idx on review_state (next_review_at);
create index review_log_word_id_idx on review_log (word_id);
```

- [ ] **Step 2: Create `lib/supabaseClient.js`**

```js
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
```

- [ ] **Step 3: Create `.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 4: Apply migration to a Supabase project**

Run (in Supabase SQL editor, or `supabase db push` if using Supabase CLI linked to the project): paste contents of `supabase/migrations/0001_init.sql`.
Expected: 4 tables (`words`, `review_state`, `review_log`, `daily_progress`) exist with no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql lib/supabaseClient.js .env.example
git commit -m "feat: add Supabase schema and client singleton"
```

---

### Task 3: Scheduler algorithm (`lib/scheduler.js`)

**Files:**
- Create: `lib/scheduler.js`
- Test: `tests/scheduler.test.js`

**Interfaces:**
- Produces: `applyReview({ reviewState, result, now }) -> nextReviewState`, where `reviewState` has shape `{ status, step_index, interval_days, correct_count, failure_count, last_review_at, next_review_at, difficult_stage }`, `result` is one of `'again' | 'hard' | 'good'`, `now` is a `Date`. Returns a new object with the same shape (all fields, including unmodified ones like `word_id` if present — implementation must spread input first).
- Also exports `FIXED_STEPS_MINUTES` and `DIFFICULT_STEPS_MINUTES` arrays for reuse/testing.

- [ ] **Step 1: Write failing tests**

```js
// tests/scheduler.test.js
const { describe, it, expect } = require('vitest');
const { applyReview } = require('../lib/scheduler');

function baseState(overrides = {}) {
  return {
    status: 'new',
    step_index: 0,
    interval_days: 0,
    correct_count: 0,
    failure_count: 0,
    last_review_at: null,
    next_review_at: '2026-07-21T00:00:00.000Z',
    difficult_stage: null,
    ...overrides,
  };
}

const NOW = new Date('2026-07-21T00:00:00.000Z');

describe('applyReview - fixed step phase', () => {
  it('advances step_index and schedules the next fixed step on correct answer', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 0 }), result: 'good', now: NOW });
    expect(next.step_index).toBe(1);
    expect(next.status).toBe('learning');
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('resets to step_index 1 and marks 10-minute retry on Again', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 4, failure_count: 0 }), result: 'again', now: NOW });
    expect(next.step_index).toBe(1);
    expect(next.correct_count).toBe(0);
    expect(next.failure_count).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('marks status difficult after 3 failures', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 3, failure_count: 2 }), result: 'again', now: NOW });
    expect(next.status).toBe('difficult');
    expect(next.difficult_stage).toBe(0);
  });

  it('enters interval mode with interval_days=60 after passing step 7', () => {
    const next = applyReview({ reviewState: baseState({ step_index: 7, status: 'learning' }), result: 'good', now: NOW });
    expect(next.status).toBe('learning');
    expect(next.interval_days).toBe(60);
    expect(next.step_index).toBe(8);
  });
});

describe('applyReview - stabilized interval phase', () => {
  const stable = baseState({ status: 'learning', step_index: 8, interval_days: 10 });

  it('multiplies interval by 2 on good', () => {
    const next = applyReview({ reviewState: stable, result: 'good', now: NOW });
    expect(next.interval_days).toBe(20);
  });

  it('multiplies interval by 1.2 on hard', () => {
    const next = applyReview({ reviewState: stable, result: 'hard', now: NOW });
    expect(next.interval_days).toBeCloseTo(12, 5);
  });

  it('resets interval_days to 1 and schedules 10min retry on again', () => {
    const next = applyReview({ reviewState: stable, result: 'again', now: NOW });
    expect(next.interval_days).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60000).toISOString());
  });

  it('marks difficult after 3rd failure', () => {
    const next = applyReview({ reviewState: baseState({ status: 'learning', step_index: 8, interval_days: 5, failure_count: 2 }), result: 'again', now: NOW });
    expect(next.status).toBe('difficult');
    expect(next.difficult_stage).toBe(0);
  });
});

describe('applyReview - difficult phase', () => {
  const difficult = baseState({ status: 'difficult', difficult_stage: 0, failure_count: 3 });

  it('advances difficult_stage on correct answer', () => {
    const next = applyReview({ reviewState: difficult, result: 'good', now: NOW });
    expect(next.difficult_stage).toBe(1);
    expect(next.next_review_at).toBe(new Date(NOW.getTime() + 24 * 60 * 60000).toISOString());
  });

  it('graduates to learning with interval_days=7 after stage 2 passed', () => {
    const next = applyReview({ reviewState: baseState({ status: 'difficult', difficult_stage: 2, failure_count: 3 }), result: 'good', now: NOW });
    expect(next.status).toBe('learning');
    expect(next.interval_days).toBe(7);
    expect(next.difficult_stage).toBe(null);
  });

  it('resets difficult_stage to 0 on again', () => {
    const next = applyReview({ reviewState: baseState({ status: 'difficult', difficult_stage: 1, failure_count: 3 }), result: 'again', now: NOW });
    expect(next.difficult_stage).toBe(0);
    expect(next.failure_count).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scheduler.test.js`
Expected: FAIL — `Cannot find module '../lib/scheduler'`

- [ ] **Step 3: Implement `lib/scheduler.js`**

```js
const FIXED_STEPS_MINUTES = [0, 10, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 14 * 24 * 60, 30 * 24 * 60, 60 * 24 * 60];
const DIFFICULT_STEPS_MINUTES = [10, 24 * 60, 3 * 24 * 60];

function addMinutesIso(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function applyReview({ reviewState, result, now }) {
  const state = { ...reviewState, last_review_at: now.toISOString() };

  if (state.status === 'difficult') {
    if (result === 'again') {
      state.difficult_stage = 0;
      state.next_review_at = addMinutesIso(now, 10);
      state.failure_count += 1;
      state.correct_count = 0;
      return state;
    }
    const nextStage = state.difficult_stage + 1;
    if (nextStage > 2) {
      state.status = 'learning';
      state.interval_days = 7;
      state.difficult_stage = null;
      state.correct_count = 0;
      state.next_review_at = addMinutesIso(now, 7 * 24 * 60);
    } else {
      state.difficult_stage = nextStage;
      state.next_review_at = addMinutesIso(now, DIFFICULT_STEPS_MINUTES[nextStage]);
    }
    return state;
  }

  const inFixedPhase = state.status === 'new' || state.step_index < 8;
  if (inFixedPhase) {
    if (result === 'again') {
      state.step_index = 1;
      state.next_review_at = addMinutesIso(now, 10);
      state.failure_count += 1;
      state.correct_count = 0;
      state.status = state.failure_count >= 3 ? 'difficult' : 'learning';
      state.difficult_stage = state.failure_count >= 3 ? 0 : state.difficult_stage;
      return state;
    }
    const nextStep = state.step_index + 1;
    state.correct_count += 1;
    if (nextStep > 7) {
      state.status = 'learning';
      state.interval_days = 60;
      state.step_index = 8;
      state.next_review_at = addMinutesIso(now, 60 * 24 * 60);
    } else {
      state.status = 'learning';
      state.step_index = nextStep;
      state.next_review_at = addMinutesIso(now, FIXED_STEPS_MINUTES[nextStep]);
    }
    return state;
  }

  if (result === 'again') {
    state.next_review_at = addMinutesIso(now, 10);
    state.interval_days = 1;
    state.failure_count += 1;
    state.correct_count = 0;
    if (state.failure_count >= 3) {
      state.status = 'difficult';
      state.difficult_stage = 0;
    }
    return state;
  }

  const multiplier = result === 'hard' ? 1.2 : 2;
  state.interval_days = state.interval_days * multiplier;
  state.correct_count += 1;
  state.next_review_at = addMinutesIso(now, state.interval_days * 24 * 60);
  return state;
}

module.exports = { applyReview, FIXED_STEPS_MINUTES, DIFFICULT_STEPS_MINUTES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scheduler.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scheduler.js tests/scheduler.test.js
git commit -m "feat: implement spaced-repetition scheduler with tests"
```

---

### Task 4: Exercise type selection (`lib/exerciseType.js`)

**Files:**
- Create: `lib/exerciseType.js`
- Test: `tests/exerciseType.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `pickExerciseType({ status, correct_count, hasSegments }) -> 'mc_en_vi' | 'mc_vi_en' | 'segment' | 'full_type'`, used by Task 7 (`api/session/today.js`).

- [ ] **Step 1: Write failing tests**

```js
// tests/exerciseType.test.js
const { describe, it, expect } = require('vitest');
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasSegments: true })).toBe('full_type');
  });

  it('returns mc_en_vi at correct_count 0', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 0, hasSegments: false })).toBe('mc_en_vi');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasSegments: false })).toBe('mc_vi_en');
  });

  it('returns segment at correct_count >= 2 when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: true })).toBe('segment');
  });

  it('returns full_type at correct_count >= 2 when no segments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 5, hasSegments: false })).toBe('full_type');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/exerciseType.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/exerciseType.js`**

```js
function pickExerciseType({ status, correct_count, hasSegments }) {
  if (status === 'difficult') return 'full_type';
  if (correct_count === 0) return 'mc_en_vi';
  if (correct_count === 1) return 'mc_vi_en';
  return hasSegments ? 'segment' : 'full_type';
}

module.exports = { pickExerciseType };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/exerciseType.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/exerciseType.js tests/exerciseType.test.js
git commit -m "feat: implement exercise type selection with tests"
```

---

### Task 5: Daily queue builder (`lib/dailyQueue.js`)

**Files:**
- Create: `lib/dailyQueue.js`
- Test: `tests/dailyQueue.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now }) -> Array<reviewState>` (review states first, then new words), used by Task 7.

- [ ] **Step 1: Write failing tests**

```js
// tests/dailyQueue.test.js
const { describe, it, expect } = require('vitest');
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
    });
    expect(queue.map((s) => s.word_id)).toEqual([3, 2, 1]);
  });

  it('caps review count at 100 minus reviewed_count today', () => {
    const dueReviewStates = Array.from({ length: 5 }, (_, i) => due(i + 1, 0, '2026-07-20T00:00:00.000Z'));
    const queue = buildDailyQueue({
      dueReviewStates,
      newWordStates: [],
      dailyProgress: { new_learned: 0, reviewed_count: 98 },
      now: NOW,
    });
    expect(queue.length).toBe(2);
  });

  it('caps new words at 20 minus new_learned today, ordered by word_id', () => {
    const newWordStates = [fresh(3), fresh(1), fresh(2)];
    const queue = buildDailyQueue({
      dueReviewStates: [],
      newWordStates,
      dailyProgress: { new_learned: 19, reviewed_count: 0 },
      now: NOW,
    });
    expect(queue.map((s) => s.word_id)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dailyQueue.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/dailyQueue.js`**

```js
const REVIEW_DAILY_LIMIT = 100;
const NEW_DAILY_LIMIT = 20;

function buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now }) {
  const reviewSlots = Math.max(0, REVIEW_DAILY_LIMIT - (dailyProgress.reviewed_count || 0));
  const newSlots = Math.max(0, NEW_DAILY_LIMIT - (dailyProgress.new_learned || 0));

  const sortedDue = [...dueReviewStates].sort((a, b) => {
    if (b.failure_count !== a.failure_count) return b.failure_count - a.failure_count;
    return new Date(a.next_review_at) - new Date(b.next_review_at);
  });
  const reviewQueue = sortedDue.slice(0, reviewSlots);

  const sortedNew = [...newWordStates].sort((a, b) => a.word_id - b.word_id);
  const newQueue = sortedNew.slice(0, newSlots);

  return [...reviewQueue, ...newQueue];
}

module.exports = { buildDailyQueue, REVIEW_DAILY_LIMIT, NEW_DAILY_LIMIT };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dailyQueue.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/dailyQueue.js tests/dailyQueue.test.js
git commit -m "feat: implement daily study queue builder with tests"
```

---

### Task 6: CSV import parser (`lib/csv.js`)

**Files:**
- Create: `lib/csv.js`
- Test: `tests/csv.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `parseWordsCsv(text) -> { rows: Array<{word, meaning, category, part_of_speech, ipa, example, example_vi, segments}>, errors: Array<{line, reason}> }`, used by Task 10 (`api/words/import.js`).

- [ ] **Step 1: Write failing tests**

```js
// tests/csv.test.js
const { describe, it, expect } = require('vitest');
const { parseWordsCsv } = require('../lib/csv');

describe('parseWordsCsv', () => {
  it('parses valid rows with all columns', () => {
    const csv = 'word,meaning,category,part_of_speech,ipa,example,example_vi,segments\nbeautiful,đẹp,adjectives,adj,/bjuːtɪfəl/,It is beautiful.,Nó đẹp.,beauty|ful';
    const { rows, errors } = parseWordsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        word: 'beautiful',
        meaning: 'đẹp',
        category: 'adjectives',
        part_of_speech: 'adj',
        ipa: '/bjuːtɪfəl/',
        example: 'It is beautiful.',
        example_vi: 'Nó đẹp.',
        segments: 'beauty|ful',
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
      segments: null,
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/csv.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/csv.js`**

```js
const REQUIRED_HEADERS = ['word', 'meaning'];
const OPTIONAL_HEADERS = ['category', 'part_of_speech', 'ipa', 'example', 'example_vi', 'segments'];

function parseWordsCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: [] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/csv.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/csv.js tests/csv.test.js
git commit -m "feat: implement CSV import parser with tests"
```

---

### Task 7: API — `GET /api/session/today`

**Files:**
- Create: `api/session/today.js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2), `buildDailyQueue()` (Task 5), `pickExerciseType()` (Task 4).
- Produces: `GET /api/session/today -> { cards: Array<{ word, review_state, exercise_type }>, total }`, consumed by Task 14 (Study screen frontend).

- [ ] **Step 1: Implement `api/session/today.js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: dailyProgress } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  const { data: dueStates, error: dueError } = await supabase
    .from('review_state')
    .select('*, words(*)')
    .neq('status', 'new')
    .lte('next_review_at', now.toISOString());
  if (dueError) {
    res.status(500).json({ error: dueError.message });
    return;
  }

  const { data: newStates, error: newError } = await supabase
    .from('review_state')
    .select('*, words(*)')
    .eq('status', 'new');
  if (newError) {
    res.status(500).json({ error: newError.message });
    return;
  }

  const queue = buildDailyQueue({
    dueReviewStates: dueStates,
    newWordStates: newStates,
    dailyProgress: dailyProgress || { new_learned: 0, reviewed_count: 0 },
    now,
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

- [ ] **Step 2: Manual verification against a Supabase project**

Run: `vercel dev`, then `curl http://localhost:3000/api/session/today`
Expected: JSON `{ "cards": [...], "total": N }`, HTTP 200 (empty `cards` array is fine before any words exist).

- [ ] **Step 3: Commit**

```bash
git add api/session/today.js
git commit -m "feat: add GET /api/session/today endpoint"
```

---

### Task 8: API — `POST /api/reviews/[wordId]`

**Files:**
- Create: `api/reviews/[wordId].js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2), `applyReview()` (Task 3).
- Produces: `POST /api/reviews/:wordId` body `{ exercise_type, result }` → `{ review_state }`, consumed by Task 14.

- [ ] **Step 1: Implement `api/reviews/[wordId].js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { applyReview } = require('../../lib/scheduler');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const wordId = req.query.wordId;
  const { exercise_type, result } = req.body || {};
  if (!exercise_type || !result) {
    res.status(400).json({ error: 'Thiếu exercise_type hoặc result' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();

  const { data: reviewState, error: fetchError } = await supabase
    .from('review_state')
    .select('*')
    .eq('word_id', wordId)
    .single();
  if (fetchError || !reviewState) {
    res.status(404).json({ error: 'Không tìm thấy review_state' });
    return;
  }

  const wasNew = reviewState.status === 'new';
  const nextState = applyReview({ reviewState, result, now });

  const { error: updateError } = await supabase
    .from('review_state')
    .update(nextState)
    .eq('word_id', wordId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  await supabase.from('review_log').insert({
    word_id: wordId,
    reviewed_at: now.toISOString(),
    result,
    exercise_type,
  });

  const today = now.toISOString().slice(0, 10);
  const { data: progress } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  await supabase.from('daily_progress').upsert({
    date: today,
    new_learned: (progress?.new_learned || 0) + (wasNew ? 1 : 0),
    reviewed_count: (progress?.reviewed_count || 0) + (wasNew ? 0 : 1),
  });

  res.status(200).json({ review_state: nextState });
};
```

- [ ] **Step 2: Manual verification**

Run: `vercel dev`, then (after Task 9 lets you create a word) `curl -X POST http://localhost:3000/api/reviews/1 -H "Content-Type: application/json" -d '{"exercise_type":"mc_en_vi","result":"good"}'`
Expected: `{ "review_state": { ...updated fields... } }`, HTTP 200.

- [ ] **Step 3: Commit**

```bash
git add api/reviews/\[wordId\].js
git commit -m "feat: add POST /api/reviews/:wordId endpoint"
```

---

### Task 9: API — Words CRUD (`/api/words`, `/api/words/[id]`)

**Files:**
- Create: `api/words/index.js`
- Create: `api/words/[id].js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2).
- Produces: `GET /api/words?status=&q=`, `POST /api/words`, `PUT /api/words/:id`, `DELETE /api/words/:id`, consumed by Task 15 (Vocabulary screen).

- [ ] **Step 1: Implement `api/words/index.js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  const supabase = getSupabaseClient();

  if (req.method === 'GET') {
    let query = supabase.from('words').select('*, review_state(*)');
    if (req.query.status) {
      query = query.eq('review_state.status', req.query.status);
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
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, segments } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('words')
      .insert({ word, meaning, category, part_of_speech, ipa, example, example_vi, segments })
      .select()
      .single();
    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }
    await supabase.from('review_state').insert({
      word_id: inserted.id,
      status: 'new',
      step_index: 0,
      interval_days: 0,
      correct_count: 0,
      failure_count: 0,
      next_review_at: now,
    });
    res.status(201).json({ word: inserted });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
```

- [ ] **Step 2: Implement `api/words/[id].js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  const supabase = getSupabaseClient();
  const id = req.query.id;

  if (req.method === 'PUT') {
    const { word, meaning, category, part_of_speech, ipa, example, example_vi, segments } = req.body || {};
    if (!word || !meaning) {
      res.status(400).json({ error: 'Thiếu word hoặc meaning' });
      return;
    }
    const { data, error } = await supabase
      .from('words')
      .update({ word, meaning, category, part_of_speech, ipa, example, example_vi, segments })
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

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, then:
```bash
curl -X POST http://localhost:3000/api/words -H "Content-Type: application/json" -d '{"word":"beautiful","meaning":"đẹp"}'
curl http://localhost:3000/api/words
curl -X PUT http://localhost:3000/api/words/1 -H "Content-Type: application/json" -d '{"word":"beautiful","meaning":"xinh đẹp"}'
curl -X DELETE http://localhost:3000/api/words/1
```
Expected: create returns 201 with `word.id`, list returns the word with nested `review_state`, update returns 200 with new `meaning`, delete returns 204.

- [ ] **Step 4: Commit**

```bash
git add api/words/index.js api/words/\[id\].js
git commit -m "feat: add words CRUD endpoints"
```

---

### Task 10: API — `POST /api/words/import`

**Files:**
- Create: `api/words/import.js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2), `parseWordsCsv()` (Task 6).
- Produces: `POST /api/words/import` body `{ csv: string }` → `{ imported, errors }`, consumed by Task 15.

- [ ] **Step 1: Implement `api/words/import.js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { parseWordsCsv } = require('../../lib/csv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase.from('words').insert(rows).select();
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
  await supabase.from('review_state').insert(reviewStates);

  res.status(200).json({ imported: inserted.length, errors });
};
```

- [ ] **Step 2: Manual verification**

Run: `vercel dev`, then `curl -X POST http://localhost:3000/api/words/import -H "Content-Type: application/json" -d '{"csv":"word,meaning\nhi,chào\n,thiếu"}'`
Expected: `{ "imported": 1, "errors": [{ "line": 3, "reason": "Thiếu field: word" }] }`

- [ ] **Step 3: Commit**

```bash
git add api/words/import.js
git commit -m "feat: add POST /api/words/import endpoint"
```

---

### Task 11: API — `GET /api/dashboard`

**Files:**
- Create: `api/dashboard/index.js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2).
- Produces: `GET /api/dashboard -> { new_learned_today, reviewed_today, new_limit, review_limit, due_count, streak, accuracy, totals, difficult_words }`, consumed by Task 16.

- [ ] **Step 1: Implement `api/dashboard/index.js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getSupabaseClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: progressToday } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  const { count: dueCount } = await supabase
    .from('review_state')
    .select('word_id', { count: 'exact', head: true })
    .neq('status', 'new')
    .lte('next_review_at', now.toISOString());

  const { data: statusRows } = await supabase.from('review_state').select('status');
  const totals = { new: 0, learning: 0, difficult: 0 };
  (statusRows || []).forEach((row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
  });

  const { data: recentLogs } = await supabase
    .from('review_log')
    .select('result')
    .order('reviewed_at', { ascending: false })
    .limit(200);
  const goodOrHard = (recentLogs || []).filter((l) => l.result === 'good' || l.result === 'hard').length;
  const accuracy = recentLogs && recentLogs.length > 0 ? goodOrHard / recentLogs.length : null;

  const { data: allProgress } = await supabase
    .from('daily_progress')
    .select('*')
    .order('date', { ascending: false })
    .limit(60);
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

  const { data: difficultWords } = await supabase
    .from('review_state')
    .select('*, words(word, meaning)')
    .or('status.eq.difficult,failure_count.gt.0')
    .order('failure_count', { ascending: false })
    .limit(10);

  res.status(200).json({
    new_learned_today: progressToday?.new_learned || 0,
    reviewed_today: progressToday?.reviewed_count || 0,
    new_limit: 20,
    review_limit: 100,
    due_count: dueCount || 0,
    streak,
    accuracy,
    totals,
    difficult_words: difficultWords || [],
  });
};
```

- [ ] **Step 2: Manual verification**

Run: `vercel dev`, then `curl http://localhost:3000/api/dashboard`
Expected: HTTP 200 with all fields present (zeros/nulls fine on an empty DB).

- [ ] **Step 3: Commit**

```bash
git add api/dashboard/index.js
git commit -m "feat: add GET /api/dashboard endpoint"
```

---

### Task 12: API — `GET /api/dashboard/reviews-chart`

**Files:**
- Create: `api/dashboard/reviews-chart.js`

**Interfaces:**
- Consumes: `getSupabaseClient()` (Task 2).
- Produces: `GET /api/dashboard/reviews-chart?days=7 -> { days: Array<{ date, new_learned, reviewed_count }> }`, consumed by Task 16.

- [ ] **Step 1: Implement `api/dashboard/reviews-chart.js`**

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const days = Number(req.query.days) || 7;
  const supabase = getSupabaseClient();
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('daily_progress')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: true });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const byDate = new Map((data || []).map((row) => [row.date, row]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    result.push({ date: key, new_learned: row?.new_learned || 0, reviewed_count: row?.reviewed_count || 0 });
  }

  res.status(200).json({ days: result });
};
```

- [ ] **Step 2: Manual verification**

Run: `vercel dev`, then `curl "http://localhost:3000/api/dashboard/reviews-chart?days=7"`
Expected: `{ "days": [ {date, new_learned, reviewed_count} x 7 ] }`, dates in ascending order ending today.

- [ ] **Step 3: Commit**

```bash
git add api/dashboard/reviews-chart.js
git commit -m "feat: add GET /api/dashboard/reviews-chart endpoint"
```

---

### Task 13: Frontend shell — API client, sidebar, tab routing

**Files:**
- Create: `src/api.js`
- Modify: `src/App.jsx` (replace placeholder from Task 1)
- Create: `src/styles.css`

**Interfaces:**
- Produces: `api.getToday()`, `api.postReview(wordId, body)`, `api.getWords(params)`, `api.createWord(body)`, `api.updateWord(id, body)`, `api.deleteWord(id)`, `api.importCsv(csvText)`, `api.getDashboard()`, `api.getReviewsChart(days)` — all return parsed JSON or throw on non-2xx. Consumed by Tasks 14–16.
- `App.jsx` renders a sidebar with 3 tabs (`Study`, `Vocabulary`, `Dashboard`) and switches screens via `useState`, no router library (YAGNI for 3 screens).

- [ ] **Step 1: Create `src/api.js`**

```js
async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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
  importCsv: (csv) => request('/api/words/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  getDashboard: () => request('/api/dashboard'),
  getReviewsChart: (days = 7) => request(`/api/dashboard/reviews-chart?days=${days}`),
};
```

- [ ] **Step 2: Create `src/styles.css`**

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #f7f7f8;
}

.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 180px;
  background: #1f2937;
  color: white;
  padding: 16px 0;
}

.sidebar button {
  display: block;
  width: 100%;
  padding: 12px 20px;
  background: none;
  border: none;
  color: #d1d5db;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}

.sidebar button.active {
  background: #374151;
  color: white;
}

.content {
  flex: 1;
  padding: 24px;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

input, button {
  font-size: 14px;
}
```

- [ ] **Step 3: Replace `src/App.jsx`**

```jsx
import React, { useState } from 'react';
import StudyScreen from './screens/StudyScreen.jsx';
import VocabularyScreen from './screens/VocabularyScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';

const TABS = [
  { key: 'study', label: 'Study', component: StudyScreen },
  { key: 'vocabulary', label: 'Vocabulary', component: VocabularyScreen },
  { key: 'dashboard', label: 'Dashboard', component: DashboardScreen },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const Active = TABS.find((t) => t.key === activeTab).component;

  return (
    <div className="layout">
      <nav className="sidebar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={tab.key === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <Active />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder screens (filled in Tasks 14–16)**

```jsx
// src/screens/StudyScreen.jsx
import React from 'react';
export default function StudyScreen() {
  return <div>Study (coming in Task 14)</div>;
}
```

```jsx
// src/screens/VocabularyScreen.jsx
import React from 'react';
export default function VocabularyScreen() {
  return <div>Vocabulary (coming in Task 15)</div>;
}
```

```jsx
// src/screens/DashboardScreen.jsx
import React from 'react';
export default function DashboardScreen() {
  return <div>Dashboard (coming in Task 16)</div>;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: builds successfully, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/api.js src/styles.css src/App.jsx src/screens
git commit -m "feat: add frontend shell with API client and tab navigation"
```

---

### Task 14: Frontend — Study screen

**Files:**
- Modify: `src/screens/StudyScreen.jsx`

**Interfaces:**
- Consumes: `api.getToday()`, `api.postReview()` (Task 13).
- Produces: full flashcard flow for `mc_en_vi`, `mc_vi_en`, `segment`, `full_type` exercise types, self-graded per spec section 8.

- [ ] **Step 1: Implement `src/screens/StudyScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

function buildMcOptions(correctWord, allCards, byField) {
  const others = allCards
    .map((c) => c.word)
    .filter((w) => w.id !== correctWord.id);
  const sameCategory = others.filter((w) => w.category === correctWord.category);
  const pool = sameCategory.length >= 3 ? sameCategory : others;
  const distractors = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...distractors, correctWord].sort(() => Math.random() - 0.5);
  return options.map((w) => ({ id: w.id, label: byField(w) }));
}

export default function StudyScreen() {
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [wasCorrectFirstTry, setWasCorrectFirstTry] = useState(true);
  const [mistakeMade, setMistakeMade] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [inputError, setInputError] = useState(false);

  useEffect(() => {
    api.getToday().then((data) => setCards(data.cards));
  }, []);

  if (cards === null) return <div>Đang tải...</div>;
  if (cards.length === 0) return <div>Không có thẻ nào cần học hôm nay 🎉</div>;
  if (index >= cards.length) return <div>Đã hoàn thành hàng đợi hôm nay 🎉</div>;

  const card = cards[index];
  const { word, exercise_type } = card;
  const segments = word.segments ? word.segments.split('|') : [];

  function goNext(result) {
    api.postReview(word.id, { exercise_type, result }).finally(() => {
      setAnswered(false);
      setMistakeMade(false);
      setSegmentIndex(0);
      setTextInput('');
      setInputError(false);
      setIndex((i) => i + 1);
    });
  }

  function handleMcChoice(choiceId) {
    if (answered) return;
    const correct = choiceId === word.id;
    setAnswered(true);
    setWasCorrectFirstTry(correct);
    if (!correct) goNext('again');
  }

  function handleSegmentSubmit(e) {
    e.preventDefault();
    const expected = segments[segmentIndex];
    if (textInput.trim().toLowerCase() === expected.toLowerCase()) {
      setInputError(false);
      if (segmentIndex + 1 < segments.length) {
        setSegmentIndex((s) => s + 1);
        setTextInput('');
      } else {
        setSegmentIndex((s) => s + 1);
        setTextInput('');
      }
    } else {
      setInputError(true);
      setMistakeMade(true);
    }
  }

  function handleFullWordSubmit(e) {
    e.preventDefault();
    const expected = (segments.length > 0 ? word.word : word.word).toLowerCase();
    if (textInput.trim().toLowerCase() === expected) {
      setAnswered(true);
      goNext(mistakeMade ? 'hard' : 'good');
    } else {
      setInputError(true);
      setMistakeMade(true);
      setTextInput('');
    }
  }

  function handleShowAnswer() {
    setAnswered(true);
    goNext('again');
  }

  return (
    <div className="card">
      <div>
        {word.part_of_speech && <span>[{word.part_of_speech}] </span>}
        {index + 1}/{cards.length}
      </div>
      <h1>
        {word.word} <button onClick={() => speak(word.word)}>🔊</button>
      </h1>
      {word.ipa && <div>{word.ipa}</div>}

      {!answered && exercise_type === 'mc_en_vi' && (
        <div>
          <p>Nghĩa của từ này là gì?</p>
          {buildMcOptions(word, cards, (w) => w.meaning).map((opt) => (
            <button key={opt.id} onClick={() => handleMcChoice(opt.id)}>{opt.label}</button>
          ))}
        </div>
      )}

      {!answered && exercise_type === 'mc_vi_en' && (
        <div>
          <p>Từ nào có nghĩa là "{word.meaning}"?</p>
          {buildMcOptions(word, cards, (w) => w.word).map((opt) => (
            <button key={opt.id} onClick={() => handleMcChoice(opt.id)}>{opt.label}</button>
          ))}
        </div>
      )}

      {!answered && exercise_type === 'segment' && segmentIndex < segments.length && (
        <form onSubmit={handleSegmentSubmit}>
          <p>
            {segments.map((seg, i) => (
              <span key={i}>{i < segmentIndex ? seg : i === segmentIndex ? '____' : '....'} </span>
            ))}
          </p>
          <input
            style={{ borderColor: inputError ? 'red' : undefined }}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <button type="submit">Enter</button>
          <button type="button" onClick={handleShowAnswer}>Xem đáp án</button>
        </form>
      )}

      {!answered && exercise_type === 'segment' && segmentIndex >= segments.length && (
        <form onSubmit={handleFullWordSubmit}>
          <p>Nhập lại toàn bộ từ:</p>
          <input
            style={{ borderColor: inputError ? 'red' : undefined }}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <button type="submit">Enter</button>
          <button type="button" onClick={handleShowAnswer}>Xem đáp án</button>
        </form>
      )}

      {!answered && exercise_type === 'full_type' && (
        <form onSubmit={handleFullWordSubmit}>
          <p>Nhập từ tiếng Anh cho nghĩa: "{word.meaning}"</p>
          <input
            style={{ borderColor: inputError ? 'red' : undefined }}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <button type="submit">Enter</button>
          <button type="button" onClick={handleShowAnswer}>Xem đáp án</button>
        </form>
      )}

      {answered && (
        <div>
          <p>Nghĩa: {word.meaning}</p>
          {word.segments && (
            <p>Word breakdown: {word.segments.split('|').map((s) => <span key={s} className="card">{s}</span>)}</p>
          )}
          {word.example && (
            <p>
              {word.example} <button onClick={() => speak(word.example)}>🔊</button>
              <br />
              {word.example_vi}
            </p>
          )}
          <button onClick={() => goNext(wasCorrectFirstTry ? 'good' : 'again')}>Tiếp tục</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open `http://localhost:3000`, click "Study" tab. With at least one word created (via `curl` from Task 9), confirm: word displays, multiple-choice/typing flow works per `exercise_type`, "Tiếp tục" advances to the next card, and the queue empties after all cards are done.

- [ ] **Step 4: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: implement Study screen flashcard flow"
```

---

### Task 15: Frontend — Vocabulary / Import screen

**Files:**
- Modify: `src/screens/VocabularyScreen.jsx`

**Interfaces:**
- Consumes: `api.getWords()`, `api.createWord()`, `api.updateWord()`, `api.deleteWord()`, `api.importCsv()` (Task 13).

- [ ] **Step 1: Implement `src/screens/VocabularyScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', segments: '' };

export default function VocabularyScreen() {
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);

  function reload() {
    api.getWords(search ? { q: search } : {}).then((data) => setWords(data.words));
  }

  useEffect(reload, [search]);

  function handleFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await api.updateWord(editingId, form);
    } else {
      await api.createWord(form);
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    reload();
  }

  function handleEdit(w) {
    setEditingId(w.id);
    setForm({
      word: w.word, meaning: w.meaning, category: w.category || '', part_of_speech: w.part_of_speech || '',
      ipa: w.ipa || '', example: w.example || '', example_vi: w.example_vi || '', segments: w.segments || '',
    });
  }

  async function handleDelete(id) {
    await api.deleteWord(id);
    reload();
  }

  async function handleImport(e) {
    e.preventDefault();
    const result = await api.importCsv(csvText);
    setImportResult(result);
    setCsvText('');
    reload();
  }

  return (
    <div>
      <div className="card">
        <h2>{editingId ? 'Sửa từ' : 'Thêm từ mới'}</h2>
        <form onSubmit={handleSubmit}>
          {Object.keys(EMPTY_FORM).map((field) => (
            <div key={field}>
              <label>{field}: </label>
              <input value={form[field]} onChange={(e) => handleFieldChange(field, e.target.value)} />
            </div>
          ))}
          <button type="submit">{editingId ? 'Lưu' : 'Thêm'}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Hủy</button>}
        </form>
      </div>

      <div className="card">
        <h2>Import CSV</h2>
        <form onSubmit={handleImport}>
          <textarea
            rows={4}
            style={{ width: '100%' }}
            placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,segments"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button type="submit">Import</button>
        </form>
        {importResult && (
          <div>
            <p>Đã import: {importResult.imported}</p>
            {importResult.errors.length > 0 && (
              <ul>
                {importResult.errors.map((e, i) => <li key={i}>Dòng {e.line}: {e.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <input placeholder="Tìm kiếm..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <table>
          <thead>
            <tr><th>Word</th><th>Meaning</th><th>Category</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {words.map((w) => (
              <tr key={w.id}>
                <td>{w.word}</td>
                <td>{w.meaning}</td>
                <td>{w.category}</td>
                <td>{w.review_state?.[0]?.status}</td>
                <td>
                  <button onClick={() => handleEdit(w)}>Sửa</button>
                  <button onClick={() => handleDelete(w.id)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open the Vocabulary tab, add a word via the form, confirm it appears in the table, edit it, delete it, then paste a small CSV and confirm the import summary and table update.

- [ ] **Step 4: Commit**

```bash
git add src/screens/VocabularyScreen.jsx
git commit -m "feat: implement Vocabulary/Import screen"
```

---

### Task 16: Frontend — Dashboard screen

**Files:**
- Modify: `src/screens/DashboardScreen.jsx`

**Interfaces:**
- Consumes: `api.getDashboard()`, `api.getReviewsChart()` (Task 13).

- [ ] **Step 1: Implement `src/screens/DashboardScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DashboardScreen() {
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState(null);

  useEffect(() => {
    api.getDashboard().then(setSummary);
    api.getReviewsChart(7).then((data) => setChart(data.days));
  }, []);

  if (!summary || !chart) return <div>Đang tải...</div>;

  const maxCount = Math.max(1, ...chart.map((d) => d.new_learned + d.reviewed_count));

  return (
    <div>
      <div className="card">
        <p>New words: {summary.new_learned_today}/{summary.new_limit}</p>
        <p>Reviews due: {summary.due_count}</p>
        <p>Streak: {summary.streak} ngày</p>
        <p>Accuracy: {summary.accuracy === null ? 'N/A' : `${Math.round(summary.accuracy * 100)}%`}</p>
        <p>Daily goal: {summary.reviewed_today}/{summary.review_limit} reviews</p>
      </div>

      <div className="card">
        <h2>7 ngày gần nhất</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
          {chart.map((d) => (
            <div key={d.date} style={{ textAlign: 'center' }}>
              <div
                style={{
                  height: ((d.new_learned + d.reviewed_count) / maxCount) * 100,
                  width: 24,
                  background: '#3b82f6',
                }}
              />
              <div style={{ fontSize: 10 }}>{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Từ khó / hay quên</h2>
        <ul>
          {summary.difficult_words.map((s) => (
            <li key={s.word_id}>{s.words.word} — Forgotten {s.failure_count}x</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <p>Tổng số từ: new {summary.totals.new || 0}, learning {summary.totals.learning || 0}, difficult {summary.totals.difficult || 0}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open Dashboard tab, confirm summary numbers, bar chart, and difficult-words list render without errors (zeros/empty list acceptable on a fresh DB).

- [ ] **Step 4: Commit**

```bash
git add src/screens/DashboardScreen.jsx
git commit -m "feat: implement Dashboard screen"
```

---

### Task 17: Vercel + Supabase deployment wiring

**Files:**
- Modify: `.gitignore` (ensure `.vercel`, `node_modules`, `dist` ignored)
- Create: `README.md` (deployment instructions)

**Interfaces:**
- Consumes: all previous tasks (whole app must build and pass tests before this task).

- [ ] **Step 1: Confirm `.gitignore` covers build/deploy artifacts**

Ensure it includes (append any missing lines):
```
node_modules
dist
.vercel
.env
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Anki Vocab App

Local-first English vocabulary spaced-repetition app, deployed on Vercel with Supabase as the database.

## Setup

1. Create a Supabase project, run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase project settings.
3. `npm install`
4. `npm run dev` (runs `vercel dev`, serves frontend + `/api` functions locally)
5. `npm test` (runs Vitest unit tests for `lib/*.js`)

## Deploy

1. `vercel link` (first time only, links this directory to a Vercel project)
2. In the Vercel project dashboard, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables (Production + Preview).
3. `vercel deploy --prod`
```

- [ ] **Step 3: Run full test suite and build as a final check**

Run: `npm test && npm run build`
Expected: all Vitest suites pass, `vite build` succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "docs: add deployment instructions for Vercel + Supabase"
```
