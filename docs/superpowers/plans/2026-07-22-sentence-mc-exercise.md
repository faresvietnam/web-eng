# Sentence Fill-in-the-Blank MC Exercise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `mc_sentence` exercise (pick the word that fills a blanked example sentence) and a `new_combo` first-encounter step (meaning-choice + sentence-choice, both required) into the existing spaced-repetition exercise progression.

**Architecture:** A new pure CommonJS helper (`lib/sentenceBlank.js`) parses `()`-delimited multi-sentence `example`/`example_vi` fields and blanks the target word out of a sentence. `lib/exerciseType.js` gains a `hasExample` parameter and a revised progression table. `api/session/today.js` computes `hasExample` per card. `src/screens/StudyScreen.jsx` gets a client-side reimplementation of the same blanking logic (it's an ES module component, can't `require()` the CommonJS lib), a new `mc_sentence` question renderer, and a two-step `new_combo` flow that only submits one review after both sub-questions are answered.

**Tech Stack:** Node.js (CommonJS libs), React (Vite, ESM), Vitest for lib tests.

## Global Constraints

- No database schema changes — `words.example` / `words.example_vi` keep their existing `text` type; multiple sentences are just delimited by the literal string `()`.
- No changes to `lib/scheduler.js` or `lib/dailyQueue.js`.
- No changes to CSV import or word-editing forms — operators type `()`-delimited sentences into the existing `example`/`example_vi` inputs themselves.
- A wrong answer always resets `correct_count` to `0` (existing `lib/scheduler.js` behavior) — the new `new_combo` result must be `'again'` unless **both** sub-questions were answered correctly on the first try.
- Exercise progression (from the approved spec):
  ```
  status === 'difficult'   → full_type
  correct_count === 0      → new_combo
  correct_count === 1      → mc_vi_en
  correct_count === 2      → hasExample ? mc_sentence : mc_vi_en
  correct_count === 3      → hasSegments ? segment : full_type
  correct_count >= 4       → full_type   (always, even if hasSegments)
  ```

---

### Task 1: `lib/sentenceBlank.js` — parsing and blanking helper

**Files:**
- Create: `lib/sentenceBlank.js`
- Test: `tests/sentenceBlank.test.js`

