-- Backfill đã chạy 1 lần qua Supabase MCP execute_sql với UID owner thật (thanghong195@gmail.com).
-- Template tham khảo (không hard-code UID cụ thể vào migration để tránh rò rỉ/nhầm khi áp lại):
-- update words set user_id = '<OWNER_UID>' where user_id is null;
-- update review_state set user_id = '<OWNER_UID>' where user_id is null;
-- update review_log set user_id = '<OWNER_UID>' where user_id is null;
-- update daily_progress set user_id = '<OWNER_UID>' where user_id is null;

alter table words alter column user_id set not null;
alter table words alter column user_id set default auth.uid();

alter table review_state alter column user_id set not null;
alter table review_state alter column user_id set default auth.uid();

alter table review_log alter column user_id set not null;
alter table review_log alter column user_id set default auth.uid();

alter table daily_progress alter column user_id set not null;
alter table daily_progress alter column user_id set default auth.uid();

alter table daily_progress drop constraint daily_progress_pkey;
alter table daily_progress add primary key (user_id, date);
