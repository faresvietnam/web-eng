-- supabase/migrations/0005_prefix_root_suffix.sql
create table prefixes (
  id bigint generated always as identity primary key,
  prefix text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, prefix)
);

create table roots (
  id bigint generated always as identity primary key,
  root text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, root)
);

create table suffixes (
  id bigint generated always as identity primary key,
  suffix text not null,
  meaning text,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, suffix)
);

alter table prefixes enable row level security;
alter table roots enable row level security;
alter table suffixes enable row level security;

create policy "own rows" on prefixes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on roots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on suffixes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table words
  add column prefix_id bigint references prefixes(id) on delete set null,
  add column root_id bigint references roots(id) on delete set null,
  add column suffix_id bigint references suffixes(id) on delete set null,
  drop column segments;
