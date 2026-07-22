# Difficult-Word Copy Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For words with `status === 'difficult'`, the `full_type` exercise in Study mode shows the full word info (word, IPA, meaning, example) upfront and asks the learner to copy the English word into an input, instead of hiding the word and asking them to recall it from the meaning alone.

**Architecture:** Front-end-only change to `src/screens/StudyScreen.jsx`. No new `exercise_type` value, no API or schema change — the component derives copy-mode from the existing `exercise_type === 'full_type'` and `status === 'difficult'` values it already has in scope.

**Tech Stack:** React (existing StudyScreen component), Vitest (existing unit tests for `lib/`, unaffected by this change).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-difficult-word-copy-mode-design.md`.
- No changes to `lib/exerciseType.js`, `lib/scheduler.js`, any API route, or the database schema.
- No new dependencies. This codebase has no component-test infrastructure (no jsdom/React Testing Library — `vitest.config.js` runs in `environment: 'node'` and only `lib/*` pure functions are unit-tested). Do not add one for this change; verify visually via the dev server, matching how every other screen in this codebase is verified.
- Scoring behavior (`handleFullWordSubmit`) must not change: correct entry → `good`/`hard` depending on prior mistake; incorrect entry → inline error, retry, no automatic `again`.

---

### Task 1: Difficult-word copy mode in StudyScreen

**Files:**
- Modify: `src/screens/StudyScreen.jsx:139` (add `isDifficultCopy`, extend `showWordHeading`)
- Modify: `src/screens/StudyScreen.jsx:224-238` (full_type form: conditional prompt, hide "Xem đáp án")
- Modify: `src/screens/StudyScreen.jsx:240-274` (detail block: show pre-answer in copy mode; move "Thẻ tiếp theo →" button out of that block so it still only shows post-answer)

**Interfaces:**
- Consumes: existing in-scope values `exercise_type`, `status`, `word`, `segments`, `answered`, `textInput`, `inputError`, `handleFullWordSubmit`, `handleShowAnswer`, `goNext`, `speak` — no new props or functions from outside this file.
- Produces: new local variable `isDifficultCopy` (boolean), used only within this component. Nothing else in the codebase depends on it.

- [ ] **Step 1: Add `isDifficultCopy` and extend `showWordHeading`**

In `src/screens/StudyScreen.jsx`, replace line 139:

```jsx
const showWordHeading = answered || exercise_type === 'mc_en_vi';
```

with:

```jsx
const isDifficultCopy = exercise_type === 'full_type' && status === 'difficult';
const showWordHeading = answered || exercise_type === 'mc_en_vi' || isDifficultCopy;
```

- [ ] **Step 2: Update the full_type form to branch on `isDifficultCopy`**

Replace the block at lines 224-238:

```jsx
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
```

with:

```jsx
      {!answered && exercise_type === 'full_type' && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>{isDifficultCopy ? 'Chép lại từ tiếng Anh:' : `Nhập từ tiếng Anh cho nghĩa: "${word.meaning}"`}</p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            {!isDifficultCopy && (
              <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
            )}
          </div>
        </form>
      )}
```

- [ ] **Step 3: Show the detail block pre-answer in copy mode, keep the "next card" button post-answer only**

Replace the block at lines 240-274:

```jsx
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
```

with:

```jsx
      {(answered || isDifficultCopy) && (
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
        </div>
      )}

      {answered && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>Thẻ tiếp theo →</button>
      )}
```

- [ ] **Step 4: Run the existing unit test suite to confirm no regressions**

Run: `npm test`
Expected: all existing tests in `tests/*.test.js` still pass (this change touches no file they cover, so this is a safety check, not a new-coverage check).

- [ ] **Step 5: Manually verify in the browser**

This codebase has no automated tests for `screens/*` — every screen is verified by running the dev server and using the feature, and this task follows that convention.

1. Start the dev server: `npm run dev`.
2. Sign in, go to **Vocabulary**, pick any word, click **Sửa**, and set it up so it will hit the `difficult` path — the fastest way is to answer that word "again" (fail it) 3 times in **Learn** mode until its status badge shows `difficult` (per `lib/scheduler.js`, `failure_count >= 3` flips status to `difficult`).
3. Go to **Learn** and reach that word again. Confirm:
   - The word, IPA, meaning, and example are all visible immediately (not hidden).
   - There is a text input below labeled "Chép lại từ tiếng Anh:".
   - The "Xem đáp án" button is **not** present.
   - The "Thẻ tiếp theo →" button is **not** present yet (only after submitting).
4. Type the word incorrectly: confirm the input shows the error state (`input-error` class / red outline) and lets you retry, without advancing.
5. Type the word correctly: confirm it advances to the answered state and "Thẻ tiếp theo →" appears.
6. Separately, confirm a non-difficult `full_type` word (a `learning`-status word with `correct_count >= 2` and no segments) still shows the old hidden-word behavior with "Xem đáp án" present — this path must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/screens/StudyScreen.jsx
git commit -m "$(cat <<'EOF'
feat: show full word info for difficult-word copy drills

Difficult words already failed recall 3 times, so full_type now shows
the word/IPA/meaning/example upfront and asks the learner to copy the
word instead of hiding it — reveal button is redundant once the answer
is already visible.
EOF
)"
```
