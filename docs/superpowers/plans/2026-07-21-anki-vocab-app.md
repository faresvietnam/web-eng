# Anki Vocab App (Vercel + Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user English vocabulary spaced-repetition web app (Study / Vocabulary+Import / Dashboard) deployed on Vercel with Supabase (Postgres) as the database.

**Architecture:** React + Vite SPA served as a Vercel static build; backend logic lives in Vercel Serverless Functions under `/api/*` (Node.js runtime, CommonJS). All DB access goes through `@supabase/supabase-js` using a service-role key that only ever runs server-side inside `/api` functions — the browser never talks to Supabase directly. Pure scheduling/selection logic is isolated in `lib/*.js` modules with no I/O so it can be unit-tested without a database.

**Tech Stack:** React 18, Vite 5, Vitest (unit tests), `@supabase/supabase-js`, Vercel CLI (`vercel dev` / `vercel deploy`), plain CSS (no UI framework), no auth, no TypeScript.

## Global Constraints

- No authentication/login anywhere — single-user personal app (per spec).
- Backend code is CommonJS (`module.exports` / `require`) inside `lib/` and `api/`; frontend code under `src/` uses ES modules (`import`/`export`) — Vite handles this without needing `"type": "module"` in `package.json`.
- Test files (`tests/*.test.js`) must use ESM `import { describe, it, expect } from 'vitest'` — Vitest 2.x's package explicitly throws if you `require('vitest')` (verified; this is not a project config issue). To reach the CommonJS `lib/*.js` module under test from an ESM test file, add `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` and `require()` the lib module as usual.
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
  screens/ImportScreen.jsx
  screens/DashboardScreen.jsx
  screens/SettingsScreen.jsx
  styles.css
