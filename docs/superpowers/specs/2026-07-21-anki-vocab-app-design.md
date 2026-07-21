# Thiết kế: Web học từ vựng tiếng Anh kiểu Anki (Vercel + Supabase)

Ngày: 2026-07-21

## 1. Mục tiêu

Web app giúp học và nhớ từ vựng tiếng Anh bằng kỹ thuật lặp lại ngắt quãng (spaced repetition), tự động đánh giá mức độ nhớ dựa trên kết quả làm bài, không cần đăng nhập. Deploy trên Vercel, dữ liệu lưu trên Supabase (Postgres).

## 2. Kiến trúc

- **Hosting:** Vercel — frontend static (Vite build) + API routes dưới dạng Vercel Serverless Functions (`/api/*`, Node.js runtime).
- **DB:** Supabase (Postgres), truy cập từ serverless functions qua `@supabase/supabase-js` bằng service role key (chỉ dùng server-side, không expose ra frontend).
- **Frontend:** React + Vite, SPA 1 trang với 3 khu vực: Study, Word List/Import, Dashboard. Gọi API qua fetch tới `/api/*` cùng domain (không gọi thẳng Supabase từ trình duyệt).
- Không auth (single-user cá nhân), không cần đăng nhập. TTS dùng `window.speechSynthesis` của trình duyệt.
- Local dev: `vercel dev` (chạy cả frontend + serverless functions), Supabase project riêng cho dev (hoặc local Supabase CLI) và một project riêng cho production.

## 3. Data model (Supabase/Postgres)

### `words`
| cột | kiểu | ghi chú |
|---|---|---|
| id | bigint generated always as identity PK | |
| word | text NOT NULL | từ tiếng Anh |
| meaning | text NOT NULL | nghĩa tiếng Việt |
| category | text NULL | chủ đề, dùng để chọn đáp án nhiễu |
| part_of_speech | text NULL | danh từ/động từ/tính từ..., hiển thị dạng tag trên card học |
| ipa | text NULL | phiên âm quốc tế, ví dụ `/ˈbjuːtɪfəl/` |
| example | text NULL | câu ví dụ (tiếng Anh) |
| example_vi | text NULL | bản dịch câu ví dụ (tiếng Việt) |
| segments | text NULL | các đoạn phân tách bằng `\|`, ví dụ `"beauty\|ful"` |
| created_at | timestamptz NOT NULL DEFAULT now() |

### `review_state` (1-1 với `words`)
| cột | kiểu | ghi chú |
|---|---|---|
| word_id | bigint PK/FK → words.id (on delete cascade) | |
| status | text NOT NULL | `new` \| `learning` \| `difficult` |
| step_index | integer NOT NULL DEFAULT 0 | vị trí trong chuỗi cố định 8 mốc khi đang `new`/`learning` giai đoạn đầu (0..7) |
| interval_days | numeric NOT NULL DEFAULT 0 | interval hiện tại, dùng sau khi qua hết chuỗi cố định |
| correct_count | integer NOT NULL DEFAULT 0 | số lần trả lời đúng liên tiếp gần nhất; reset về 0 khi Again; quyết định loại bài tập |
| failure_count | integer NOT NULL DEFAULT 0 | tổng số lần Again; ≥3 → status = difficult |
| last_review_at | timestamptz NULL | |
| next_review_at | timestamptz NOT NULL DEFAULT now() | mặc định = created_at (học ngay) |
| difficult_stage | integer NULL | 0/1/2 khi status = difficult, ứng với mốc 10 phút/1 ngày/3 ngày |

### `review_log`
| cột | kiểu | ghi chú |
|---|---|---|
| id | bigint generated always as identity PK | |
| word_id | bigint FK → words.id (on delete cascade) | |
| reviewed_at | timestamptz NOT NULL DEFAULT now() | |
| result | text NOT NULL | `again` \| `hard` \| `good` |
| exercise_type | text NOT NULL | `mc_en_vi` \| `mc_vi_en` \| `segment` \| `full_type` |

