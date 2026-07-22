# Google Auth (multi-user) — Design

## Bối cảnh

App vocab hiện tại (React + Vite SPA, Vercel serverless functions, Supabase Postgres) là single-user: không có `user_id` ở bất kỳ bảng nào, backend dùng Supabase **service-role key** cho mọi API (bỏ qua RLS hoàn toàn).

Mục tiêu: chuyển sang **multi-user thật** — mỗi người đăng nhập bằng Google có kho từ vựng riêng, hoàn toàn tách biệt. Bất kỳ ai có Google account đều đăng nhập/đăng ký được (không giới hạn allowlist).

Project Supabase đang dùng: `whsyzhsvsmyzdaxqrvoi` (web-eng), region ap-southeast-2. Bảng hiện có: `words` (45 rows), `review_state` (45), `review_log` (76), `daily_progress` (2). RLS đã **enabled** trên cả 4 bảng nhưng chưa có policy nào (mọi truy cập qua service-role key nên RLS chưa từng có hiệu lực).

## Kiến trúc

**Supabase Auth (Google OAuth provider) + Row Level Security**, thay cho service-role key + filter thủ công.

- Frontend dùng `supabase-js` (anon key) để đăng nhập Google, quản lý session, gắn access token vào mọi API call.
- Mỗi bảng dữ liệu thêm cột `user_id uuid references auth.users(id) on delete cascade`, mặc định `auth.uid()`.
- RLS policy: `user_id = auth.uid()` cho tất cả các thao tác (select/insert/update/delete).
- Backend không còn dùng service-role key. Mỗi request tạo Supabase client bằng **anon key + JWT của user** (`Authorization: Bearer <token>`) → Postgres tự lọc theo `user_id`, code query hiện tại **không cần sửa logic filter** vì RLS làm việc đó ở tầng DB.

Lý do chọn cách này (so với tự verify JWT + filter tay bằng service-role key): DB tự chặn ở tầng Postgres, không phụ thuộc việc code JS có nhớ filter đúng ở từng handler hay không — an toàn hơn nhiều và ít code hơn.

## Database migration

Thứ tự (áp dụng qua Supabase MCP `apply_migration`, không cần user tự mở SQL editor):

1. **Migration DDL** (`supabase/migrations/0002_auth.sql`), cột `user_id` để **nullable** trước (không thể `not null default auth.uid()` ngay vì SQL editor/migration không có JWT context, `auth.uid()` sẽ là NULL):

```sql
alter table words add column user_id uuid references auth.users(id) on delete cascade;
alter table review_state add column user_id uuid references auth.users(id) on delete cascade;
alter table review_log add column user_id uuid references auth.users(id) on delete cascade;
alter table daily_progress add column user_id uuid references auth.users(id) on delete cascade;

alter table daily_progress drop constraint daily_progress_pkey;
alter table daily_progress add primary key (user_id, date);

create policy "own rows" on words for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on review_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on review_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on daily_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

2. **Bước thủ công của owner** (không có tool nào thay được): tạo Google OAuth Client ID/Secret trên Google Cloud Console, cấu hình trong Supabase Dashboard → Authentication → Providers → Google (kèm Authorized redirect URI theo domain Supabase project). Checklist chi tiết sẽ đưa ở bước implementation.

3. Owner đăng nhập Google vào app **một lần** → Supabase tạo `auth.users` row thật với UID thật (không thể fake bằng SQL).

4. Backfill: dùng `execute_sql` tra UID theo email owner trong `auth.users`, chạy `update ... set user_id = '<uid>' where user_id is null` cho cả 4 bảng, sau đó `alter column user_id set not null` và `set default auth.uid()` (đợt migration thứ 2, sau khi đã backfill).

## Backend (Vercel functions)

- `lib/supabaseClient.js`: sửa `getSupabaseClient(accessToken)` — tạo client bằng **anon key** (`SUPABASE_ANON_KEY`, env mới) + header `Authorization: Bearer <token>`. Bỏ dùng service-role key trong runtime API (giữ lại nếu cần cho script nội bộ, nhưng không dùng trong `api/**`).
- Thêm `lib/auth.js`: `requireUser(req, res)` đọc header `Authorization`; thiếu/invalid → response `401` và return `null`; hợp lệ → trả về token.
- 7 file trong `api/**/*.js` (`words/index.js`, `words/[id].js`, `words/import.js`, `dashboard/index.js`, `dashboard/reviews-chart.js`, `reviews/[wordId].js`, `session/today.js`): thêm gọi `requireUser` ở đầu handler, đổi `getSupabaseClient()` → `getSupabaseClient(token)`. Không sửa logic query nào khác — RLS tự lọc.
- Env mới cần thêm vào Vercel: `SUPABASE_ANON_KEY` (public, an toàn để lộ ra client, nhưng backend cũng dùng lại).

## Frontend

- `src/supabaseClient.js` (mới): browser client dùng `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (env mới, cần set trong Vercel + `.env` local).
- `src/screens/LoginScreen.jsx` (mới): màn hình đăng nhập với nút "Đăng nhập với Google" → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.
- `src/App.jsx`: theo dõi session qua `supabase.auth.getSession()` + `onAuthStateChange`. Chưa có session → render `LoginScreen` thay toàn bộ layout. Có session → giữ layout hiện tại, thêm nút "Đăng xuất" (`supabase.auth.signOut()`) trong sidebar footer.
- `src/api.js`: mỗi `request()` lấy session hiện tại (`supabase.auth.getSession()`) và gắn `Authorization: Bearer <access_token>` vào header trước khi gọi `fetch`.

## Testing

- `tests/` hiện có unit test cho `lib/scheduler.js`, `lib/dailyQueue.js` (theo cấu trúc thấy được) — các hàm này không đổi logic, không cần sửa test.
- Thêm test cho `lib/auth.js`: request có/không có header `Authorization` → đúng hành vi `401`/pass-through token.
- Không viết test tự động cho luồng OAuth Google thật (cần trình duyệt thật, cookie, redirect) — sẽ verify bằng tay: đăng nhập bằng 2 Google account khác nhau, xác nhận mỗi account chỉ thấy từ vựng của mình.

## Rủi ro / giới hạn đã biết

- Việc cấu hình Google OAuth credentials là thao tác thủ công ngoài code, không tự động hóa được.
- Backfill dữ liệu cũ (45 words, 76 review_log, 2 daily_progress) về đúng 1 owner là thao tác dữ liệu một lần, phụ thuộc owner đăng nhập trước — không thể làm trước khi có UID thật.
- Sau khi bật RLS với policy thật, nếu quên xoá code dùng service-role key ở đâu đó thì bảo mật vẫn giữ nguyên (RLS luôn áp dụng trừ khi dùng service-role key) — nhưng cần rà soát kỹ để không vô tình để lại một endpoint dùng service-role key mà quên filter user_id.