index.html
```

- `lib/` = pure logic + Supabase client factory, importable from `api/` and `tests/`.
- `api/` = one file per Vercel serverless route (file path = URL path, `[param].js` = dynamic segment).
- `src/` = Vite React frontend, matching the existing UI mockup (`VocabApp.dc.html` at repo root — layout, copy, and color tokens sourced from there; see spec section 9). Five screens (Dashboard, Learn, Vocabulary, Import, Settings) behind a simple tab switcher (no router needed — YAGNI). No "delete all data" action in v1 (decided out of scope; see spec section 9 Settings note).

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
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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

  const inFixedPhase = state.status === 'new' || state.interval_days === 0;
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
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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

  const { data: dailyProgress, error: dailyProgressError } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (dailyProgressError) {
    res.status(500).json({ error: dailyProgressError.message });
    return;
  }

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

  const { error: logError } = await supabase.from('review_log').insert({
    word_id: wordId,
    reviewed_at: now.toISOString(),
    result,
    exercise_type,
  });
  if (logError) {
    res.status(500).json({ error: logError.message });
    return;
  }

  const today = now.toISOString().slice(0, 10);
  const { data: progress, error: progressError } = await supabase
    .from('daily_progress')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (progressError) {
    res.status(500).json({ error: progressError.message });
    return;
  }

  const { error: upsertError } = await supabase.from('daily_progress').upsert({
    date: today,
    new_learned: (progress?.new_learned || 0) + (wasNew ? 1 : 0),
    reviewed_count: (progress?.reviewed_count || 0) + (wasNew ? 0 : 1),
  });
  if (upsertError) {
    res.status(500).json({ error: upsertError.message });
    return;
  }

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
    let query = supabase.from('words').select('*, review_state!inner(*)');
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

  const days = Math.max(1, Math.floor(Number(req.query.days)) || 7);
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

### Task 13: Frontend shell — API client, top bar, sidebar, tab routing

**Files:**
- Create: `src/api.js`
- Modify: `src/App.jsx` (replace placeholder from Task 1)
- Create: `src/styles.css`

**Interfaces:**
- Produces: `api.getToday()`, `api.postReview(wordId, body)`, `api.getWords(params)`, `api.createWord(body)`, `api.updateWord(id, body)`, `api.deleteWord(id)`, `api.importCsv(csvText)`, `api.getDashboard()`, `api.getReviewsChart(days)` — all return parsed JSON or throw on non-2xx. Consumed by Tasks 14–18.
- `App.jsx` renders the layout from the existing mockup (`VocabApp.dc.html` at repo root, see spec section 9): a fixed sidebar with 5 nav items (**Dashboard**, **Learn**, **Vocabulary**, **Import**, **Settings**, in that order) switched via `useState` (no router — YAGNI for 5 screens), plus a top bar. `App.jsx` owns `editingWord` state so the Vocabulary screen's "Sửa" action can hand a word to the Import screen's form and switch tabs to it.
- CSS class names (defined in `styles.css`, used by Tasks 14–18): `.layout`, `.sidebar`, `.sidebar-brand`, `.sidebar-logo`, `.sidebar-title`, `.sidebar-subtitle`, `.sidebar-nav`, `.navitem` (+ `.active`), `.sidebar-footer`, `.sidebar-widget`, `.sidebar-widget-title`, `.sidebar-widget-text`, `.main`, `.topbar`, `.topbar-search`, `.content`, `.card`, `.btn` (+ `.btn-primary`, `.btn-secondary`, `.btn-danger`), `.input` (+ `.input-error`), `.tag` (+ `.tag-new`, `.tag-learning`, `.tag-difficult`, `.tag-pos`), `.chip` (+ `.chip-1`, `.chip-2`), `.stat` (+ `.stat-label`, `.stat-value`), `.bar-track` / `.bar-fill`, `.seg` / `.seg-opt` (+ `.checked`), `.table`, `.opt-btn` (+ `.correct`, `.incorrect`, `.faded`).

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
:root {
  --sb: #2563eb;
  --sb-light: #dbeafe;
  --sb-dark: #1d4ed8;
  --purple: #7c3aed;
  --purple-light: #ede9fe;
  --green: #16a34a;
  --green-light: #dcfce7;
  --orange: #d97706;
  --red: #dc2626;
  --red-light: #fee2e2;
  --ink: #111827;
  --ink-2: #4b5563;
  --ink-3: #9ca3af;
  --line: #e5e7eb;
  --bg: #f7f8fa;
  --surface: #ffffff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: var(--ink);
  background: var(--bg);
}

.layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  flex: none;
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-logo {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--sb);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.sidebar-title {
  font-weight: 700;
  font-size: 15px;
}

.sidebar-subtitle {
  font-size: 11px;
  color: var(--ink-3);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.navitem {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: 10px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
}

.navitem:hover {
  background: #f3f4f6;
}

.navitem.active {
  background: var(--sb-light);
  color: var(--sb-dark);
  font-weight: 600;
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-widget {
  padding: 12px;
}

.sidebar-widget-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.sidebar-widget-text {
  font-size: 12px;
  color: var(--ink-3);
  margin-bottom: 6px;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 60px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.topbar-search {
  max-width: 420px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  padding: 20px;
  margin-bottom: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  padding: 9px 16px;
  cursor: pointer;
  border: 1px solid transparent;
  background: #f3f4f6;
  color: var(--ink-2);
}

.btn-primary {
  background: var(--sb);
  color: #fff;
}

.btn-primary:hover {
  background: var(--sb-dark);
}

.btn-secondary {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line);
}

.btn-danger {
  background: var(--surface);
  color: var(--red);
  border-color: var(--red-light);
}

.input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
  background: var(--surface);
  font-family: inherit;
}

.input:focus {
  outline: 2px solid var(--sb);
  outline-offset: 0;
  border-color: var(--sb);
}

.input-error {
  border-color: var(--red) !important;
}

.tag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}

.tag-new { background: var(--sb-light); color: var(--sb-dark); }
.tag-learning { background: #f3f4f6; color: var(--ink-2); }
.tag-difficult { background: var(--red-light); color: var(--red); }
.tag-pos { background: var(--purple-light); color: var(--purple); }

.chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
}

.chip-1 { background: var(--sb-light); color: var(--sb-dark); }
.chip-2 { background: var(--green-light); color: var(--green); }

.stat {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.stat-label { font-size: 13px; color: var(--ink-2); }
.stat-value { font-size: 26px; font-weight: 700; margin-top: 4px; }

.bar-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--sb);
}

.seg {
  display: inline-flex;
  gap: 4px;
  background: #f3f4f6;
  padding: 3px;
  border-radius: 10px;
}

.seg-opt {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink-2);
  border: none;
  background: none;
}

.seg-opt.checked {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .08);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  font-size: 12px;
  color: var(--ink-2);
  font-weight: 600;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.table td {
  padding: 12px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}

.opt-btn {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  cursor: pointer;
  font-size: 16px;
  text-align: left;
}

.opt-btn:hover {
  background: #f9fafb;
}

.opt-btn.correct {
  background: var(--green-light);
  border-color: var(--green);
  color: #15803d;
}

.opt-btn.incorrect {
  background: var(--red-light);
  border-color: var(--red);
  color: #b91c1c;
}

.opt-btn.faded {
  opacity: 0.5;
}
```