### `daily_progress`
| cột | kiểu | ghi chú |
|---|---|---|
| date | date PK | dạng `YYYY-MM-DD` |
| new_learned | integer NOT NULL DEFAULT 0 | số từ mới đã bắt đầu học trong ngày |
| reviewed_count | integer NOT NULL DEFAULT 0 | số thẻ đã ôn (review, không tính từ mới) trong ngày |

## 4. Thuật toán lịch ôn tập

### Từ mới / đang học (status = `new` hoặc `learning`)

Chuỗi cố định theo `step_index` (0-indexed):

```
0: học ngay       (interval = 0)
1: 10 phút
2: 1 ngày
3: 3 ngày
4: 7 ngày
5: 14 ngày
6: 30 ngày
7: 60 ngày
```

- Mỗi lần trả lời đúng ở giai đoạn này: `step_index += 1`, `next_review_at = now + <mốc tương ứng>`.
- Khi `step_index` vượt quá 7 (đã qua mốc 60 ngày và trả lời đúng thêm 1 lần): chuyển hẳn sang chế độ "interval nhân hệ số" — `status = learning` (đã ổn định), `interval_days = 60`.
- Trả lời sai (Again) ở bất kỳ bước nào trong chuỗi cố định: `next_review_at = now + 10 phút`, `step_index = 1` (quay lại mốc "10 phút" — nếu lần tới trả lời đúng sẽ tiến lên mốc "1 ngày", đúng theo rule gốc "reset về 1 ngày"), `failure_count += 1`, `correct_count = 0`. Nếu `failure_count >= 3` → `status = difficult`, `difficult_stage = 0`.

### Từ đã ổn định (status = `learning`, đã qua chuỗi cố định, có `interval_days`)

- **Again**: `next_review_at = now + 10 phút`, `interval_days = 1`, `failure_count += 1`, `correct_count = 0`. Nếu `failure_count >= 3` → `status = difficult`, `difficult_stage = 0`.
- **Hard**: `interval_days *= 1.2`, `next_review_at = now + interval_days ngày`, `correct_count += 1`.
- **Good**: `interval_days *= 2`, tương tự.
- (Easy không dùng tới vì hệ thống tự chấm, không có lựa chọn Easy thủ công — xem mục 6.)

### Từ khó (status = `difficult`)

- Không dùng rule interval bình thường. Dùng chuỗi cứng theo `difficult_stage`:
  ```
  0: 10 phút
  1: 1 ngày
  2: 3 ngày
  ```
- Trả lời đúng (Hard hoặc Good): `difficult_stage += 1`, `next_review_at = now + <mốc tương ứng>`.
- Khi `difficult_stage` vượt quá 2 (đã qua mốc 3 ngày, trả lời đúng thêm 1 lần): `status = learning`, `interval_days = 7`, `step_index` không còn dùng nữa (đã ở chế độ interval), `difficult_stage = NULL`, `correct_count = 0` (để loại bài tập lại bắt đầu từ trắc nghiệm — xem mục 6).
- Trả lời sai (Again) ở bất kỳ giai đoạn: `difficult_stage = 0`, `next_review_at = now + 10 phút`, `failure_count += 1`.
- Trong suốt thời gian `difficult`, loại bài tập luôn là **nhập cả từ** (full typing), không trắc nghiệm, không segment.

## 5. Logic chọn từ học mỗi ngày & luồng session

- Ranh giới "ngày" = nửa đêm theo giờ server (UTC, tính bằng `Date` trong Vercel serverless function).
- Hạn mức: tối đa **100 từ ôn/ngày** (không tính từ mới) và tối đa **20 từ mới/ngày**. Đếm bằng bảng `daily_progress`, không phụ thuộc reload trang.
- Khi vào Study, backend build hàng đợi:
  1. Lấy các từ có `next_review_at <= now`, sort `failure_count DESC, next_review_at ASC`, cắt còn chỗ trong hạn mức 100 (100 − `reviewed_count` hôm nay).
  2. Nếu còn chỗ trong hạn mức 20 từ mới (20 − `new_learned` hôm nay), lấy thêm từ `status = new` (thứ tự theo `id`), tối đa số chỗ còn lại.
  3. Hàng đợi = review trước, new sau. Từ dư (due nhưng vượt hạn mức) tự động dồn sang ngày kế tiếp (vì `next_review_at` của chúng đã ở quá khứ, ngày sau sẽ được ưu tiên lấy lại theo bước 1).
  4. Mỗi khi hoàn thành 1 thẻ: nếu thẻ đó là từ mới (lần review đầu tiên, `step_index` từ 0 lên 1) → `new_learned += 1`; ngược lại → `reviewed_count += 1`.

