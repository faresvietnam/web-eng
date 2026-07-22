# Editable Settings + Dashboard Preview Design

## Bối cảnh

Hai giới hạn học hàng ngày (`NEW_DAILY_LIMIT = 20`, `REVIEW_DAILY_LIMIT = 100`) đang hard-code trong `lib/dailyQueue.js`, và màn Settings (`src/screens/SettingsScreen.jsx`) chỉ hiển thị 2 số này ở input `readOnly`, không sửa được. App đã là multi-user (Google Auth + RLS, xem `docs/superpowers/specs/2026-07-22-google-auth-design.md`), nên giới hạn này cần lưu theo từng user.

Widget "🔥 Daily goal" ở sidebar (`src/App.jsx`) hiện tính hoàn thành = `reviewed_today / review_limit`, bỏ qua từ mới hoàn toàn — không phản ánh đúng "hôm nay đã học xong chưa".

Carousel xem trước 1-từ-1-lần ở Dashboard (`src/screens/DashboardScreen.jsx`, biến `previewCards`) hiện lấy từ `api.getToday()` — chỉ các từ cần ôn hôm nay (đã cap theo limit ngày) — nên nếu học hết hàng hôm nay, carousel sẽ hết từ để xem trước ngay cả khi vocabulary còn rất nhiều từ khác.

## Phần 1: Database

Bảng mới `user_settings`, theo đúng pattern user_id + RLS đã dùng cho 4 bảng khác:

