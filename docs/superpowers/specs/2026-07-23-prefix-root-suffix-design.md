# Prefix / Root / Suffix with meanings — design

Date: 2026-07-23

## Goal

Replace the free-text `segments` field (`"beauty|ful"`) with a structured
**prefix / root / suffix** breakdown per word, where each part is a reusable
entry with its own **meaning**, editable from a dedicated management screen.

1. Wherever a word's breakdown is shown, each part's meaning is shown below it.
2. Clicking a **root** chip navigates to the Vocabulary list filtered to
   words sharing that root.
3. A word may have any combination of the three parts present (0–3) — most
   words won't have all three (see examples: "act" has none, "action" has
   root+suffix, "react" has prefix+root, "unbelievable" has all three).
4. The Study screen's breakdown exercise now hides one **randomly chosen**
   available part instead of walking through segments in order.

Old `segments` data is not migrated — the column is dropped.

## Data model — migration `0005_prefix_root_suffix.sql`

Three new reference tables, one per part type, all RLS-scoped by `user_id`
like `words`:

```sql
create table prefixes (
  id bigint generated always as identity primary key,
  prefix text not null,
  meaning text,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, prefix)
);

create table roots (
  id bigint generated always as identity primary key,
  root text not null,
  meaning text,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, root)
);

create table suffixes (
  id bigint generated always as identity primary key,
  suffix text not null,
  meaning text,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, suffix)
);

-- RLS: identical policy shape to `words` (owner-only select/insert/update/delete)
alter table prefixes enable row level security;
alter table roots enable row level security;
alter table suffixes enable row level security;
-- (policies mirror the existing words policies in 0002_add_user_id_and_rls.sql)

alter table words
  add column prefix_id bigint references prefixes(id) on delete set null,
  add column root_id bigint references roots(id) on delete set null,
  add column suffix_id bigint references suffixes(id) on delete set null,
  drop column segments;
```

`meaning` is nullable: a part row can exist with no meaning yet (created via
find-or-create while saving a word) and get its meaning filled in later from
the management screen.

## Find-or-create on word save

When a word is created/updated with prefix/root/suffix **text** (not an id),
the server resolves it to a row in the matching table:

```js
// lib/upsertWordPart.js
async function upsertWordPart(supabase, table, column, text, userId) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase
    .from(table).select('id').eq(column, trimmed).eq('user_id', userId).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from(table).insert({ [column]: trimmed, user_id: userId }).select('id').single();
  if (error) throw error;
  return created.id;
}
```

Used by `api/words/index.js` (POST), `api/words/[id].js` (PUT), and
`api/words/import.js` (CSV import), replacing the raw `segments` passthrough.
Single-user personal app — no concurrency handling needed beyond the
`unique(user_id, text)` constraint already preventing duplicate rows.

## API changes

- `api/words/index.js` GET: select now joins the three tables —
  `.select('*, review_state!inner(*), prefix:prefixes(*), root:roots(*), suffix:suffixes(*)')`.
  Also accepts `?root_id=` to filter (`query.eq('root_id', ...)`), used by
  the Vocabulary root-filter (requirement 2).
- `api/words/index.js` POST / `api/words/[id].js` PUT: request body carries
  `prefix`, `root`, `suffix` (plain text, replacing `segments`); each is
  resolved via `upsertWordPart` before the `words` insert/update.
- `api/words/import.js`: CSV columns `prefix,root,suffix` replace `segments`
  (`lib/csv.js` `OPTIONAL_HEADERS`); each row's three text values are
  resolved via `upsertWordPart` before insert.
- `api/session/today.js`: `words(*)` joins become
  `words(*, prefix:prefixes(*), root:roots(*), suffix:suffixes(*))`; the
  `hasSegments` flag passed to `pickExerciseType` becomes
  `hasParts: Boolean(state.words.prefix_id || state.words.root_id || state.words.suffix_id)`.

### New CRUD endpoints for the management screen

One shared handler factory, three thin route files per HTTP verb pattern
(matching the existing `api/words/index.js` + `[id].js` split):

- `lib/wordPartsCrud.js` — `createListHandler(table, column)` (GET list, POST
  create) and `createItemHandler(table, column)` (PUT update meaning/text,
  DELETE) — both scoped to `user_id`, same shape as the words handlers.
- `api/prefixes/index.js`, `api/prefixes/[id].js`
- `api/roots/index.js`, `api/roots/[id].js`
- `api/suffixes/index.js`, `api/suffixes/[id].js`

Delete uses `on delete set null` on `words`, so deleting a part just clears
it from any words that used it (no cascade block).

`src/api.js` gains:
```js
getPrefixes / createPrefix / updatePrefix / deletePrefix
getRoots / createRoot / updateRoot / deleteRoot
getSuffixes / createSuffix / updateSuffix / deleteSuffix
```

## New screen: "Gốc từ" (`src/screens/WordPartsScreen.jsx`)

Added to `App.jsx`'s `TABS` between Import and Settings. Three stacked
`card` sections (Prefix / Root / Suffix), each a simple table: text +
meaning columns, inline edit, delete, and an "add new" row — following the
existing `card`/`input`/`btn` styling, no new UI primitives.