- [ ] **Step 3: Replace `src/App.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import DashboardScreen from './screens/DashboardScreen.jsx';
import StudyScreen from './screens/StudyScreen.jsx';
import VocabularyScreen from './screens/VocabularyScreen.jsx';
import ImportScreen from './screens/ImportScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'learn', label: 'Learn' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'import', label: 'Import' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingWord, setEditingWord] = useState(null);
  const [dailyGoal, setDailyGoal] = useState(null);

  useEffect(() => {
    api.getDashboard().then(setDailyGoal);
  }, [activeTab]);

  function handleEditWord(word) {
    setEditingWord(word);
    setActiveTab('import');
  }

  function handleImportDone() {
    setEditingWord(null);
    setActiveTab('vocabulary');
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">V</div>
          <div>
            <div className="sidebar-title">My Vocab</div>
            <div className="sidebar-subtitle">Master vocabulary daily.</div>
          </div>
        </div>
        <div className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`navitem${tab.key === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="card sidebar-widget">
            <div className="sidebar-widget-title">☁️ Cloud sync</div>
            <div className="sidebar-widget-text">Dữ liệu được lưu trên Supabase, tự động đồng bộ.</div>
          </div>
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
        </div>
      </nav>
      <div className="main">
        <div className="topbar">
          <input className="input topbar-search" placeholder="Search words, tags, examples..." />
        </div>
        <main className="content">
          {activeTab === 'dashboard' && <DashboardScreen />}
          {activeTab === 'learn' && <StudyScreen />}
          {activeTab === 'vocabulary' && <VocabularyScreen onEdit={handleEditWord} />}
          {activeTab === 'import' && <ImportScreen editingWord={editingWord} onDone={handleImportDone} />}
          {activeTab === 'settings' && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder screens (filled in Tasks 14–18)**

```jsx
// src/screens/DashboardScreen.jsx
import React from 'react';
export default function DashboardScreen() {
  return <div>Dashboard (coming in Task 17)</div>;
}
```

```jsx
// src/screens/StudyScreen.jsx
import React from 'react';
export default function StudyScreen() {
  return <div>Learn (coming in Task 14)</div>;
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
// src/screens/ImportScreen.jsx
import React from 'react';
export default function ImportScreen() {
  return <div>Import (coming in Task 16)</div>;
}
```

```jsx
// src/screens/SettingsScreen.jsx
import React from 'react';
export default function SettingsScreen() {
  return <div>Settings (coming in Task 18)</div>;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: builds successfully, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/api.js src/styles.css src/App.jsx src/screens
git commit -m "feat: add frontend shell with API client, top bar, and 5-tab sidebar"
```

---

### Task 14: Frontend — Learn (Study) screen

**Files:**
- Modify: `src/screens/StudyScreen.jsx`

**Interfaces:**
- Consumes: `api.getToday()`, `api.postReview()` (Task 13).
- Produces: full flashcard flow for `mc_en_vi`, `mc_vi_en`, `segment`, `full_type` exercise types, self-graded per spec section 8, styled per spec section 9 "Màn hình Learn".

- [ ] **Step 1: Implement `src/screens/StudyScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

function buildMcOptions(correctWord, pool, byField) {
  const others = pool.filter((w) => w.id !== correctWord.id);
  const sameCategory = others.filter((w) => w.category === correctWord.category);
  const candidates = sameCategory.length >= 3 ? sameCategory : others;
  const distractors = [...candidates].sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...distractors, correctWord].sort(() => Math.random() - 0.5);
  return options.map((w) => ({ id: w.id, label: byField(w) }));
}

export default function StudyScreen() {
  const [cards, setCards] = useState(null);
  const [allWords, setAllWords] = useState([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [outcome, setOutcome] = useState('good');
  const [mistakeMade, setMistakeMade] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [inputError, setInputError] = useState(false);

  useEffect(() => {
    api.getToday().then((data) => setCards(data.cards));
    api.getWords().then((data) => setAllWords(data.words)).catch(() => {});
  }, []);

  if (cards === null) return <div>Đang tải...</div>;
  if (cards.length === 0) return <div>Không có thẻ nào cần học hôm nay 🎉</div>;
  if (index >= cards.length) return <div>Đã hoàn thành hàng đợi hôm nay 🎉</div>;

  const card = cards[index];
  const { word, exercise_type } = card;
  const status = card.review_state ? card.review_state.status : 'new';
  const segments = word.segments ? word.segments.split('|') : [];
  const distractorPool = allWords.length > 0 ? allWords : cards.map((c) => c.word);

  function goNext() {
    api.postReview(word.id, { exercise_type, result: outcome })
      .catch(() => {})
      .finally(() => {
        setAnswered(false);
        setSelectedId(null);
        setMistakeMade(false);
        setSegmentIndex(0);
        setTextInput('');
        setInputError(false);
        setIndex((i) => i + 1);
      });
  }

  function handleMcChoice(choiceId) {
    if (answered) return;
    setSelectedId(choiceId);
    setOutcome(choiceId === word.id ? 'good' : 'again');
    setAnswered(true);
  }

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

  function handleFullWordSubmit(e) {
    e.preventDefault();
    if (textInput.trim().toLowerCase() === word.word.toLowerCase()) {
      setOutcome(mistakeMade ? 'hard' : 'good');
      setAnswered(true);
    } else {
      setInputError(true);
      setMistakeMade(true);
      setTextInput('');
    }
  }

  function handleShowAnswer() {
    setOutcome('again');
    setAnswered(true);
  }

  const mcOptions =
    exercise_type === 'mc_en_vi'
      ? buildMcOptions(word, distractorPool, (w) => w.meaning)
      : exercise_type === 'mc_vi_en'
      ? buildMcOptions(word, distractorPool, (w) => w.word)
      : null;

  // The English word must stay hidden until answered for every exercise type
  // except mc_en_vi (where the word IS the prompt) — otherwise showing it
  // up front trivially gives away mc_vi_en/segment/full_type answers.
  const showWordHeading = answered || exercise_type === 'mc_en_vi';

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={`tag ${STATUS_TAG_CLASS[status] || 'tag-new'}`}>{status}</span>
          {word.part_of_speech && <span className="tag tag-pos">{word.part_of_speech}</span>}
        </div>
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{index + 1}/{cards.length}</span>
      </div>

      {showWordHeading ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 48, margin: 0, fontWeight: 800 }}>{word.word}</h1>
            <button className="btn" style={{ borderRadius: '50%', width: 38, height: 38, padding: 0 }} onClick={() => speak(word.word)} aria-label="Phát âm">🔊</button>
          </div>
          {word.ipa && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ color: 'var(--ink-3)' }}>{word.ipa}</span>
              <button className="btn" style={{ borderRadius: '50%', width: 22, height: 22, padding: 0, fontSize: 12 }} onClick={() => speak(word.word)} aria-label="Phát âm">🔊</button>
            </div>
          )}
        </div>
      ) : exercise_type === 'mc_vi_en' ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Từ nào có nghĩa là:</p>
          <h1 style={{ fontSize: 32, margin: 0, fontWeight: 800 }}>{word.meaning}</h1>
        </div>
      ) : null}

      {!answered && mcOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {mcOptions.map((opt) => (
            <button key={opt.id} className="opt-btn" onClick={() => handleMcChoice(opt.id)}>{opt.label}</button>
          ))}
        </div>
      )}

      {answered && mcOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {mcOptions.map((opt) => {
            const cls = opt.id === word.id ? 'correct' : opt.id === selectedId ? 'incorrect' : 'faded';
            return <button key={opt.id} className={`opt-btn ${cls}`} disabled>{opt.label}</button>;
          })}
        </div>
      )}

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

      {!answered && exercise_type === 'full_type' && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>Nhập từ tiếng Anh cho nghĩa: "{word.meaning}"</p>
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

      {answered && (
        <div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{word.meaning}</div>
          </div>

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

          {word.example && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Example sentence</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{word.example}</div>
              <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{word.example_vi}</span>
                <button className="btn" style={{ borderRadius: '50%', width: 20, height: 20, padding: 0 }} onClick={() => speak(word.example)} aria-label="Phát âm">🔊</button>
              </div>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>Thẻ tiếp theo →</button>
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

Run: `vercel dev`, open `http://localhost:3000`, click "Learn" in the sidebar. With at least one word created (via `curl` from Task 9), confirm: word displays with status/part-of-speech tags, multiple-choice options color correctly after answering (green = correct, red = wrong pick, faded = rest), typing flows enforce retry-in-place with a red border, "Thẻ tiếp theo →" advances to the next card, and the queue empties after all cards are done.

- [ ] **Step 4: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: implement Learn screen flashcard flow"
```

---

### Task 15: Frontend — Vocabulary screen

**Files:**
- Modify: `src/screens/VocabularyScreen.jsx`

**Interfaces:**
- Consumes: `api.getWords()`, `api.deleteWord()` (Task 13).
- Produces: a `VocabularyScreen({ onEdit })` component — `onEdit(word)` is called when the user clicks "Sửa" on a row; `App.jsx` (Task 13) uses it to switch to the Import tab with that word preloaded. Consumed by Task 13's `App.jsx`.

- [ ] **Step 1: Implement `src/screens/VocabularyScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'difficult', label: 'Difficult' },
];

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };
const STATUS_LABEL = { new: 'New', learning: 'Learning', difficult: 'Difficult' };