**Interfaces:**
- Produces:
  - `parseSentencePairs(example, exampleVi)` → `Array<{ sentence: string, meaning: string }>`
  - `buildBlank(sentence, wordText)` → `string | null` (blanked sentence, or `null` if `wordText` isn't found as a whole word in `sentence`)
  - `hasUsableSentence(example, wordText)` → `boolean` (true if at least one sentence in `example` can be blanked for `wordText`)

- [ ] **Step 1: Write the failing tests**

Create `tests/sentenceBlank.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseSentencePairs, buildBlank, hasUsableSentence } = require('../lib/sentenceBlank');

describe('parseSentencePairs', () => {
  it('parses a single legacy sentence with no delimiter', () => {
    expect(parseSentencePairs('I bought a car.', 'Tôi đã mua xe.')).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
    ]);
  });

  it('splits multiple sentences delimited by ()', () => {
    const example = 'I bought a car.()The report was late.';
    const exampleVi = 'Tôi đã mua xe.()Báo cáo bị trễ.';
    expect(parseSentencePairs(example, exampleVi)).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: 'Báo cáo bị trễ.' },
    ]);
  });

  it('trims whitespace around each sentence and meaning', () => {
    const example = ' I bought a car. () The report was late. ';
    const exampleVi = ' Tôi đã mua xe. () Báo cáo bị trễ. ';
    expect(parseSentencePairs(example, exampleVi)).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: 'Báo cáo bị trễ.' },
    ]);
  });

  it('fills missing meanings with an empty string when fewer meanings than sentences', () => {
    const example = 'I bought a car.()The report was late.';
    expect(parseSentencePairs(example, 'Tôi đã mua xe.')).toEqual([
      { sentence: 'I bought a car.', meaning: 'Tôi đã mua xe.' },
      { sentence: 'The report was late.', meaning: '' },
    ]);
  });

  it('returns an empty array for missing or empty input', () => {
    expect(parseSentencePairs(null, null)).toEqual([]);
    expect(parseSentencePairs('', '')).toEqual([]);
  });
});

describe('buildBlank', () => {
  it('replaces a case-insensitive whole-word match with ____', () => {
    expect(buildBlank('I have money in my Savings Account.', 'savings account'))
      .toBe('I have money in my ____.');
  });

  it('returns null when the word text is not present', () => {
    expect(buildBlank('The report was late again.', 'savings account')).toBeNull();
  });

  it('does not match a substring inside a longer word', () => {
    expect(buildBlank('The category was wrong.', 'cat')).toBeNull();
  });

  it('returns null for empty sentence or word', () => {
    expect(buildBlank('', 'cat')).toBeNull();
    expect(buildBlank('The cat sat.', '')).toBeNull();
  });
});

describe('hasUsableSentence', () => {
  it('returns true when at least one sentence can be blanked', () => {
    const example = 'The report was late.()I have money in my savings account.';
    expect(hasUsableSentence(example, 'savings account')).toBe(true);
  });

  it('returns false when no sentence matches the word', () => {
    const example = 'The report was late.()Nothing else here.';
    expect(hasUsableSentence(example, 'savings account')).toBe(false);
  });

  it('returns false for missing example', () => {
    expect(hasUsableSentence(null, 'savings account')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sentenceBlank.test.js`
Expected: FAIL — `Cannot find module '../lib/sentenceBlank'`

- [ ] **Step 3: Implement `lib/sentenceBlank.js`**

```js
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitDelimited(value) {
  return (value || '')
    .split('()')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSentencePairs(example, exampleVi) {
  const sentences = splitDelimited(example);
  const meanings = splitDelimited(exampleVi);
  return sentences.map((sentence, i) => ({ sentence, meaning: meanings[i] || '' }));
}

function buildBlank(sentence, wordText) {
  if (!sentence || !wordText) return null;
  const re = new RegExp(`\\b${escapeRegExp(wordText)}\\b`, 'i');
  if (!re.test(sentence)) return null;
  return sentence.replace(re, '____');
}

function hasUsableSentence(example, wordText) {
  return splitDelimited(example).some((sentence) => buildBlank(sentence, wordText) !== null);
}

module.exports = { parseSentencePairs, buildBlank, hasUsableSentence };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sentenceBlank.test.js`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sentenceBlank.js tests/sentenceBlank.test.js
git commit -m "feat: add sentence parsing and blanking helper"
```

---

### Task 2: Update `lib/exerciseType.js` progression

**Files:**
- Modify: `lib/exerciseType.js`
- Test: `tests/exerciseType.test.js` (full rewrite — old assertions describe the pre-feature progression and no longer hold)

**Interfaces:**
- Consumes: none (pure function, no dependency on Task 1)
- Produces: `pickExerciseType({ status, correct_count, hasSegments, hasExample })` → one of `'full_type' | 'new_combo' | 'mc_vi_en' | 'mc_sentence' | 'segment'`. `hasExample` is a new parameter consumed by Task 3 (`api/session/today.js`) and by nothing else in this task.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/exerciseType.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickExerciseType } = require('../lib/exerciseType');

describe('pickExerciseType', () => {
  it('always returns full_type for difficult words', () => {
    expect(pickExerciseType({ status: 'difficult', correct_count: 0, hasSegments: true, hasExample: true })).toBe('full_type');
  });

  it('returns new_combo at correct_count 0', () => {
    expect(pickExerciseType({ status: 'new', correct_count: 0, hasSegments: false, hasExample: false })).toBe('new_combo');
  });

  it('returns mc_vi_en at correct_count 1', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 1, hasSegments: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns mc_sentence at correct_count 2 when hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: false, hasExample: true })).toBe('mc_sentence');
  });

  it('falls back to mc_vi_en at correct_count 2 when not hasExample', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 2, hasSegments: false, hasExample: false })).toBe('mc_vi_en');
  });

  it('returns segment at correct_count 3 when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasSegments: true, hasExample: false })).toBe('segment');
  });

  it('returns full_type at correct_count 3 when not hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 3, hasSegments: false, hasExample: false })).toBe('full_type');
  });

  it('returns full_type at correct_count 4 even when hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 4, hasSegments: true, hasExample: true })).toBe('full_type');
  });

  it('returns full_type at correct_count 10 when not hasSegments', () => {
    expect(pickExerciseType({ status: 'learning', correct_count: 10, hasSegments: false, hasExample: false })).toBe('full_type');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/exerciseType.test.js`
Expected: FAIL — `new_combo` test fails (current code returns `'mc_en_vi'` at `correct_count === 0`), `mc_sentence` tests fail (unknown case), `correct_count 4` test fails (current code still returns `segment`).

- [ ] **Step 3: Implement the updated `lib/exerciseType.js`**

```js
function pickExerciseType({ status, correct_count, hasSegments, hasExample }) {
  if (status === 'difficult') return 'full_type';
  if (correct_count === 0) return 'new_combo';
  if (correct_count === 1) return 'mc_vi_en';
  if (correct_count === 2) return hasExample ? 'mc_sentence' : 'mc_vi_en';
  if (correct_count === 3) return hasSegments ? 'segment' : 'full_type';
  return 'full_type';
}

module.exports = { pickExerciseType };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/exerciseType.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/exerciseType.js tests/exerciseType.test.js
git commit -m "feat: extend exercise progression with new_combo and mc_sentence"
```

---

### Task 3: Wire `hasExample` into `api/session/today.js`

**Files:**
- Modify: `api/session/today.js:1-4` (require), `api/session/today.js:49-57` (`cards` mapping)

**Interfaces:**
- Consumes: `hasUsableSentence(example, wordText)` from Task 1 (`lib/sentenceBlank.js`); `pickExerciseType({ status, correct_count, hasSegments, hasExample })` from Task 2
- Produces: `card.exercise_type` may now be `'new_combo'` or `'mc_sentence'`, consumed by Task 4/5 (`src/screens/StudyScreen.jsx`)

- [ ] **Step 1: Add the `hasUsableSentence` require**

In `api/session/today.js`, change the top of the file from:

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');
```

to:

```js
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');
const { hasUsableSentence } = require('../../lib/sentenceBlank');
```

- [ ] **Step 2: Pass `hasExample` into `pickExerciseType`**

Change the `cards` mapping from:

```js
  const cards = queue.map((state) => ({
    word: state.words,
    review_state: state,
    exercise_type: pickExerciseType({
      status: state.status,
      correct_count: state.correct_count,
      hasSegments: Boolean(state.words.segments),
    }),
  }));
```

to:

```js
  const cards = queue.map((state) => ({
    word: state.words,
    review_state: state,
    exercise_type: pickExerciseType({
      status: state.status,
      correct_count: state.correct_count,
      hasSegments: Boolean(state.words.segments),
      hasExample: hasUsableSentence(state.words.example, state.words.word),
    }),
  }));
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (all existing suites, no new tests in this task — `api/` handlers have no existing unit tests in this repo, consistent with `csv.test.js`/`auth.test.js`/`scheduler.test.js`/`dailyQueue.test.js`/`exerciseType.test.js` all covering only `lib/`)

- [ ] **Step 4: Commit**

```bash
git add api/session/today.js
git commit -m "feat: compute hasExample for the daily queue"
```

---

### Task 4: `StudyScreen.jsx` — `mc_sentence` question rendering

**Files:**
- Modify: `src/screens/StudyScreen.jsx`

**Interfaces:**
- Consumes: `word.example`, `word.example_vi`, `word.word` (already present on the `word` object from the API)
- Produces: `effectiveType` (string, defaults to `exercise_type` outside combo — Task 5 makes it combo-aware), `examplePairs` (`Array<{sentence, meaning}>`), `blankSentence` (`{sentence, meaning, blank} | null`), consumed by Task 5 and Task 6

This task makes a **standalone** `mc_sentence` card (the `correct_count === 2` case) fully working, without yet touching the `new_combo` flow (Task 5).

- [ ] **Step 1: Add local sentence-blank helpers**

In `src/screens/StudyScreen.jsx`, after the existing `buildMcOptions` function (currently lines 7-14), add:

```js
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitDelimited(value) {
  return (value || '')
    .split('()')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSentencePairs(example, exampleVi) {
  const sentences = splitDelimited(example);
  const meanings = splitDelimited(exampleVi);
  return sentences.map((sentence, i) => ({ sentence, meaning: meanings[i] || '' }));
}

function buildBlank(sentence, wordText) {
  if (!sentence || !wordText) return null;
  const re = new RegExp(`\\b${escapeRegExp(wordText)}\\b`, 'i');
  if (!re.test(sentence)) return null;
  return sentence.replace(re, '____');
}
```

(This mirrors `lib/sentenceBlank.js` from Task 1 — duplicated because this file is an ES module component bundled by Vite and cannot `require()` the CommonJS lib.)

- [ ] **Step 2: Derive `examplePairs`, `hasExample`, `effectiveType`, and memoize `blankSentence`**

Find this block (current lines 39-44):

```js
  const card = cards && index < cards.length ? cards[index] : null;
  const word = card ? card.word : null;
  const exercise_type = card ? card.exercise_type : null;
  const status = card && card.review_state ? card.review_state.status : 'new';
  const segments = word && word.segments ? word.segments.split('|') : [];
  const distractorPool = allWords.length > 0 ? allWords : cards ? cards.map((c) => c.word) : [];
```

Replace it with:

```js
  const card = cards && index < cards.length ? cards[index] : null;
  const word = card ? card.word : null;
  const exercise_type = card ? card.exercise_type : null;
  const status = card && card.review_state ? card.review_state.status : 'new';
  const segments = word && word.segments ? word.segments.split('|') : [];
  const distractorPool = allWords.length > 0 ? allWords : cards ? cards.map((c) => c.word) : [];
  const examplePairs = word ? parseSentencePairs(word.example, word.example_vi) : [];
  const hasExample = word ? examplePairs.some((p) => buildBlank(p.sentence, word.word) !== null) : false;
  const effectiveType = exercise_type;
```

(`effectiveType` is a plain alias for now — Task 5 changes its computation to branch on combo step. Keeping it as a separate variable now avoids touching every call site again in Task 5.)

Directly below the `mcOptions` memo (current lines 55-61), add a new memo for the chosen blank sentence:

```js
  const blankSentence = useMemo(() => {
    if (!word) return null;
    const candidates = examplePairs
      .map((p) => ({ ...p, blank: buildBlank(p.sentence, word.word) }))
      .filter((p) => p.blank);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

- [ ] **Step 3: Extend the `mcOptions` memo to build `mc_sentence` options**

Find (current lines 55-61):

```js
  const mcOptions = useMemo(() => {
    if (!word) return null;
    if (exercise_type === 'mc_en_vi') return buildMcOptions(word, distractorPool, (w) => w.meaning);
    if (exercise_type === 'mc_vi_en') return buildMcOptions(word, distractorPool, (w) => w.word);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Replace with:

```js
  const mcOptions = useMemo(() => {
    if (!word) return null;
    if (effectiveType === 'mc_en_vi') return buildMcOptions(word, distractorPool, (w) => w.meaning);
    if (effectiveType === 'mc_vi_en') return buildMcOptions(word, distractorPool, (w) => w.word);
    if (effectiveType === 'mc_sentence') return buildMcOptions(word, distractorPool, (w) => w.word);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

- [ ] **Step 4: Update the auto-speak effect and the answered-state speak call to use `effectiveType`**

Find (current lines 65-68):

```js
  useEffect(() => {
    if (word && exercise_type === 'mc_en_vi') speak(word.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Replace with:

```js
  useEffect(() => {
    if (word && effectiveType === 'mc_en_vi') speak(word.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Find `handleMcChoice` (current lines 98-107):

```js
  function handleMcChoice(choiceId) {
    if (answered) return;
    setSelectedId(choiceId);
    setOutcome(choiceId === word.id ? 'good' : 'again');
    setAnswered(true);
    if (exercise_type === 'mc_vi_en') {
      const chosen = mcOptions.find((opt) => opt.id === choiceId);
      if (chosen) speak(chosen.label);
    }
  }
```

Replace with:

```js
  function handleMcChoice(choiceId) {
    if (answered) return;
    setSelectedId(choiceId);
    setOutcome(choiceId === word.id ? 'good' : 'again');
    setAnswered(true);
    if (effectiveType === 'mc_vi_en' || effectiveType === 'mc_sentence') {
      const chosen = mcOptions.find((opt) => opt.id === choiceId);
      if (chosen) speak(chosen.label);
    }
  }
```

- [ ] **Step 5: Render the `mc_sentence` question header**

Find the heading block (current lines 139-170):

```js
  const isDifficultCopy = exercise_type === 'full_type' && status === 'difficult';
  const showWordHeading = answered || exercise_type === 'mc_en_vi' || isDifficultCopy;

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
```

Replace with:

```js
  const isDifficultCopy = exercise_type === 'full_type' && status === 'difficult';
  const showWordHeading = answered || effectiveType === 'mc_en_vi' || isDifficultCopy;

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
      ) : effectiveType === 'mc_vi_en' ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Từ nào có nghĩa là:</p>
          <h1 style={{ fontSize: 32, margin: 0, fontWeight: 800 }}>{word.meaning}</h1>
        </div>
      ) : effectiveType === 'mc_sentence' ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Điền từ còn thiếu vào câu:</p>
          <h2 style={{ fontSize: 24, margin: 0, fontWeight: 700, lineHeight: 1.4 }}>{blankSentence ? blankSentence.blank : ''}</h2>
        </div>
      ) : null}
```

- [ ] **Step 6: Manually verify the standalone `mc_sentence` card**

This exercise type only appears at `correct_count === 2` with `hasExample: true`, which requires a seeded word + review state in the running app (covered end-to-end in Task 7's manual verification). No isolated automated check is possible here since `StudyScreen.jsx` has no existing component test harness (`vitest.config.js` runs in `environment: 'node'`, and no `@testing-library/react` dependency exists in `package.json`). Confirm this compiles by running the dev build:

Run: `npx vite build`
Expected: build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: render mc_sentence question in StudyScreen"
```

---

### Task 5: `StudyScreen.jsx` — `new_combo` two-step flow

**Files:**
- Modify: `src/screens/StudyScreen.jsx`

**Interfaces:**
- Consumes: `effectiveType`, `examplePairs`, `hasExample`, `mcOptions`, `blankSentence` from Task 4
- Produces: `comboStep` (0 or 1), `isCombo` (boolean) — used only within this component

- [ ] **Step 1: Add combo state**

Find the state declarations (current lines 17-26):

```js
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
```

Replace with:

```js
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
  const [comboStep, setComboStep] = useState(0);
  const [comboPart0Correct, setComboPart0Correct] = useState(null);
```

- [ ] **Step 2: Compute `isCombo` and make `effectiveType` combo-aware**

Find the line added in Task 4:

```js
  const effectiveType = exercise_type;
```

Replace with:

```js
  const isCombo = exercise_type === 'new_combo';
  const comboPart1Type = hasExample ? 'mc_sentence' : 'mc_vi_en';
  const effectiveType = isCombo ? (comboStep === 0 ? 'mc_en_vi' : comboPart1Type) : exercise_type;
```

(`hasExample` and `examplePairs` are computed above this line already, from Task 4 — no reordering needed since `hasExample`'s definition sits directly above the block being replaced.)

- [ ] **Step 3: Make the `mcOptions` memo recompute when `comboStep` changes**

Find (from Task 4):

```js
  const mcOptions = useMemo(() => {
    if (!word) return null;
    if (effectiveType === 'mc_en_vi') return buildMcOptions(word, distractorPool, (w) => w.meaning);
    if (effectiveType === 'mc_vi_en') return buildMcOptions(word, distractorPool, (w) => w.word);
    if (effectiveType === 'mc_sentence') return buildMcOptions(word, distractorPool, (w) => w.word);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);
```

Replace the dependency array only:

```js
  const mcOptions = useMemo(() => {
    if (!word) return null;
    if (effectiveType === 'mc_en_vi') return buildMcOptions(word, distractorPool, (w) => w.meaning);
    if (effectiveType === 'mc_vi_en') return buildMcOptions(word, distractorPool, (w) => w.word);
    if (effectiveType === 'mc_sentence') return buildMcOptions(word, distractorPool, (w) => w.word);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, comboStep]);
```

- [ ] **Step 4: Branch `handleMcChoice` for the combo's first step**

Find (from Task 4):

```js
  function handleMcChoice(choiceId) {
    if (answered) return;
    setSelectedId(choiceId);
    setOutcome(choiceId === word.id ? 'good' : 'again');
    setAnswered(true);
    if (effectiveType === 'mc_vi_en' || effectiveType === 'mc_sentence') {
      const chosen = mcOptions.find((opt) => opt.id === choiceId);
      if (chosen) speak(chosen.label);
    }
  }
```

Replace with:

```js
  function handleMcChoice(choiceId) {
    if (answered) return;
    const correct = choiceId === word.id;
    setSelectedId(choiceId);
    setAnswered(true);
    if (effectiveType === 'mc_vi_en' || effectiveType === 'mc_sentence') {
      const chosen = mcOptions.find((opt) => opt.id === choiceId);
      if (chosen) speak(chosen.label);
    }
    if (isCombo && comboStep === 0) {
      setComboPart0Correct(correct);
      return;
    }
    const finalCorrect = isCombo ? comboPart0Correct && correct : correct;
    setOutcome(finalCorrect ? 'good' : 'again');
  }

  function handleComboContinue() {
    setComboStep(1);
    setAnswered(false);
    setSelectedId(null);
  }
```

- [ ] **Step 5: Reset combo state in `goNext`**

Find (current lines 84-96):

```js
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
```

Replace with:

```js
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
        setComboStep(0);
        setComboPart0Correct(null);
        setIndex((i) => i + 1);
      });
  }
```

- [ ] **Step 6: Gate the reveal panel and swap the final button for "Tiếp tục" during combo step 0**

Find the reveal panel gate and final button (current lines 243-279, after Task 4's edits the line numbers shift slightly but the text is unchanged):

```js
      {(answered || isDifficultCopy) && (
        <div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{word.meaning}</div>
          </div>
```

Replace the opening condition line with:

```js
      {((answered && !(isCombo && comboStep === 0)) || isDifficultCopy) && (
        <div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{word.meaning}</div>
          </div>
```

Find the final button (current lines 277-279):

```js
      {answered && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>Thẻ tiếp theo →</button>
      )}
```

Replace with:

```js
      {answered && isCombo && comboStep === 0 ? (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleComboContinue}>Tiếp tục</button>
      ) : answered ? (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>Thẻ tiếp theo →</button>
      ) : null}
```

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no lib behavior changed in this task, confirms no regressions)

Run: `npx vite build`
Expected: build succeeds with no errors

- [ ] **Step 8: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: add new_combo two-step first-encounter flow"
```

---

### Task 6: `StudyScreen.jsx` — reveal panel shows all example sentences

**Files:**
- Modify: `src/screens/StudyScreen.jsx`

**Interfaces:**
- Consumes: `examplePairs` from Task 4

- [ ] **Step 1: Replace the single-sentence reveal block with a list**

Find (current lines 264-273, single-sentence version):

```js
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
```

Replace with:

```js
          {examplePairs.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Example sentence</div>
              {examplePairs.map((pair, i) => (
                <div key={i} style={{ marginTop: i > 0 ? 12 : 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{pair.sentence}</div>
                  <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{pair.meaning}</span>
                    <button className="btn" style={{ borderRadius: '50%', width: 20, height: 20, padding: 0 }} onClick={() => speak(pair.sentence)} aria-label="Phát âm">🔊</button>
                  </div>
                </div>
              ))}
            </div>
          )}
```

- [ ] **Step 2: Build to confirm no syntax errors**

Run: `npx vite build`
Expected: build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "feat: show all example sentences in the reveal panel"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and log in**

Run the app (`npx vite` or the project's existing dev script) and open it in the browser. Log in with a test account.

- [ ] **Step 2: Seed a test word with two example sentences**

Go to the Vocabulary screen, create (or edit) a word, e.g.:
- Word: `savings account`
- Meaning: `tài khoản tiết kiệm`
- Category: pick a category shared by at least 3 other words (needed for same-category distractors)
- Example: `I just bought a new car, and now I have very little money left in my savings account.()Please transfer the bonus into my savings account before Friday.`
- Example (VI): `Tôi vừa mua xe mới nên tài khoản tiết kiệm còn rất ít tiền.()Vui lòng chuyển khoản tiền thưởng vào tài khoản tiết kiệm trước thứ Sáu.`

- [ ] **Step 3: Verify the `new_combo` first card**

Open the Study screen with this word due as new (`correct_count === 0`). Confirm:
- The card first shows the English word and 4 Vietnamese meaning options (this is combo step 0, `mc_en_vi`).
- After picking any option, the correct/incorrect coloring is revealed and the button reads **"Tiếp tục"** (not "Thẻ tiếp theo →"), and the meaning/example reveal panel is NOT shown yet.
- Clicking "Tiếp tục" shows a blanked sentence with 4 word options (combo step 1, `mc_sentence`), e.g. `I just bought a new car, and now I have very little money left in my ____.`
- After picking an option, the full reveal panel (meaning, example sentences with 🔊 buttons, segments if any) appears, and the button now reads **"Thẻ tiếp theo →"**.
- Click it, then reopen the same word before it's due again is not possible from the UI — instead, confirm via the Vocabulary screen that `correct_count` progressed only if **both** combo answers were correct; picking one wrong answer (in a second test pass) keeps the word from advancing (still shows `new_combo` again next time it's due).

- [ ] **Step 4: Verify the remaining progression**

Continue answering correctly through subsequent due cycles for the same word (using "Xem đáp án" or waiting isn't required — reuse a second seeded word already at higher `correct_count` if the review scheduler delays are inconvenient to wait through) and confirm in order:
- `correct_count === 1` → `mc_vi_en` (Vietnamese meaning shown, pick the English word)
- `correct_count === 2` → `mc_sentence` (blanked sentence, pick the English word) — or `mc_vi_en` if the word has no usable example
- `correct_count === 3` → `segment` if the word has a `segments` value, else `full_type`
- `correct_count >= 4` → always `full_type`, even for a word with `segments` set

- [ ] **Step 5: Verify the standalone `mc_sentence` fallback**

Edit a word to have an `example` where the word text does not literally appear (e.g. example only contains a conjugated form), leave `segments` empty, and confirm that at `correct_count === 2` the app falls back to `mc_vi_en` instead of showing a broken/empty blank.

- [ ] **Step 6: Run the full automated test suite one more time**

Run: `npx vitest run`
Expected: PASS (all suites: `csv`, `auth`, `scheduler`, `dailyQueue`, `exerciseType`, `sentenceBlank`)
