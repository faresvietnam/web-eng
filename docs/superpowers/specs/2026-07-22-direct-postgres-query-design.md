# Thiết kế: Thay Supabase API bằng query Postgres trực tiếp

Ngày: 2026-07-22

## 1. Vấn đề

Toàn bộ backend (`api/*.js`, chạy trên Vercel serverless functions) hiện query DB qua `@supabase/supabase-js`, tức là gọi qua PostgREST HTTP API của Supabase. Mỗi request phải đi qua thêm một tầng HTTP + PostgREST trước khi tới Postgres, gây chậm. Mục tiêu: bỏ tầng PostgREST, query Postgres trực tiếp từ serverless functions.

## 2. Phạm vi

- Chỉ đổi tầng kết nối/query trong backend. Không đổi:
  - Supabase vẫn là nơi host Postgres (migrations trong `supabase/migrations/` giữ nguyên).
  - Schema DB.
  - UI (`src/**`) và hợp đồng JSON của các API endpoint — response shape giữ nguyên 100% để `src/api.js` và các screen không cần sửa.
- 7 file dùng `getSupabaseClient()` cần viết lại:
  - `api/words/index.js`, `api/words/[id].js`, `api/words/import.js`
  - `api/dashboard/index.js`, `api/dashboard/reviews-chart.js`
  - `api/session/today.js`
  - `api/reviews/[wordId].js`
- `lib/supabaseClient.js` bị xóa, thay bằng `lib/db.js`.

## 3. Kiến trúc kết nối

Dùng thư viện `postgres` (postgres.js) — thư viện Supabase khuyến nghị cho môi trường serverless/edge.

```js
// lib/db.js
const postgres = require('postgres');
let sql;
function getDb() {
  if (!sql) sql = postgres(process.env.DATABASE_URL, { max: 1 });
  return sql;
}
module.exports = { getDb };
```

- `max: 1`: mỗi lần Vercel function được invoke chạy trong 1 process riêng; giữ tối đa 1 connection, tái sử dụng khi warm start. Kết nối phải đi qua **Supabase Transaction pooler (port 6543)**, không dùng port 5432 trực tiếp (serverless không phù hợp với direct connection không qua pooler).
- Biến môi trường mới: `DATABASE_URL` — connection string dạng `postgres://postgres.[project-ref]:[db-password]@aws-0-[region].pooler.supabase.com:6543/postgres`, lấy từ Supabase Dashboard → Project Settings → Database → Connection string → chọn "Transaction pooler".
  - **Chỉ set ở server-side** (`.env.local`, `.env.example`, Vercel Project env). Tuyệt đối không đặt tên `VITE_`-prefixed vì Vite sẽ bundle nó vào code chạy trên browser.
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` không còn dùng trong `api/*.js` sau khi migrate xong (có thể xóa khỏi `.env.example`, hoặc giữ lại nếu còn dùng cho việc khác — không phát hiện chỗ nào khác dùng chúng trong lần rà soát này).

## 4. Rà soát từng file

Tất cả query dùng tagged template `sql\`...\`` của postgres.js (tự động parameterize, tránh SQL injection). Response JSON trả về giữ nguyên shape hiện tại.

### `api/words/index.js`
- GET: join `words` với `review_state`, filter động theo `status` (nếu có) và `q` (ILIKE trên `word`/`meaning`/`category`, nếu có). Dùng composition an toàn của postgres.js cho WHERE động, không nối chuỗi thủ công.
- POST: bọc trong transaction (`sql.begin`) — insert `words` rồi insert `review_state`; nếu bước 2 lỗi, transaction tự rollback (thay cho cơ chế "insert rồi xóa bù" hiện tại).

### `api/words/[id].js`
- PUT: `UPDATE words ... WHERE id = $1 RETURNING *`.
- DELETE: `DELETE FROM words WHERE id = $1` (cascade tới `review_state`/`review_log` đã có sẵn ở DB qua FK `ON DELETE CASCADE`).

### `api/words/import.js`
- Bọc toàn bộ insert nhiều dòng `words` + `review_state` tương ứng trong 1 transaction (`sql.begin`), thay cho insert-rồi-xóa-bù thủ công hiện tại.

### `api/session/today.js`
- 2 query: due states (`status != 'new' AND next_review_at <= now()`) và new states (`status = 'new'`), mỗi query `JOIN words`, map kết quả JS sang shape `{word, review_state}` giống hiện tại trước khi đưa qua `pickExerciseType`.

### `api/dashboard/index.js`
- `progressToday`: `SELECT * FROM daily_progress WHERE date = $1`.
- `dueCount`: `SELECT COUNT(*) FROM review_state WHERE status != 'new' AND next_review_at <= now()`.
- `statusRows` → `GROUP BY status` hoặc giữ nguyên cách đếm trong JS như hiện tại (đơn giản hơn, ít rủi ro sai khác).
- `recentLogs`: `SELECT result FROM review_log ORDER BY reviewed_at DESC LIMIT 200`.
- `allProgress` (60 ngày gần nhất) + tính streak: giữ nguyên logic JS hiện tại, chỉ đổi nguồn data.
- `difficultWords`: join `review_state` + `words`, `WHERE status = 'difficult' OR failure_count > 0 ORDER BY failure_count DESC LIMIT 10`.

### `api/dashboard/reviews-chart.js`
- `SELECT * FROM daily_progress WHERE date >= $1 ORDER BY date ASC`, giữ nguyên logic fill-missing-days trong JS.

### `api/reviews/[wordId].js`
- Bọc toàn bộ trong 1 transaction: fetch `review_state` (`FOR UPDATE` để tránh race condition khi 2 request cùng review 1 từ cùng lúc — cải thiện nhỏ so với hiện tại, vốn không có khóa nào), update `review_state`, insert `review_log`, upsert `daily_progress` (`INSERT ... ON CONFLICT (date) DO UPDATE`).

## 5. Error handling

Giữ nguyên convention hiện tại: bắt lỗi, trả `res.status(500).json({ error: err.message })`. Không thêm retry/fallback logic mới — lỗi kết nối DB là lỗi thật, không phải trường hợp cần che giấu.

## 6. Testing

- `npm test` (Vitest) không đổi — các file `lib/*.js` còn lại (`dailyQueue.js`, `scheduler.js`, `exerciseType.js`, `csv.js`) là pure function, không đụng DB, không cần sửa test.
- Không có test tích hợp API tự động hiện tại (README ghi rõ "kiểm thử tay trên Study flow là đủ" cho bản đầu) → verify thủ công qua `vercel dev` với Supabase project thật: CRUD từ vựng, import CSV, Study flow (session/today + reviews), Dashboard, reviews-chart.

## 7. README

Cập nhật hướng dẫn Setup: thêm bước lấy `DATABASE_URL` từ Transaction pooler, bỏ nhắc tới `SUPABASE_SERVICE_ROLE_KEY` nếu không còn dùng ở đâu khác.

## 8. Dependency

- Thêm `postgres` vào `dependencies`.
- Gỡ `@supabase/supabase-js` khỏi `dependencies` (không còn file nào import).