function formatNextReview(iso) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Hôm nay';
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes} phút nữa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ nữa`;
  const days = Math.round(hours / 24);
  return `${days} ngày nữa`;
}

export default function VocabularyScreen({ onEdit }) {
  const [words, setWords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  function reload() {
    const params = {};
    if (filter !== 'all') params.status = filter;
    if (search) params.q = search;
    api.getWords(params).then((data) => setWords(data.words));
  }

  useEffect(reload, [filter, search]);

  async function handleDelete(id) {
    await api.deleteWord(id);
    reload();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Danh sách từ vựng</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`seg-opt${filter === f.key ? ' checked' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Tìm theo từ, nghĩa, chủ đề..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="card" style={{ padding: 4 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Từ</th><th>Loại từ</th><th>Nghĩa</th><th>Chủ đề</th><th>Trạng thái</th><th>Ôn tiếp theo</th><th></th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => {
              const state = w.review_state?.[0];
              const status = state?.status || 'new';
              return (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.word}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.part_of_speech}</td>
                  <td>{w.meaning}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.category}</td>
                  <td><span className={`tag ${STATUS_TAG_CLASS[status]}`}>{STATUS_LABEL[status]}</span></td>
                  <td style={{ color: 'var(--ink-2)' }}>{state ? formatNextReview(state.next_review_at) : ''}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => onEdit(w)}>Sửa</button>{' '}
                    <button className="btn btn-secondary" onClick={() => handleDelete(w.id)}>Xóa</button>
                  </td>
                </tr>
              );
            })}
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

