# Sentence fill-in-the-blank multiple choice exercise — design

Date: 2026-07-22

## Goal

Add a new multiple-choice exercise type that shows a sentence with the target
word blanked out, and asks the learner to pick the correct word from 4
options — modeled on the example:

```
1) I just bought a new car, and now I have very little money left in my
.
A. savings account
B. statement
C. stock market
```

It slots into the existing spaced-repetition exercise progression
(`lib/exerciseType.js`), and the first encounter of a word must require
completing both the meaning-choice question and the sentence-choice question
before it counts as progress.

## Data model — no schema change

`words.example` and `words.example_vi` (existing text columns) can now hold
**multiple** sentence/meaning pairs, delimited by `()` — the same pattern
`segments` already uses with `|`.

Example `example`:
```
I just bought a new car, and now I have very little money left in my savings account.()The monthly statement arrived late again.
```
Example `example_vi` (same order):
```
Tôi vừa mua xe mới nên giờ tài khoản tiết kiệm còn rất ít tiền.()Bảng sao kê hàng tháng lại đến muộn.
```

Each sentence is auto-blanked: the app finds the first case-insensitive,
whole-word match of `word.word` inside the sentence and replaces it with
`____`. A sentence with no match for the word is not usable for the
`mc_sentence` question (but is still shown as plain text in the reveal
panel).

A single legacy sentence (no `()`) continues to work unchanged (parses to a
one-item list).

### New shared helper: `lib/sentenceBlank.js`

```js
parseSentencePairs(example, example_vi) // -> [{ sentence, meaning }]
buildBlank(sentence, wordText)          // -> blanked string, or null if no match
hasUsableSentence(example, wordText)    // -> boolean, any sentence blankable
```

CommonJS module, used server-side (`api/session/today.js`) to compute the
`hasExample` flag, and unit-tested directly (mirrors how `lib/exerciseType.js`
is tested). The client (`StudyScreen.jsx`) reimplements the same blanking
logic locally (as a small local helper, consistent with the existing
`buildMcOptions` pattern) since it already has the full `word` object and
does not import from `lib/`.

## Exercise progression (`lib/exerciseType.js`)

`pickExerciseType` gains a `hasExample` parameter (parallel to the existing
`hasSegments`):

```
status === 'difficult'        → full_type
correct_count === 0            → new_combo
correct_count === 1            → mc_vi_en
correct_count === 2            → hasExample ? mc_sentence : mc_vi_en
correct_count === 3            → hasSegments ? segment : full_type
correct_count >= 4             → full_type   (always — segment never recurs)
```

`api/session/today.js` computes `hasExample: hasUsableSentence(state.words.example, state.words.word)`
next to the existing `hasSegments: Boolean(state.words.segments)`, and passes
both into `pickExerciseType`.

## `mc_sentence` question

- One usable sentence is chosen (memoized per word, like the existing
  `mcOptions` memo) and rendered as the question, with the blank shown
  in place of the word.
- The 4 answer options are words (not meanings), generated with the same
  same-category-random distractor logic already used for `mc_vi_en`:
  `buildMcOptions(word, distractorPool, (w) => w.word)`.
- On answering, the chosen word is spoken via `speak()`, same as `mc_vi_en`
  today.

## `new_combo` flow (first encounter, `correct_count === 0`)

One card presents two sub-questions in sequence before advancing:

1. **Step 0 — `mc_en_vi`** (pick the Vietnamese meaning for the shown word).
   Selecting an option reveals correct/incorrect coloring, same as today's
   `mc_en_vi`, but the "Next card" button is replaced by **"Tiếp tục"**,
   which advances to step 1 — regardless of whether step 0 was right or
   wrong.
2. **Step 1 — `mc_sentence`** (or `mc_vi_en` if the word has no usable
   sentence). Selecting an option reveals correct/incorrect coloring. This
   is the final step: the normal reveal panel (meaning / segments /
   examples) appears below it, and the button is the normal **"Thẻ tiếp
   theo →"**.

Only **one** `POST /reviews/:wordId` call fires, after step 1, with:
- `exercise_type: 'new_combo'`
- `result: 'good'` only if **both** steps were answered correctly on the
  first try; otherwise `result: 'again'`.

This is compatible with the existing scheduler unchanged: `lib/scheduler.js`
only distinguishes `'again'` vs. not-`'again'` while `status === 'new'` (the
"fixed phase"), so no scheduler changes are needed. A wrong answer in either
step resets `correct_count` to 0 (existing behavior), so the next card is
`new_combo` again — repeating until both parts are answered correctly in the
same attempt.

## Reveal panel changes

Currently renders a single example sentence + meaning. Since a word may now
have multiple sentence/meaning pairs, the reveal panel renders the full list
(via `parseSentencePairs`), each with its own 🔊 speak button, replacing the
single-sentence block.

## Out of scope

- No changes to CSV import or the word-editing form — operators type
  multiple sentences into the existing `example` / `example_vi` textareas
  using `()` as the separator themselves.
- No changes to `lib/scheduler.js` or `lib/dailyQueue.js`.
- No database migration.

## Testing

- `lib/sentenceBlank.test.js` (new): parsing multi-sentence fields, blank
  building (match found / not found / case-insensitive / whole-word only),
  legacy single-sentence input.
- `lib/exerciseType.test.js` (updated): new progression table including
  `new_combo`, `mc_sentence`, the `hasExample` fallback to `mc_vi_en`, and
  the `correct_count === 3` vs. `>= 4` segment/full_type split.
- Manual verification in the browser: run through a brand-new word's first
  card (combo, both right / one wrong), then subsequent cards through
  `mc_vi_en` → `mc_sentence` → `segment` → `full_type`.