## 6. Loại bài tập theo lượt ôn

**Từ không phải difficult**, chọn theo `correct_count`:
| correct_count | Loại bài |
|---|---|
| 0 | Trắc nghiệm English → Vietnamese (`mc_en_vi`) |
| 1 | Trắc nghiệm Vietnamese → English (`mc_vi_en`) |
| ≥2, có `segments` | Nhập theo đoạn (`segment`) |
| ≥2, không có `segments` | Nhập cả từ (`full_type`) |

**Từ difficult**: luôn `full_type`.

**Đáp án nhiễu trắc nghiệm**: lấy 3 từ khác — ưu tiên cùng `category`; nếu không đủ, bổ sung random từ toàn bộ `words`. Yêu cầu tối thiểu 4 từ trong DB để có đủ đáp án; nếu ít hơn, bổ sung đáp án nhiễu placeholder hoặc bỏ qua kiểm tra (ghi log cảnh báo).

## 7. Bài tập nhập theo đoạn (segment)

- `segments` lưu dạng `"beauty|ful"` → danh sách đoạn theo thứ tự `["beauty", "ful"]`.
- Luồng: với mỗi đoạn theo thứ tự trái → phải, hiển thị các đoạn khác (đã hoàn thành hoặc chưa tới) dưới dạng `...` che, đoạn hiện tại cần nhập là input trống. Ví dụ đoạn 1: hiển thị `.... + ful` che phần đầu, cần nhập `beauty`; đoạn 2: hiển thị `beauty + ....`, cần nhập `ful`.
- Trả lời sai 1 đoạn: báo đỏ, cho nhập lại **đoạn đó** (không lùi về đoạn đầu).
- Sau khi đúng hết tất cả đoạn: yêu cầu nhập lại **toàn bộ từ** 1 lần để hoàn tất thẻ.
- Nếu từ không cần sửa lần nào trong toàn bộ quá trình (mọi đoạn + từ đầy đủ đều đúng ngay lần đầu) → chấm `good`; nếu có ít nhất 1 lần phải nhập lại → chấm `hard`; nếu người dùng bỏ qua/yêu cầu xem đáp án → chấm `again`.

## 8. Chấm điểm tự động (không có nút Again/Hard/Good/Easy thủ công)

- **Trắc nghiệm**: đúng ngay lần chọn đầu tiên → `good`; chọn sai → `again` (hiển thị đáp án đúng, không cho chọn lại).
- **Nhập từ / nhập đoạn**: đúng ngay lần gõ đầu (từng đoạn và từ đầy đủ) → `good`; cần gõ lại ít nhất 1 lần (do sai) nhưng cuối cùng tự gõ đúng → `hard`; người dùng bấm "bỏ qua/xem đáp án" → `again`.

## 9. UI/UX

### Sidebar cố định
Dashboard, Learn (bắt đầu session hôm nay), Review (badge = số từ due), Vocabulary (word list), Import, Statistics, Settings.

### Màn hình Study (Learn/Review)
- 1 thẻ/lần, góc trên: tag trạng thái (`New`/`Learning`/`Difficult`) + tag `part_of_speech`, số thứ tự `x/tổng số thẻ hôm nay`.
- Từ hiển thị lớn kèm `ipa`, icon loa phát audio từ (`window.speechSynthesis`, giọng `en-US`).
- Trắc nghiệm: hiển thị từ/nghĩa + 4 nút đáp án (1 đúng + 3 nhiễu).
- Nhập đoạn/nhập cả từ: input text, Enter để submit; sai → viền đỏ + rung nhẹ, cho nhập lại; có nút "Xem đáp án" (kích hoạt kết quả `again`).
- Sau khi trả lời: hiện `meaning`, khối "Word breakdown" nếu có `segments` (hiển thị dạng chip `beauty` + `ful`, không phải ô nhập — chỉ để xem lại cấu tạo từ), câu `example` kèm `example_vi` và icon loa đọc câu ví dụ.