Run: `vercel dev`, open the Vocabulary tab, confirm the segmented filter and search narrow the table, "Ôn tiếp theo" shows a relative label (not a raw timestamp), "Xóa" removes a row, and "Sửa" switches to the Import tab with the word's fields preloaded (verified together with Task 16).

- [ ] **Step 4: Commit**

```bash
git add src/screens/VocabularyScreen.jsx
git commit -m "feat: implement Vocabulary screen"
```

---

### Task 16: Frontend — Import screen

**Files:**
- Modify: `src/screens/ImportScreen.jsx`

**Interfaces:**
- Consumes: `api.createWord()`, `api.updateWord()`, `api.importCsv()` (Task 13).
- Produces: `ImportScreen({ editingWord, onDone })` — when `editingWord` is set (by Task 15's "Sửa" via `App.jsx`), the manual-entry form preloads its fields and submits to `updateWord` instead of `createWord`; `onDone()` is called after a successful save (clears `editingWord` and returns to Vocabulary, per Task 13's `App.jsx`).

- [ ] **Step 1: Implement `src/screens/ImportScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', segments: '' };

const FIELDS = [
  { key: 'word', label: 'Word', placeholder: 'beautiful' },
  { key: 'meaning', label: 'Meaning', placeholder: 'đẹp' },
  { key: 'category', label: 'Category', placeholder: 'appearance' },
  { key: 'part_of_speech', label: 'Part of speech', placeholder: 'adjective' },
  { key: 'ipa', label: 'IPA', placeholder: '/ˈbjuːtɪfəl/' },
  { key: 'segments', label: 'Segments', placeholder: 'beauty|ful' },
];

export default function ImportScreen({ editingWord, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);

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
        segments: editingWord.segments || '',
      });
    }
  }, [editingWord]);

  function handleFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingWord) {
      await api.updateWord(editingWord.id, form);
    } else {
      await api.createWord(form);
    }
    setForm(EMPTY_FORM);
    onDone();
  }

  async function handleImport(e) {
    e.preventDefault();
    const result = await api.importCsv(csvText);
    setImportResult(result);
    setCsvText('');
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
        <form onSubmit={handleImport}>
          <textarea
            className="input"
            rows={4}
            placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,segments"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Import</button>
        </form>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10 }}>
          CSV format tip — Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, segments
        </div>
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
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example</label>
          <input className="input" placeholder="She has a beautiful smile." value={form.example} onChange={(e) => handleFieldChange('example', e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example (VI)</label>
          <input className="input" placeholder="Cô ấy có nụ cười đẹp." value={form.example_vi} onChange={(e) => handleFieldChange('example_vi', e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary">Lưu từ</button>
          {editingWord && <button type="button" className="btn btn-secondary" onClick={onDone}>Hủy</button>}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open Import tab: paste a small CSV and confirm the import summary; fill the manual form and click "Lưu từ", confirm it lands in Vocabulary (Task 15); from Vocabulary click "Sửa" on that word, confirm the Import form preloads its fields with the heading "Sửa từ" and a "Hủy" button, save, and confirm you're returned to Vocabulary with the updated row.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ImportScreen.jsx
git commit -m "feat: implement Import screen (CSV import + manual add/edit form)"
```

