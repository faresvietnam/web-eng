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
