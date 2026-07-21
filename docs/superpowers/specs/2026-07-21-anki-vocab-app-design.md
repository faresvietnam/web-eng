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

UI phải theo đúng mockup hiện hữu ở [`VocabApp.dc.html`](../../../VocabApp.dc.html) (asset gốc: `_ds/`, `support.js`) — layout, copy, và bảng màu bên dưới lấy trực tiếp từ file này. Đây là bản mockup tĩnh (dữ liệu mẫu hard-code); phần "Học phí" — dữ liệu/hành vi thật (fetch API, spaced repetition, v.v.) implement theo mục 1–8, chỉ phần khung nhìn/bố cục lấy theo mockup.

### Bảng màu & thành phần dùng chung (từ mockup)
- Primary xanh `#2563eb` (nền nhạt `#dbeafe`), tím `#7c3aed` (nhạt `#ede9fe`), xanh lá `#16a34a` (nhạt `#dcfce7`), cam `#d97706` (nhạt `#fef3c7`), đỏ `#dc2626` (nhạt `#fee2e2`).
- Chữ: ink `#111827`, ink phụ `#4b5563`, ink nhạt `#9ca3af`. Nền trang `#f7f8fa`, nền card `#ffffff`, viền `#e5e7eb`.
- Font hệ thống (`-apple-system, "Segoe UI", ...`), không dùng UI framework — style plain CSS/inline style như mockup.
- Card bo góc 14px, viền 1px, shadow rất nhẹ. Nút bo góc 10px (`primary` nền xanh chữ trắng, `secondary` nền trắng viền xám). Input bo góc 10px, focus viền xanh.
- Tag trạng thái (pill nhỏ): `New` = nền `--sb-light`/chữ `--sb-dark`, `Learning` = nền xám nhạt/chữ ink phụ, `Difficult` = nền `--red-light`/chữ đỏ.

### Top bar
- Ô tìm kiếm rộng, placeholder "Search words, tags, examples...", gợi ý phím tắt `⌘K` ở góc phải ô.
- Góc phải: avatar tròn hiển thị chữ viết tắt người dùng (mockup: "VN").

### Sidebar cố định
- Logo + tên app "My Vocab" (subtitle mockup "Learn locally. Master daily." — **cập nhật lại subtitle vì dữ liệu nay lưu trên Supabase, không còn "locally"**, ví dụ "Master vocabulary daily.").
- 5 mục điều hướng (không có badge số đếm, không có mục Review/Statistics riêng — đã gộp): **Dashboard**, **Learn** (khởi động session Study hôm nay — bao gồm cả từ mới lẫn từ cần ôn, gộp chung), **Vocabulary** (word list), **Import**, **Settings**.
- Cuối sidebar: 2 card nhỏ —
  - Card trạng thái dữ liệu: **cập nhật copy so với mockup** (mockup ghi "Backup & Data — All data is stored only on this device", không còn đúng vì dữ liệu lưu trên Supabase cloud) → đổi thành ví dụ "Cloud sync — Dữ liệu được lưu trên Supabase, tự động đồng bộ."
  - Card "🔥 Daily goal": hiển thị `reviewed_today / review_limit` (từ `GET /api/dashboard`) kèm progress bar — cùng số liệu với "Mục tiêu hôm nay" trên Dashboard, chỉ là bản rút gọn trong sidebar.

### Màn hình Learn (Study — thẻ học/ôn)
- Card căn giữa, max-width ~680px.
- Góc trên: 2 tag (trạng thái `New`/`Learning`/`Difficult` + `part_of_speech`) bên trái; số thứ tự `x / tổng số thẻ hôm nay` bên phải.
- Giữa card: từ hiển thị lớn (48px, đậm) + nút tròn phát âm (icon loa, `window.speechSynthesis` giọng `en-US`); dưới đó là `ipa` kèm nút phát âm nhỏ.
- Vùng bài tập theo `exercise_type` (spec thuật toán ở mục 4/6/7/8, mockup chỉ minh họa layout trắc nghiệm):
  - `mc_en_vi` / `mc_vi_en`: lưới 2×2 nút đáp án full-width (`opt-btn2`); khi đã trả lời — đáp án đúng tô xanh lá, đáp án sai người dùng chọn tô đỏ, các đáp án còn lại mờ đi (`opacity: 0.5`).
  - `segment` / `full_type`: input text 1 dòng, Enter để submit; sai → viền đỏ (giữ nguyên hành vi rung nhẹ đã có ở spec cũ), cho nhập lại; nút phụ "Xem đáp án" (kích hoạt kết quả `again`) đặt cạnh input.
- Sau khi trả lời (`answered = true`), hiện bên dưới, phân tách bằng đường kẻ ngang:
  - "Meaning (Vietnamese)": nghĩa của từ, chữ đậm.
  - "Word breakdown" (chỉ khi có `segments`): các chip màu xen kẽ (chip 1 nền xanh dương nhạt, chip 2 nền xanh lá nhạt, dấu `+` ở giữa) kèm dòng chú thích nghĩa từng đoạn nếu có.
  - "Example sentence": câu ví dụ tiếng Anh (từ vựng chính tô màu xanh dương đậm), câu `example_vi` in nghiêng bên dưới kèm nút loa đọc câu ví dụ.
  - Nút "Thẻ tiếp theo →" full-width, màu primary, để sang thẻ kế tiếp.