---

### Task 17: Frontend — Dashboard screen

**Files:**
- Modify: `src/screens/DashboardScreen.jsx`

**Interfaces:**
- Consumes: `api.getDashboard()`, `api.getReviewsChart()`, `api.getToday()` (Task 13).

- [ ] **Step 1: Implement `src/screens/DashboardScreen.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

export default function DashboardScreen() {
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState(null);
  const [previewCards, setPreviewCards] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    api.getDashboard().then(setSummary);
    api.getReviewsChart(7).then((data) => setChart(data.days));
    api.getToday().then((data) => setPreviewCards(data.cards));
  }, []);

  if (!summary || !chart || !previewCards) return <div>Đang tải...</div>;

  const maxCount = Math.max(1, ...chart.map((d) => d.new_learned + d.reviewed_count));
  const previewCard = previewCards.length > 0 ? previewCards[previewIndex % previewCards.length] : null;
  const totalWords = (summary.totals.new || 0) + (summary.totals.learning || 0) + (summary.totals.difficult || 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="card">
          <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>Mục tiêu hôm nay</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>
            <span>Reviews</span><span>{summary.reviewed_today} / {summary.review_limit}</span>
          </div>
          <div className="bar-track" style={{ marginBottom: 16 }}>
            <div className="bar-fill" style={{ width: `${Math.min(100, (summary.reviewed_today / summary.review_limit) * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--ink-2)' }}>
            <div>Tổng số từ <strong style={{ color: 'var(--ink)' }}>{totalWords}</strong></div>
            <div>New <strong style={{ color: 'var(--sb-dark)' }}>{summary.totals.new || 0}</strong></div>
            <div>Learning <strong style={{ color: 'var(--ink)' }}>{summary.totals.learning || 0}</strong></div>
            <div>Difficult <strong style={{ color: 'var(--red)' }}>{summary.totals.difficult || 0}</strong></div>
          </div>
        </div>

        {previewCard && (
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`tag ${STATUS_TAG_CLASS[previewCard.review_state.status] || 'tag-new'}`}>{previewCard.review_state.status}</span>
                {previewCard.word.part_of_speech && <span className="tag tag-pos">{previewCard.word.part_of_speech}</span>}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{(previewIndex % previewCards.length) + 1}/{previewCards.length}</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 38, margin: 0, fontWeight: 800 }}>{previewCard.word.word}</h1>
                <button className="btn" style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }} onClick={() => speak(previewCard.word.word)} aria-label="Phát âm">🔊</button>
              </div>
              {previewCard.word.ipa && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{previewCard.word.ipa}</span>}
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{previewCard.word.meaning}</div>
            </div>
            {previewCard.word.example && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Example sentence</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{previewCard.word.example}</div>
                <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-3)' }}>{previewCard.word.example_vi}</div>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setPreviewIndex((i) => i + 1)}>Next</button>
          </div>
        )}
      </div>

      <div>
        <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Today</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div className="stat"><div className="stat-label">New words</div><div className="stat-value" style={{ color: 'var(--sb-dark)' }}>{summary.new_learned_today}/{summary.new_limit}</div></div>
          <div className="stat"><div className="stat-label">Reviews due</div><div className="stat-value" style={{ color: 'var(--orange)' }}>{summary.due_count}</div></div>
          <div className="stat"><div className="stat-label">Streak</div><div className="stat-value" style={{ color: 'var(--green)' }}>{summary.streak}</div></div>
          <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value" style={{ color: 'var(--purple)' }}>{summary.accuracy === null ? 'N/A' : `${Math.round(summary.accuracy * 100)}%`}</div></div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Reviews</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>7 days</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
            {chart.map((d) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: 'var(--sb-light)', height: `${((d.new_learned + d.reviewed_count) / maxCount) * 100}%` }} />
                <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Difficult / Forgotten words</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {summary.difficult_words.map((s) => (
              <div key={s.word_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.words.word}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.words.meaning}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Forgotten {s.failure_count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open Dashboard tab, confirm "Mục tiêu hôm nay" progress bar and counts, the next-card preview card renders (or is omitted if there are no cards today) and "Next" cycles through today's queue without submitting any review, the "Today" stat grid, the 7-day bar chart, and the Difficult/Forgotten list all render without errors (zeros/empty list acceptable on a fresh DB).

- [ ] **Step 4: Commit**

```bash
git add src/screens/DashboardScreen.jsx
git commit -m "feat: implement Dashboard screen"
```

---

### Task 18: Frontend — Settings screen

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

**Interfaces:**
- Consumes: nothing (static values matching the Global Constraints' hard-coded daily limits).

- [ ] **Step 1: Implement `src/screens/SettingsScreen.jsx`**

```jsx
import React from 'react';

export default function SettingsScreen() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Settings</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số từ mới tối đa mỗi ngày</label>
          <input className="input" type="number" value={20} readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số lượt ôn tối đa mỗi ngày</label>
          <input className="input" type="number" value={100} readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Giọng đọc (TTS)</label>
          <div className="seg">
            <span className="seg-opt checked">en-US</span>
            <span className="seg-opt">en-GB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open Settings tab, confirm the two limit inputs show `20` and `100` and are not editable (typing into them has no effect), and the TTS segmented control shows `en-US` selected and `en-GB` present but non-interactive. Confirm there is no "Xóa toàn bộ dữ liệu" button (excluded from v1 per spec section 9).

- [ ] **Step 4: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: implement Settings screen"
```

---

### Task 19: Vercel + Supabase deployment wiring

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
