# Word type / component structure redesign

Date: 2026-07-23

## Goal

Replace the fixed 1-prefix + 1-root + 1-suffix model (`prefixes`/`roots`/
`suffixes` tables, `words.prefix_id/root_id/suffix_id`) with a general,
ordered component model that matches:

```ts
type WordType = "simple" | "derived" | "compound" | "compound_derived";
type ComponentType = "root" | "prefix" | "suffix" | "combining_form";
type RootSubtype = "free_root" | "bound_root";
```

Motivations:
1. Support words with more than one root (compounds like "blackboard") and a
   fourth component kind, `combining_form` (e.g. the "-o-" in "speedometer").
2. Classify every word by formation (`word_type`), derived automatically
   from its components — no manual field, always consistent with the data.
3. Roots can be tagged `free_root` (stands alone, e.g. "act") or
   `bound_root` (never stands alone, e.g. "-ceive").

## Data model — migration `0006_components.sql`

One shared table for all component kinds, plus an ordered join table to
`words` (replacing the fixed `prefix_id/root_id/suffix_id` columns):

```sql
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
```

`meaning` and `root_subtype` are nullable: a component can exist with no
meaning yet (created via find-or-create while saving a word) and get filled
in later from the management screen; `root_subtype` only applies when
`component_type = 'root'`.

### Data migration (same migration file)

Existing data is carried over, not dropped:
1. Insert into `components` from each of `prefixes`/`roots`/`suffixes`,
   setting `component_type` to `'prefix'`/`'root'`/`'suffix'` respectively
   (`root_subtype` stays null — unknown from old data).
2. For each word with a non-null `prefix_id`/`root_id`/`suffix_id`, insert
   `word_components` rows joining to the matching new `components` row
   (matched by `user_id, component_type, text`), with `position` assigned
   sequentially (0, 1, 2, …) in prefix → root → suffix order, skipping
   absent ones (e.g. a word with only root+suffix gets positions 0 and 1).
3. Drop `words.prefix_id`, `words.root_id`, `words.suffix_id`.
4. Drop `prefixes`, `roots`, `suffixes` tables.

### `word_type` — computed, not stored

No `word_type` column anywhere. It's derived at read time from a word's
component list, in a new `lib/wordType.js`:

```js
function deriveWordType(components) {
  const rootCount = components.filter((c) => c.component_type === 'root').length;
  const hasAffix = components.some((c) => c.component_type === 'prefix' || c.component_type === 'suffix');
  if (rootCount === 0) return 'simple';
  if (rootCount === 1) return hasAffix ? 'derived' : 'simple';
  return hasAffix ? 'compound_derived' : 'compound';
}
```

(`combining_form` components don't affect the classification — they attach
between roots but aren't affixes or roots themselves.)

## API changes

- `lib/upsertWordPart.js` → **`lib/upsertComponent.js`**:
  `upsertComponent(supabase, componentType, text, userId, rootSubtype)` —
  find-or-create by `(user_id, component_type, text)`; if `rootSubtype` is
  passed and differs from the existing row's, it's updated in place.
- `lib/wordPartsCrud.js` → **`lib/componentsCrud.js`**: `createListHandler()`
  / `createItemHandler()` now scoped by `component_type` (a query/body field)
  instead of by table name.
- `api/prefixes/[[...id]].js`, `api/roots/[[...id]].js`,
  `api/suffixes/[[...id]].js` → single **`api/components/[[...id]].js`**.
  `GET /api/components?type=root` lists one kind; `POST` body carries
  `component_type`, `text`, `meaning?`, `root_subtype?`.
- `api/words/index.js` (GET/POST), `api/words/[id].js` (PUT):
  - Request body: `prefix`/`root`/`suffix` text fields → one ordered array
    `components: [{component_type, text, root_subtype?}, ...]`. On
    create/update: each entry is resolved via `upsertComponent`, then the
    word's `word_components` rows are replaced wholesale (delete existing
    for that `word_id`, insert new rows with `position` = array index).
  - Response: `GET` joins
    `word_components(position, component:components(*))`, ordered by
    `position` (`.order('position', { foreignTable: 'word_components' })`),
    and each returned word gets a computed `word_type` field
    (via `deriveWordType`).
  - `?root_id=` query filter (used by the Vocabulary root-filter) becomes a
    filter on `word_components.component_id` through an inner join —
    external behavior (filtering the word list to one root) is unchanged.
