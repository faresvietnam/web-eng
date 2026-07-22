# Google Auth (multi-user) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển app vocab từ single-user sang multi-user thật: đăng nhập bằng Google (Supabase Auth), mỗi user có kho từ vựng riêng, tách biệt bằng Postgres RLS.

**Architecture:** Frontend dùng `supabase-js` (anon key) để đăng nhập Google và gắn access token vào mọi API call. Backend (Vercel functions) tạo Supabase client bằng anon key + JWT của user thay cho service-role key, để Postgres RLS tự lọc theo `user_id`. DB: 4 bảng (`words`, `review_state`, `review_log`, `daily_progress`) thêm cột `user_id`, bật RLS policy `user_id = auth.uid()`.

**Tech Stack:** React 18 + Vite (frontend), Vercel serverless functions CommonJS (backend), `@supabase/supabase-js` 2.x, Supabase Postgres + Auth (Google OAuth provider), Vitest.

## Global Constraints

- Không dùng service-role key trong bất kỳ file `api/**/*.js` nào sau khi hoàn tất — chỉ anon key + JWT user.
- Mọi API endpoint hiện có phải trả `401` khi thiếu/sai `Authorization` header, không đổi response shape khi có auth hợp lệ.
- Không sửa logic filter trong các query hiện tại (RLS tự lọc theo `user_id`, không thêm `.eq('user_id', ...)` thủ công).
- Không giới hạn allowlist email — bất kỳ Google account nào cũng đăng nhập/đăng ký được.
- Dữ liệu cũ (45 `words`, 76 `review_log`, 2 `daily_progress`) phải được backfill về đúng UID của owner, không mất dữ liệu.
- Project Supabase: `whsyzhsvsmyzdaxqrvoi` (web-eng, region ap-southeast-2). Dùng Supabase MCP tools (`apply_migration`, `execute_sql`) để thao tác DB, không yêu cầu user tự mở SQL editor.

---

## Task 1: Migration DDL — thêm `user_id` (nullable) + RLS policies

**Files:**
- Create: `supabase/migrations/0002_add_user_id_and_rls.sql`
- (Áp dụng lên Supabase project `whsyzhsvsmyzdaxqrvoi` qua MCP tool `apply_migration`, không chỉ ghi file local)

**Interfaces:**
- Produces: cột `words.user_id`, `review_state.user_id`, `review_log.user_id`, `daily_progress.user_id` (uuid, nullable, FK tới `auth.users(id)` on delete cascade). `daily_progress` primary key đổi từ `(date)` thành `(user_id, date)`. RLS policy `"own rows"` trên cả 4 bảng: `using (user_id = auth.uid()) with check (user_id = auth.uid())`.

- [ ] **Step 1: Viết migration file**

```sql
-- supabase/migrations/0002_add_user_id_and_rls.sql
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

- [ ] **Step 2: Áp dụng migration lên Supabase qua MCP tool**

Gọi `apply_migration` với `project_id: "whsyzhsvsmyzdaxqrvoi"`, `name: "add_user_id_and_rls"`, `query` là nội dung file trên.

Expected: tool trả về thành công, không lỗi constraint.

- [ ] **Step 3: Xác nhận bằng `list_tables`**

Gọi `list_tables` với `project_id: "whsyzhsvsmyzdaxqrvoi"`, `schemas: ["public"]`, `verbose: true`.

Expected: cả 4 bảng có cột `user_id`; `daily_progress.primary_keys` là `["user_id", "date"]`.

- [ ] **Step 4: Commit file migration**

```bash
git add supabase/migrations/0002_add_user_id_and_rls.sql
git commit -m "feat: add user_id column and RLS policies for multi-user auth"
```

---

## Task 2: `lib/auth.js` — verify request có JWT hợp lệ

**Files:**
- Create: `lib/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: none
- Produces: `requireUser(req, res)` — đọc header `Authorization: Bearer <token>` từ `req.headers.authorization`. Nếu thiếu hoặc không đúng format `Bearer <token>`, gọi `res.status(401).json({ error: 'Thiếu access token' })` và return `null`. Nếu hợp lệ, return chuỗi `token` (không tự verify chữ ký — việc verify thực sự xảy ra khi Postgres/PostgREST dùng token đó, xem Task 3).

