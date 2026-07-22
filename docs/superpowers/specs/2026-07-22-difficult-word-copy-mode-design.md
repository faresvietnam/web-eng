# Difficult-word copy mode — design

## Problem

Today, every `full_type` exercise (including for `difficult` words) hides the
word and only shows the Vietnamese meaning as a prompt — the learner must
recall the English word from memory alone. For words already marked
`difficult` (3+ failures), this is too demanding: they need a lower-friction
drill where they can see the full word info and simply copy it, to rebuild
familiarity before being asked to recall it unaided again.

## Scope

Front-end only, contained to [src/screens/StudyScreen.jsx](../../../src/screens/StudyScreen.jsx).
No changes to `lib/exerciseType.js`, no API changes, no schema changes.
`exercise_type` stays `'full_type'` for both difficult and non-difficult
cases; the component distinguishes them using `status`, which is already
available from `card.review_state.status`.

## Behavior

Define `isDifficultCopy = exercise_type === 'full_type' && status === 'difficult'`.

When `isDifficultCopy` is true and the card is not yet answered:

- Show the full word-detail block immediately (word, IPA, meaning, example,
  example_vi) — the same block currently rendered only after `answered`
  (lines 240–270 today).
- Below it, show a single text input labeled "Chép lại từ tiếng Anh:"
  instead of the current "Nhập từ tiếng Anh cho nghĩa: ..." prompt (no need
  to repeat the meaning since it's already shown above).
- Hide the "Xem đáp án" button — the answer is already fully visible, so a
  reveal action is redundant.

For all other `full_type` occurrences (normal words that reached
`correct_count >= 2` with no segments), behavior is unchanged: word hidden,
only the meaning shown as the prompt, "Xem đáp án" button present.

`mc_en_vi`, `mc_vi_en`, and `segment` exercises are unaffected.

## Scoring

No change to `handleFullWordSubmit`: correct entry → `good`/`hard` (depending
on whether a mistake was made first); incorrect entry → shows an inline error
and lets the learner retry. Since "Xem đáp án" is hidden in copy mode, the
only way to advance is typing the word correctly — there's no `again` exit
path within this exercise (consistent with it being a copy/familiarity drill
rather than a graded recall check, though a wrong keystroke still counts as
a mistake and downgrades the eventual outcome to `hard`).

## Out of scope

- No change to how words become `difficult` (still 3 failures in the
  scheduler).
- No change to how a `difficult` word "graduates" back to `learning`.
- No new `exercise_type` value, no DB migration.