### Màn hình Word List / Import
- Bảng danh sách từ (word, part_of_speech, meaning, category, status, next_review_at), filter theo status, ô tìm kiếm theo word/meaning/category.
- Nút "Import CSV": cột `word, meaning, category, part_of_speech, ipa, example, example_vi, segments`; preview trước khi lưu; báo lỗi dòng thiếu `word` hoặc `meaning`, các dòng lỗi bị bỏ qua và liệt kê ra cho người dùng biết. Có nút tải file CSV mẫu (template).
- Form thêm/sửa/xóa từ thủ công (các cột tương tự CSV).

### Màn hình Dashboard (chi tiết)
- **Thẻ số liệu hôm nay:** New words (đã học/hạn mức 20), Reviews due (số từ đang chờ ôn), Streak (số ngày liên tiếp có hoạt động học/ôn), Accuracy (% `good`+`hard` trên tổng lượt ôn, tính trên toàn bộ `review_log` hoặc theo khoảng đã chọn).
- **Daily goal progress bar:** tiến độ số lượt ôn hôm nay so với hạn mức (ví dụ `40/100 reviews`).
- **Biểu đồ 7 ngày gần nhất:** bar chart số lượt ôn mỗi ngày, lấy từ `daily_progress.reviewed_count` + `new_learned` theo ngày (dùng recharts hoặc chart.js đơn giản).
- **Difficult / Forgotten words:** danh sách các từ `status = difficult` hoặc `failure_count > 0` gần đây nhất, kèm nhãn số lần quên (`Forgotten Nx`), link "View all" sang Vocabulary đã filter.
- **Tổng quan:** tổng số từ trong DB, số từ theo từng status (new/learning/difficult).

Để tính Streak, cần thêm cột phụ trợ hoặc suy ra từ `daily_progress`: một ngày được coi là "có hoạt động" nếu `new_learned > 0 OR reviewed_count > 0`; streak = số ngày liên tiếp tính từ hôm nay lùi về trước đều có hoạt động.

## 10. API endpoints (tóm tắt)

- `GET /api/session/today` — trả về hàng đợi thẻ hôm nay (đã áp dụng hạn mức).
- `POST /api/reviews/:wordId` — body `{ exercise_type, result }`, cập nhật `review_state`, ghi `review_log`, cập nhật `daily_progress`.
- `GET /api/words`, `POST /api/words`, `PUT /api/words/:id`, `DELETE /api/words/:id`.
- `POST /api/words/import` — nhận CSV (multipart hoặc raw text), parse, validate, insert.
- `GET /api/dashboard` — số liệu tổng quan: new/due hôm nay, streak, accuracy, tổng số từ theo status, danh sách difficult/forgotten gần nhất.
- `GET /api/dashboard/reviews-chart?days=7` — số lượt ôn + từ mới theo từng ngày, phục vụ bar chart.

## 11. Testing

- Unit test thuật toán lịch ôn (`review_state` transitions) cho từng nhánh: chuỗi cố định, interval nhân hệ số, difficult, chuyển đổi giữa các trạng thái — dùng Jest hoặc Vitest, mock `Date.now`.
- Unit test logic chọn từ hàng ngày (hạn mức 20 mới / 100 ôn, dồn ngày sau).
- Unit test parser CSV (dòng hợp lệ, dòng thiếu field, dòng segments rỗng).
- Integration test cơ bản cho API endpoints chính, mock Supabase client (không cần DB thật) hoặc chạy nhắm vào Supabase project test riêng.
- Không cần test UI tự động (E2E) cho bản đầu; kiểm thử tay trên Study flow là đủ.