- [ ] **Step 1: Viết failing test**

```javascript
// tests/auth.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { requireUser } = require('../lib/auth');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('requireUser', () => {
  it('returns null and responds 401 when Authorization header is missing', () => {
    const req = { headers: {} };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Thiếu access token' });
  });

  it('returns null and responds 401 when header is not Bearer format', () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('returns the token when header is valid Bearer format', () => {
    const req = { headers: { authorization: 'Bearer my-jwt-token' } };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBe('my-jwt-token');
    expect(res.statusCode).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/auth.test.js`
Expected: FAIL — `Cannot find module '../lib/auth'`

- [ ] **Step 3: Viết implementation**

```javascript
// lib/auth.js
function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Thiếu access token' });
    return null;
  }
  return match[1];
}

module.exports = { requireUser };
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/auth.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js tests/auth.test.js
git commit -m "feat: add requireUser helper to verify Authorization header"
```

---

## Task 3: `lib/supabaseClient.js` — client theo user JWT (anon key)

**Files:**
- Modify: `lib/supabaseClient.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: none
- Produces: `getSupabaseClient(accessToken)` — tạo (và cache theo token) một `supabase-js` client dùng `SUPABASE_URL` + `SUPABASE_ANON_KEY`, với `global.headers.Authorization = 'Bearer ' + accessToken`. Không còn dùng `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Sửa `lib/supabaseClient.js`**

```javascript
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

module.exports = { getSupabaseClient };
```

Lý do không cache client theo module-level singleton nữa: token thay đổi theo từng user/request, cache cũ (singleton theo service-role key) không còn hợp lệ khi mỗi request có JWT khác nhau.