- `api/words/import.js`: CSV `prefix,root,suffix` columns → one
  `components` column, pipe-delimited `type:text` tokens (matching this
  app's existing `|`-delimited convention for `example`/`example_vi`):
  `prefix:un|root:believ|suffix:able`; a root token may carry a third
  segment for subtype: `root:act:free_root`. Parsing lives in `lib/csv.js`.
- `api/session/today.js`: same join change as `GET /api/words`; `hasParts`
  becomes `Boolean(state.words.word_components?.length)`.

## Frontend

- `src/api.js`: `getPrefixes/createPrefix/updatePrefix/deletePrefix` (×3 for
  root/suffix, 12 functions total) collapse to
  `getComponents(type)/createComponent/updateComponent/deleteComponent`.
- `WordPartsScreen.jsx` ("Gốc từ"): 4 sections instead of 3 — Prefix / Root /
  Suffix / Combining form — each backed by `/api/components?type=X`. The
  Root section's table gets an extra column: a Free/Bound `<select>` bound
  to `root_subtype`.
- `ImportScreen.jsx` manual form: the 3 fixed prefix/root/suffix inputs
  become a dynamic ordered row list. Each row: a component-type `<select>`
  (prefix/root/suffix/combining_form), a text input, and — only when the
  row's type is `root` — a Free/Bound `<select>`. Controls: "+ Add part"
  appends a row; each row has a remove button and up/down reorder buttons.
  Submit builds the `components` array from the current row order.
  `editingWord` pre-fill reads `editingWord.word_components` (sorted by
  `position`) into the row list.
- `WordBreakdown.jsx`: replaces its fixed `PART_CONFIG` (prefix/root/suffix)
  with iterating `word.word_components` sorted by `position`; renders one
  chip + meaning per component, `+` between them, same as today. The root
  chip (`component_type === 'root'`) stays clickable via `onRootClick` when
  provided; other types render as plain text, matching current behavior.
- `StudyScreen.jsx`: the `parts` useMemo builds its list from
  `word.word_components` (sorted by `position`) instead of the 3 fixed
  fields; the rest of the exercise (random hidden index, text match against
  the hidden part's text) is unchanged.
- `VocabularyScreen.jsx`: adds a new "Cấu tạo" column rendering the word's
  computed `word_type` as a small tag. The existing "Loại từ" column
  (part-of-speech) is untouched.

## Out of scope

- No filtering/searching by `word_type` — display only.
- No manual override of `word_type` — always derived.
- `combining_form` chips are not clickable/filterable, same restriction as
  prefix/suffix today (only `root` is, per the existing root-click-to-filter
  feature).
- No change to `lib/scheduler.js`, `lib/dailyQueue.js`, or the
  `mc_sentence`/`new_combo`/`mc_vi_en`/`mc_en_vi` exercise types.

## Testing

- `lib/wordType.test.js` (new): table of component-list inputs →
  expected `word_type`, covering all 4 outcomes plus a `combining_form`-only
  case (should be `simple`, since it has no root).
- `lib/upsertComponent.test.js` (renamed from `upsertWordPart.test.js`):
  existing `(type, text)` returns existing id; new returns new row;
  blank/whitespace text returns `null`; passing a different `root_subtype`
  updates the existing row.
- `lib/componentsCrud.test.js` (renamed from `wordPartsCrud.test.js`):
  same list/item handler behavior, parameterized by `component_type`.
- `lib/exerciseType.test.js`: unchanged (still keyed on `hasParts` boolean).
- Manual verification in the browser:
  1. Gốc từ screen: create a root with a Free/Bound subtype and a meaning,
     edit both, delete it; create a combining_form entry.
  2. Import screen manual form: build a word with 4 components in a
     non-default order (e.g. root, combining_form, root, suffix — a
     compound_derived word); save, reopen for edit, confirm the row order
     and subtype survive.
  3. CSV import: a row with `components` = `root:act:free_root|suffix:ion`;
     confirm the word appears with the derived `word_type` = `derived`.
  4. Vocabulary list: confirm the new "Cấu tạo" column shows the right
     `word_type` for words with 0, 1, and 2+ roots.
  5. Dashboard preview / Study reveal panel: breakdown chips render in
     saved order with meanings underneath; root chip still navigates to the
     filtered Vocabulary list on click.
  6. Study session: a word with 2+ components still hits the `parts`
     exercise and hides one random component each time.