## Shared component: `src/components/WordBreakdown.jsx`

Both `DashboardScreen.jsx` (preview card) and `StudyScreen.jsx` (reveal
panel) currently duplicate the segments-chip block. Since both now need the
same richer rendering (chip + meaning underneath + root click), extract it:

```jsx
<WordBreakdown word={word} onRootClick={onRootClick} />
```

Renders one chip per present part (`prefix`, `root`, `suffix`, in that
order, `+` between consecutive present ones), each chip followed by its
`meaning` in small muted text underneath. The `root` chip is a `<button>`
(styled as the existing chip) calling `onRootClick(word.root)` when present;
`onRootClick` is optional — if not passed (or `word.root` is absent), the
root chip renders as plain non-interactive text like prefix/suffix. Renders
nothing if the word has no prefix/root/suffix at all.

## Root click → filtered Vocabulary list

- `App.jsx` adds `rootFilter` state (`null | {id, root}`) and
  `handleRootClick(root)`: `setRootFilter(root); setActiveTab('vocabulary')`.
- `onRootClick={handleRootClick}` is threaded into `DashboardScreen` and
  `StudyScreen` (which pass it to `WordBreakdown`).
- `VocabularyScreen` gains a `rootFilter` / `onClearRootFilter` prop pair:
  when `rootFilter` is set, `reload()` passes `root_id: rootFilter.id` to
  `api.getWords`, and a dismissible badge ("Gốc từ: **act** ×") renders
  above the results; clicking × calls `onClearRootFilter` (`setRootFilter(null)`
  in `App.jsx`). The existing status pill filter (`FILTERS`) stays independent
  and still applies together with the root filter.

## Study screen exercise (`exercise_type: 'parts'`, replaces `'segment'`)

`lib/exerciseType.js`: rename `hasSegments` param to `hasParts`; return value
`'segment'` → `'parts'` (no other logic change).

`StudyScreen.jsx` breakdown exercise, replacing the segment-index loop:

1. On card load, memoize (keyed on `word`) the list of present parts for the
   word (`[{type: 'prefix', text, id}, {type: 'root', ...}, {type: 'suffix', ...}]`,
   filtered to present ones) and pick one at random as the hidden target —
   same `useMemo`-keyed-on-`word` pattern already used for `blankSentence`.
2. Render the word structure with the other part(s) shown as plain text and
   the hidden one as `____`, e.g. `re + ____ + (none)` for "react" with root
   hidden. A single text input takes the guess for that one part.
3. On correct submit (case-insensitive match against the hidden part's
   text): proceed to the existing "type the full word" step (unchanged).
4. "Xem đáp án" behavior unchanged (marks `again`, reveals answer).

If a word has no parts at all, `hasParts` is `false` and
`pickExerciseType` never returns `'parts'` for it (existing fallback to
`full_type`), so no empty-state UI is needed.

## Reveal panel (both screens)

`word.segments` chip block → `<WordBreakdown word={word} onRootClick={onRootClick} />`,
placing meanings under each chip (requirement 1).

## Import screen (`src/screens/ImportScreen.jsx`)

- `FIELDS` / `EMPTY_FORM`: `segments` → three fields `prefix`, `root`,
  `suffix` (plain text inputs; server resolves via find-or-create).
- `editingWord` pre-fill: `form.prefix = editingWord.prefix?.prefix || ''`
  (same for root/suffix) — reading the joined text, not an id.
- CSV template / format-tip text: `segments` → `prefix,root,suffix`.

## Out of scope

- No autocomplete/typeahead on the prefix/root/suffix text inputs — plain
  text, exact-match find-or-create (consistent with how `category` already
  works today).
- No click-to-filter for prefix/suffix chips — only root, per requirement 2.
- No migration of existing `segments` data.
- No changes to `lib/scheduler.js`, `lib/dailyQueue.js`, or the `mc_sentence`/
  `new_combo` exercise types.

## Testing

- `lib/exerciseType.test.js` (updated): rename `hasSegments` → `hasParts`,
  `'segment'` → `'parts'` in expectations; behavior otherwise unchanged.
- `lib/upsertWordPart.test.js` (new, if a test DB/mock is available in this
  repo's existing test setup — otherwise covered by manual verification):
  existing text returns existing id, new text creates a row, blank/whitespace
  returns `null`.
- Manual verification in the browser:
  1. Gốc từ screen: create a root with meaning, edit it, delete it.
  2. Import screen: save a word with prefix/root/suffix text; confirm rows
     appear in the Gốc từ screen (find-or-create), meaning empty until edited.
  3. Dashboard preview card and Study screen reveal panel: breakdown chips
     show meaning underneath; only present parts render.
  4. Click a root chip → lands on Vocabulary tab filtered to that root;
     × clears the filter.
  5. Study session: a word with 2+ parts hits the `parts` exercise, hides one
     random part each time (repeat a few cards to see it vary), then asks for
     the full word.
  6. A word with zero parts never shows the `parts` exercise (goes straight
     to `full_type` at `correct_count >= 3`).
