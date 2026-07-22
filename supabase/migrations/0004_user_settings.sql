create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_daily_limit integer not null default 20,
  review_daily_limit integer not null default 100
);

alter table user_settings enable row level security;

create policy "own rows" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
