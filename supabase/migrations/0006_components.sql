-- supabase/migrations/0006_components.sql
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

-- Migrate existing prefix/root/suffix rows into the shared components table.
insert into components (component_type, text, meaning, user_id, created_at)
select 'prefix', prefix, meaning, user_id, created_at from prefixes;

insert into components (component_type, text, meaning, user_id, created_at)
select 'root', root, meaning, user_id, created_at from roots;

insert into components (component_type, text, meaning, user_id, created_at)
select 'suffix', suffix, meaning, user_id, created_at from suffixes;

-- Migrate each word's prefix_id/root_id/suffix_id into word_components rows.
-- Fixed slots (0=prefix, 1=root, 2=suffix) rather than a gapless sequence:
-- consumers only ever sort by `position` ascending, so gaps (e.g. a word
-- with only root+suffix landing on positions 1 and 2) are harmless.
insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 0, w.user_id
from words w
join prefixes p on p.id = w.prefix_id
join components c on c.component_type = 'prefix' and c.user_id = w.user_id and c.text = p.prefix
where w.prefix_id is not null;

insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 1, w.user_id
from words w
join roots r on r.id = w.root_id
join components c on c.component_type = 'root' and c.user_id = w.user_id and c.text = r.root
where w.root_id is not null;

insert into word_components (word_id, component_id, position, user_id)
select w.id, c.id, 2, w.user_id
from words w
join suffixes s on s.id = w.suffix_id
join components c on c.component_type = 'suffix' and c.user_id = w.user_id and c.text = s.suffix
where w.suffix_id is not null;

alter table words
  drop column prefix_id,
  drop column root_id,
  drop column suffix_id;

drop table prefixes;
drop table roots;
drop table suffixes;