### Màn hình Vocabulary (Danh sách từ vựng)
- Tiêu đề "Danh sách từ vựng".
- Bộ lọc dạng segmented control (không phải dropdown): "Tất cả" / "New" / "Learning" / "Difficult".
- Ô tìm kiếm bên phải, placeholder "Tìm theo từ, nghĩa, chủ đề..." (tìm theo `word`/`meaning`/`category`).
- Bảng trong 1 card, cột: **Từ**, **Loại từ** (`part_of_speech`), **Nghĩa** (`meaning`), **Chủ đề** (`category`), **Trạng thái** (tag màu theo status), **Ôn tiếp theo** — hiển thị dạng người-đọc-được (`Hôm nay` / `10 phút nữa` / `1 ngày nữa` / `3 ngày nữa` / ...), không hiển thị timestamp thô.
- Form thêm/sửa/xóa từ thủ công vẫn theo mục 10 (API `POST/PUT/DELETE /api/words`), đặt trong màn Import (xem dưới) theo đúng bố cục mockup — Vocabulary chỉ là bảng danh sách + filter + search, không có form ở đây.

### Màn hình Import
- Tiêu đề "Import vocabulary".
- Card 1: segmented control 3 lựa chọn "CSV / Excel" / "Paste text" / "From clipboard" (v1 chỉ cần implement "CSV / Excel" theo mục 10; 2 lựa chọn còn lại hiển thị nhưng có thể chưa hoạt động — không mở rộng scope ngoài API `POST /api/words/import` đã đặc tả).
  - Vùng drag-and-drop viền nét đứt: "Drag & drop a CSV or Excel file here" + link "or click to browse".
  - Card phụ bên phải "CSV format tip": liệt kê đúng các cột theo mục 10 — `word, meaning, category, part_of_speech, ipa, example, example_vi, segments` — kèm link "↓ Download template.csv" (file mẫu tải về, header đúng các cột trên, không có Excel `.xlsx` trong v1).
- Card 2 "Hoặc thêm thủ công": form 2 cột — Word, Meaning, Category, Part of speech, IPA, Segments (mỗi ô 1 cột), Example và Example (VI) (mỗi ô full-width 2 cột) — nút "Lưu từ" cuối form. Đây chính là form tạo từ thủ công (`POST /api/words`), đặt trong màn Import thay vì Vocabulary để khớp mockup.

### Màn hình Dashboard (chi tiết)
- **Cột trái:**
  - Card "Mục tiêu hôm nay": progress bar `reviewed_today / review_limit` (ví dụ `40 / 100`), bên dưới là dòng tổng quan: Tổng số từ, New, Learning, Difficult (đếm theo `status`).
  - Card xem trước thẻ tiếp theo (không thay flow Learn, chỉ là bản xem nhanh): tag trạng thái + `part_of_speech`, counter `x/tổng`, từ lớn + phát âm + `ipa`, "Meaning (Vietnamese)", "Word breakdown" (chip), "Example sentence" + `example_vi`, nút "Next" để xoay vòng xem các thẻ mẫu (không tính là đã học, không gọi `POST /api/reviews`).
- **Cột phải:**
  - "Today": lưới 2×2 stat-card — **New words** (`new_learned_today`/`new_limit`), **Reviews due** (`due_count`), **Streak** (số ngày), **Accuracy** (%).
  - Card "Reviews" kèm dropdown "7 days": bar chart số lượt ôn theo ngày, lấy từ `GET /api/dashboard/reviews-chart?days=7`.
  - Card "Difficult / Forgotten words": danh sách từ `status = difficult` hoặc `failure_count > 0`, mỗi dòng có chấm đỏ + từ + nghĩa + nhãn `Forgotten Nx`; link "View all →" điều hướng sang Vocabulary đã filter theo Difficult.

Để tính Streak, cần thêm cột phụ trợ hoặc suy ra từ `daily_progress`: một ngày được coi là "có hoạt động" nếu `new_learned > 0 OR reviewed_count > 0`; streak = số ngày liên tiếp tính từ hôm nay lùi về trước đều có hoạt động.

### Màn hình Settings (mới, bổ sung theo mockup — trước đây chỉ có tên mục sidebar, chưa có nội dung)
- Card giới hạn học tập: 2 input số, **read-only** — "Số từ mới tối đa mỗi ngày" (`new_limit = 20`), "Số lượt ôn tối đa mỗi ngày" (`review_limit = 100`). Không cho chỉnh trong v1 (đúng Global Constraints — hạn mức hard-code).
- "Giọng đọc (TTS)": segmented control `en-US` / `en-GB` hiển thị theo mockup, nhưng **v1 chỉ hỗ trợ `en-US`** (theo mục 9 bản gốc và Global Constraints của plan) — lựa chọn `en-GB` hiển thị nhưng chưa có tác dụng, không mở rộng scope.
- Mục "Dữ liệu": mockup có nút nguy hiểm "Xóa toàn bộ dữ liệu" — **quyết định: không đưa vào v1** (giữ scope đúng plan hiện tại, YAGNI). Màn Settings v1 không render nút này; có thể bổ sung ở bản sau cùng với endpoint xóa dữ liệu tương ứng.

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