```sql
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_daily_limit integer not null default 20,
  review_daily_limit integer not null default 100
);
alter table user_settings enable row level security;
create policy "own rows" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

User chưa từng lưu settings sẽ không có row nào — API tự trả default (20/100), không tự tạo row cho tới khi user bấm Save lần đầu (insert/upsert qua PUT).

## Phần 2: Backend API

Endpoint mới `api/settings/index.js`:
- **GET**: `select` từ `user_settings` theo user hiện tại (RLS tự lọc). Không có row → trả `{ new_daily_limit: 20, review_daily_limit: 100 }`.
- **PUT**: nhận `{ new_daily_limit, review_daily_limit }`; validate cả hai phải là số nguyên dương (`Number.isInteger(x) && x > 0`), thiếu hoặc không hợp lệ → `400`. Hợp lệ → `upsert` vào `user_settings` (cột `user_id` có default `auth.uid()` giống các bảng khác), trả về row đã lưu.

Sửa các nơi đang dùng limit cứng:
- `lib/dailyQueue.js`: `buildDailyQueue({ dueReviewStates, newWordStates, dailyProgress, now, newDailyLimit, reviewDailyLimit })` — thêm 2 tham số bắt buộc, xoá hằng số `NEW_DAILY_LIMIT`/`REVIEW_DAILY_LIMIT` (không còn nơi nào cần import chúng riêng).
- `api/session/today.js`: thêm 1 query `select` `user_settings` (song song với các query hiện có), lấy `new_daily_limit`/`review_daily_limit` (fallback 20/100 nếu không có row), truyền vào `buildDailyQueue`.
- `api/dashboard/index.js`: cũng lấy `user_settings`, trả `new_limit`/`review_limit` là giá trị thật của user (thay cho `20`/`100` hard-code).

`tests/dailyQueue.test.js` cập nhật theo signature mới — mỗi test case truyền rõ `newDailyLimit`/`reviewDailyLimit` (100/20 như giá trị cũ, để giữ nguyên ý nghĩa các test case hiện có).

## Phần 3: Frontend — Settings screen

`src/screens/SettingsScreen.jsx` chuyển từ static sang stateful:
- `useEffect` gọi `api.getSettings()` lúc mount, set state `{ new_daily_limit, review_daily_limit }`. Trong lúc chưa tải xong, input hiển thị rỗng/disabled.
- 2 input `type="number"` bỏ `readOnly`, thêm `min="1"`, `value`/`onChange` cập nhật state (`Number(e.target.value)`).
- Nút "Lưu" gọi `api.updateSettings(state)`; disable trong lúc đang lưu; hiện thông báo ngắn ("Đã lưu") khi thành công, hoặc lỗi (message từ API) khi thất bại.
- Phần "Giọng đọc (TTS)" giữ nguyên static, ngoài phạm vi.

`src/api.js` thêm:
```js
getSettings: () => request('/api/settings'),
updateSettings: (body) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
```

## Phần 4: Daily goal widget (sidebar, `src/App.jsx`)

Đổi cách tính hoàn thành: dựa vào toàn bộ việc hôm nay (ôn + từ mới) đã xong hay chưa, dùng dữ liệu đã có sẵn từ `api.getDashboard()` — không cần API mới.

```js
const remainingReview = Math.max(0, Math.min(dailyGoal.due_count, dailyGoal.review_limit - dailyGoal.reviewed_today));
const remainingNew = Math.max(0, Math.min(dailyGoal.totals.new, dailyGoal.new_limit - dailyGoal.new_learned_today));
const doneToday = dailyGoal.reviewed_today + dailyGoal.new_learned_today;
const totalToday = doneToday + remainingReview + remainingNew;
```

- `remainingReview + remainingNew === 0` (bao gồm cả trường hợp `totalToday === 0`, tức không có gì để học) → hiển thị "Đã hoàn thành hôm nay! 🎉", progress bar 100%.
- Ngược lại → hiển thị `${doneToday} / ${totalToday} việc`, progress bar `doneToday / totalToday * 100`.

`src/screens/DashboardScreen.jsx` không đổi phần "Mục tiêu hôm nay" (`reviewed_today/review_limit`) — mục đích khác, hiển thị riêng theo limit cấu hình, không cần đổi theo widget sidebar.

## Phần 5: Dashboard — carousel xem trước toàn bộ vocabulary

`src/screens/DashboardScreen.jsx`:
- Bỏ gọi `api.getToday()` (trong file này chỉ dùng để lấy `previewCards`, không dùng cho gì khác).
- Gọi `api.getWords({})` (toàn bộ từ, không filter status) để lấy `previewCards`.
- Sắp xếp bằng hàm cục bộ trong file (chỉ dùng 1 nơi, không tách lib riêng):

```js
function sortForPreview(words) {
  const now = Date.now();
  return [...words].sort((a, b) => {
    const as = a.review_state, bs = b.review_state;
    const aDue = as.status !== 'new' && new Date(as.next_review_at).getTime() <= now;
    const bDue = bs.status !== 'new' && new Date(bs.next_review_at).getTime() <= now;
    if (aDue !== bDue) return aDue ? -1 : 1;
    if (aDue && bDue) {
      if (bs.failure_count !== as.failure_count) return bs.failure_count - as.failure_count;
      return new Date(as.next_review_at) - new Date(bs.next_review_at);
    }
    const aNew = as.status === 'new';
    const bNew = bs.status === 'new';
    if (aNew !== bNew) return aNew ? -1 : 1;
    if (aNew && bNew) return a.id - b.id;
    return new Date(as.next_review_at) - new Date(bs.next_review_at);
  });
}
```

Thứ tự 3 nhóm: (1) đến hạn ôn — `failure_count` cao trước, cùng `failure_count` thì hạn gần trước; (2) từ mới — theo `id`; (3) từ chưa đến hạn — hạn gần trước.

`api.getWords({})` trả object dạng `{ ...word fields, review_state: {...} }` (phẳng, khác shape `{ word, review_state }` của `api.getToday()`). Map lại thành `{ word: w, review_state: w.review_state }` trước khi set vào state `previewCards`, để phần JSX render carousel hiện tại (`previewCard.word.word`, `previewCard.review_state.status`, ...) không cần sửa.

`StudyScreen.jsx` (tab Learn, dùng `api.getToday()`) giữ nguyên hoàn toàn — không đổi theo.

## Testing

- `tests/dailyQueue.test.js`: cập nhật theo signature mới của `buildDailyQueue` (thêm `newDailyLimit`/`reviewDailyLimit` ở mỗi test case).
- Không thêm test cho `api/settings/index.js` (theo đúng convention hiện có — các handler `api/**` khác cũng không có unit test riêng, chỉ có test cho các hàm logic thuần trong `lib/`).
- Không thêm test cho `sortForPreview` (hàm cục bộ trong component React, dự án hiện không có test cho component nào).

## Rủi ro / giới hạn đã biết

- `user_settings` chưa có row cho user hiện tại (mọi user đang dùng app, kể cả owner) cho đến khi họ mở Settings và bấm Save lần đầu — trước đó API luôn trả default 20/100, hành vi giữ nguyên như trước khi có tính năng này.
- Đổi limit trong Settings có hiệu lực ngay từ lần tải hàng học tiếp theo (`api/session/today.js`), không cần thao tác gì thêm.
