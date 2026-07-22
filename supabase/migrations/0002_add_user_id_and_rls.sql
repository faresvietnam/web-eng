-- supabase/migrations/0002_add_user_id_and_rls.sql
alter table words add column user_id uuid references auth.users(id) on delete cascade;
alter table review_state add column user_id uuid references auth.users(id) on delete cascade;
alter table review_log add column user_id uuid references auth.users(id) on delete cascade;
alter table daily_progress add column user_id uuid references auth.users(id) on delete cascade;

create policy "own rows" on words for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on review_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on review_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on daily_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