- [ ] **Step 2: Cập nhật `.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

(Xoá dòng `SUPABASE_SERVICE_ROLE_KEY` — không còn dùng trong runtime API.)

- [ ] **Step 3: Verify bằng cách chạy toàn bộ test suite hiện có (không có test riêng cho file này, nhưng đảm bảo không có test nào import theo signature cũ)**

Run: `npx vitest run`
Expected: PASS toàn bộ (không có test nào gọi `getSupabaseClient()` không tham số)

- [ ] **Step 4: Commit**

```bash
git add lib/supabaseClient.js .env.example
git commit -m "feat: switch supabaseClient to anon key + user JWT instead of service role"
```

---

## Task 4: Áp `requireUser` + `getSupabaseClient(token)` vào 7 API handlers

**Files:**
- Modify: `api/words/index.js`
- Modify: `api/words/[id].js`
- Modify: `api/words/import.js`
- Modify: `api/dashboard/index.js`
- Modify: `api/dashboard/reviews-chart.js`
- Modify: `api/reviews/[wordId].js`
- Modify: `api/session/today.js`

**Interfaces:**
- Consumes: `requireUser(req, res)` từ Task 2, `getSupabaseClient(token)` từ Task 3.
- Produces: mỗi handler, ngay dòng đầu (sau kiểm tra method nếu có), gọi `const token = requireUser(req, res); if (!token) return;` rồi dùng `getSupabaseClient(token)` thay cho `getSupabaseClient()`.

Đây là thay đổi lặp giống nhau ở 7 file, không có logic khác biệt — liệt kê từng file để tránh nhầm vị trí chèn.

- [ ] **Step 1: `api/words/index.js`** — thêm require + đổi 2 dòng đầu hàm

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);

  if (req.method === 'GET') {
```
(giữ nguyên toàn bộ phần còn lại của file, chỉ xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 2: `api/words/[id].js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const id = req.query.id;

  if (req.method === 'PUT') {
```
(giữ nguyên phần còn lại)

- [ ] **Step 3: `api/words/import.js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { parseWordsCsv } = require('../../lib/csv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;

  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!csvText) {
    res.status(400).json({ error: 'Thiếu nội dung CSV' });
    return;
  }

  const { rows, errors } = parseWordsCsv(csvText);
  if (rows.length === 0) {
    res.status(200).json({ imported: 0, errors });
    return;
  }

  const supabase = getSupabaseClient(token);
```
(giữ nguyên phần còn lại, chỉ xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 4: `api/dashboard/index.js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
```
(giữ nguyên phần còn lại, xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 5: `api/dashboard/reviews-chart.js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const days = Math.max(1, Math.floor(Number(req.query.days)) || 7);
  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
```
(giữ nguyên phần còn lại, xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 6: `api/reviews/[wordId].js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { applyReview } = require('../../lib/scheduler');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const wordId = req.query.wordId;
  const { exercise_type, result } = req.body || {};
  if (!exercise_type || !result) {
    res.status(400).json({ error: 'Thiếu exercise_type hoặc result' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
```
(giữ nguyên phần còn lại, xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 7: `api/session/today.js`**

```javascript
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { requireUser } = require('../../lib/auth');
const { buildDailyQueue } = require('../../lib/dailyQueue');
const { pickExerciseType } = require('../../lib/exerciseType');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = requireUser(req, res);
  if (!token) return;
  const supabase = getSupabaseClient(token);
  const now = new Date();
```
(giữ nguyên phần còn lại, xoá dòng `const supabase = getSupabaseClient();` cũ)

- [ ] **Step 8: Chạy toàn bộ test suite**

Run: `npx vitest run`
Expected: PASS toàn bộ (các file `lib/*.js` không đổi logic, chỉ `api/**` đổi mà không có test trực tiếp gọi các handler này)

- [ ] **Step 9: Commit**

```bash
git add api/
git commit -m "feat: require auth token on all API endpoints, scope Supabase client per user"
```

---

## Task 5: `src/supabaseClient.js` — browser client

**Files:**
- Create: `src/supabaseClient.js`
- Modify: `vite.config.js` (nếu cần expose env — kiểm tra Step 1 trước khi sửa)

**Interfaces:**
- Produces: named export `supabase` — instance `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`.

- [ ] **Step 1: Kiểm tra `vite.config.js` hiện tại**

```bash
cat vite.config.js
```

Vite mặc định tự expose mọi env var có prefix `VITE_` qua `import.meta.env`, không cần sửa `vite.config.js` trừ khi file này có custom `envPrefix`. Nếu không có `envPrefix` custom, bỏ qua việc sửa file này.

- [ ] **Step 2: Viết `src/supabaseClient.js`**

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

- [ ] **Step 3: Thêm env vars vào `.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Verify bằng build**

Run: `npm run build`
Expected: build thành công (file chưa được import ở đâu nên không lỗi runtime, chỉ cần không có lỗi syntax/import)

- [ ] **Step 5: Commit**

```bash
git add src/supabaseClient.js .env.example
git commit -m "feat: add browser Supabase client for auth"
```

---

## Task 6: `src/screens/LoginScreen.jsx`

**Files:**
- Create: `src/screens/LoginScreen.jsx`

**Interfaces:**
- Consumes: `supabase` từ `src/supabaseClient.js` (Task 5).
- Produces: default export `LoginScreen()` — component không nhận prop, render nút đăng nhập Google.

- [ ] **Step 1: Viết component**

```jsx
import React from 'react';
import { supabase } from '../supabaseClient.js';

export default function LoginScreen() {
  function handleGoogleLogin() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ padding: 32, maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sidebar-logo" style={{ margin: '0 auto' }}>V</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>My Vocab</h1>
        <p style={{ color: 'var(--ink-2)', margin: 0 }}>Đăng nhập để đồng bộ kho từ vựng của bạn.</p>
        <button className="btn btn-primary" onClick={handleGoogleLogin}>
          Đăng nhập với Google
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify bằng build**

Run: `npm run build`
Expected: build thành công (component chưa được dùng ở đâu, chỉ kiểm tra không lỗi syntax)

- [ ] **Step 3: Commit**

```bash
git add src/screens/LoginScreen.jsx
git commit -m "feat: add Google login screen"
```

---

## Task 7: `src/App.jsx` — gate theo session + đăng xuất

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `supabase` (Task 5), `LoginScreen` (Task 6).
- Produces: không đổi cấu trúc export (`export default function App()`), chỉ thêm state `session` và gate render.

- [ ] **Step 1: Sửa `src/App.jsx`**

Thêm import ở đầu file:

```javascript
import { supabase } from './supabaseClient.js';
import LoginScreen from './screens/LoginScreen.jsx';
```

Trong component `App`, thêm state và effect (đặt trước state `activeTab` hiện có):

```javascript
const [session, setSession] = useState(undefined);

useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
  const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
    setSession(newSession);
  });
  return () => listener.subscription.unsubscribe();
}, []);
```

Sửa effect load dashboard hiện có để chỉ chạy khi đã đăng nhập:

```javascript
useEffect(() => {
  if (session) {
    api.getDashboard().then(setDailyGoal);
  }
}, [activeTab, session]);
```

Thêm gate ngay đầu phần `return` của component, trước dòng `return (\n    <div className="layout">`:

```javascript
if (session === undefined) {
  return null;
}
if (!session) {
  return <LoginScreen />;
}
```

Thêm nút đăng xuất trong `sidebar-footer`, sau `sidebar-widget` "Daily goal" hiện có:

```jsx
<button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
  Đăng xuất
</button>
```

- [ ] **Step 2: Verify bằng build**

Run: `npm run build`
Expected: build thành công, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: gate app behind Google session, add sign out button"
```

---

## Task 8: `src/api.js` — gắn Authorization header

**Files:**
- Modify: `src/api.js`

**Interfaces:**
- Consumes: `supabase` (Task 5).
- Produces: hành vi `request()` không đổi (vẫn trả cùng shape), chỉ thêm header `Authorization`.

- [ ] **Step 1: Sửa hàm `request` trong `src/api.js`**

```javascript
import { supabase } from './supabaseClient.js';

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
```
(giữ nguyên toàn bộ object `export const api = {...}` phía dưới)

- [ ] **Step 2: Verify bằng build**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 3: Commit**

```bash
git add src/api.js
git commit -m "feat: attach Supabase access token to all API requests"
```

---

## Task 9: Cấu hình Google OAuth (thủ công, ngoài code) + set env Vercel/local

**Files:** không có file code — checklist thao tác tay + set biến môi trường.

- [ ] **Step 1: Tạo OAuth Client trên Google Cloud Console**

1. Vào https://console.cloud.google.com/apis/credentials, tạo (hoặc chọn) 1 project.
2. Tạo **OAuth client ID**, Application type: **Web application**.
3. Authorized redirect URI: lấy từ Supabase Dashboard → Authentication → Providers → Google (Supabase hiển thị sẵn URL dạng `https://whsyzhsvsmyzdaxqrvoi.supabase.co/auth/v1/callback`), dán chính xác URL đó vào Google Console.
4. Copy **Client ID** và **Client Secret**.

- [ ] **Step 2: Cấu hình provider trong Supabase Dashboard**

1. Vào Supabase Dashboard → project `web-eng` → Authentication → Providers → Google.
2. Bật **Enable Sign in with Google**, dán Client ID + Client Secret từ Step 1.
3. Lưu.

- [ ] **Step 3: Lấy anon key**

Vào Supabase Dashboard → project `web-eng` → Settings → API → copy **anon public key** (hoặc dùng MCP tool `get_publishable_keys` với `project_id: "whsyzhsvsmyzdaxqrvoi"`).

- [ ] **Step 4: Set env local (`.env`)**

```
SUPABASE_URL=https://whsyzhsvsmyzdaxqrvoi.supabase.co
SUPABASE_ANON_KEY=<anon-key-từ-step-3>
VITE_SUPABASE_URL=https://whsyzhsvsmyzdaxqrvoi.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-từ-step-3>
```

- [ ] **Step 5: Set env trên Vercel**

Vercel Dashboard → project → Settings → Environment Variables, thêm 4 biến trên (cùng giá trị). Xoá biến `SUPABASE_SERVICE_ROLE_KEY` cũ nếu còn (không còn dùng).

- [ ] **Step 6: Chạy local để test đăng nhập**

```bash
npm run dev
```

Mở app, bấm "Đăng nhập với Google", hoàn tất OAuth flow.
Expected: redirect về app, thấy layout chính (không còn `LoginScreen`).

---

## Task 10: Backfill dữ liệu cũ về UID owner + đặt `NOT NULL`

**Files:**
- Create: `supabase/migrations/0003_backfill_and_enforce_not_null.sql` (chỉ ghi lại nội dung đã chạy qua MCP, để lưu lịch sử migration)

**Interfaces:** không có — thao tác dữ liệu một lần qua MCP `execute_sql` / `apply_migration`.

**Điều kiện tiên quyết:** Task 9 Step 6 đã hoàn tất — owner đã đăng nhập Google thật ít nhất 1 lần (để `auth.users` có row thật với UID thật).

- [ ] **Step 1: Tra UID owner theo email**

Gọi MCP tool `execute_sql` với `project_id: "whsyzhsvsmyzdaxqrvoi"`, query:

```sql
select id, email from auth.users;
```

Expected: thấy đúng 1 row (hoặc nhiều nếu đã có người khác login) — xác nhận đúng UID của owner bằng email `nthvan203@gmail.com` (hoặc email owner dùng để đăng nhập).

- [ ] **Step 2: Backfill 4 bảng bằng UID vừa tra được**

Gọi `apply_migration` với `project_id: "whsyzhsvsmyzdaxqrvoi"`, `name: "backfill_and_enforce_not_null"`, query (thay `<OWNER_UID>` bằng UID thật từ Step 1):

```sql
update words set user_id = '<OWNER_UID>' where user_id is null;
update review_state set user_id = '<OWNER_UID>' where user_id is null;
update review_log set user_id = '<OWNER_UID>' where user_id is null;
update daily_progress set user_id = '<OWNER_UID>' where user_id is null;

alter table words alter column user_id set not null;
alter table words alter column user_id set default auth.uid();

alter table review_state alter column user_id set not null;
alter table review_state alter column user_id set default auth.uid();

alter table review_log alter column user_id set not null;
alter table review_log alter column user_id set default auth.uid();

alter table daily_progress alter column user_id set not null;
alter table daily_progress alter column user_id set default auth.uid();
```

- [ ] **Step 3: Xác nhận bằng `execute_sql`**

```sql
select count(*) from words where user_id is null
union all
select count(*) from review_state where user_id is null
union all
select count(*) from review_log where user_id is null
union all
select count(*) from daily_progress where user_id is null;
```

Expected: cả 4 dòng đều `0`.

- [ ] **Step 4: Lưu lại nội dung migration đã chạy vào file local (đã thay UID thật bằng placeholder để không hard-code UID vào git)**

```sql
-- supabase/migrations/0003_backfill_and_enforce_not_null.sql
-- Backfill đã chạy 1 lần qua Supabase MCP execute_sql với UID owner thật.
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
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_backfill_and_enforce_not_null.sql
git commit -m "feat: backfill owner user_id and enforce not null on all tables"
```

---

## Task 11: Verify end-to-end với 2 Google account khác nhau

**Files:** không có file thay đổi — verification thủ công.

- [ ] **Step 1: Đăng nhập bằng account owner (đã có data cũ)**

```bash
npm run dev
```

Đăng nhập Google bằng account owner.
Expected: thấy đủ 45 words cũ trong tab Vocabulary, dashboard hiển thị đúng số liệu cũ.

- [ ] **Step 2: Đăng xuất, đăng nhập bằng 1 Google account khác**

Bấm "Đăng xuất", đăng nhập lại bằng account Google thứ 2 (chưa từng dùng app này).
Expected: tab Vocabulary **trống** (không thấy 45 words của owner), dashboard hiển thị số liệu rỗng (0 reviews, 0 streak).

- [ ] **Step 3: Thêm 1 từ mới bằng account thứ 2, xác nhận cách ly**

Thêm 1 từ qua tab Import bằng account thứ 2. Đăng xuất, đăng nhập lại bằng account owner.
Expected: account owner **không** thấy từ mới vừa thêm bởi account thứ 2 (vẫn chỉ 45 words cũ).

- [ ] **Step 4: Chạy lại toàn bộ automated test suite lần cuối**

```bash
npx vitest run
```

Expected: PASS toàn bộ.

- [ ] **Step 5: Chạy `npm run build` lần cuối**

```bash
npm run build
```

Expected: build thành công, không lỗi.
