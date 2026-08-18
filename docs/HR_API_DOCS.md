# HR / Leave / Attendance API Documentation

## Phạm vi tài liệu

Nhánh này của FE (`g-care-app`, Zalo Mini App) chỉ còn đúng **1 domain nghiệp vụ: HR** (chấm công, nghỉ phép, dashboard nội bộ, tin tức). Toàn bộ UI/logic nghiệp vụ thu hồi nợ G-Care cũ (contract / survey / followup / upload ảnh) đã bị gỡ khỏi FE trên nhánh này.

HR **chưa có BE**, toàn bộ đang chạy bằng mock data / `setTimeout` giả lập trong FE. Tài liệu này đặc tả API cần xây cho BE dựa trên rà soát toàn bộ màn hình liên quan.

Quy ước path: đề xuất gộp vào prefix `/api/g-care/` hiện có (giữ nguyên vì đây là namespace backend thật đang phục vụ auth, xem dưới), thêm nhóm con `hr/` để tách domain rõ ràng và không đụng route hiện có:

```
/api/g-care/hr/leave/...
/api/g-care/hr/attendance/...
/api/g-care/hr/dashboard/...
/api/g-care/hr/news/...
/api/g-care/hr/approvers
```

Auth dùng chung endpoint xác thực sẵn có của backend (`Authorization: Bearer <access_token>`, JWT lấy từ `POST /api/g-care/auth`, đã có tài liệu tại [`GCARE_API.md`](../GCARE_API.md)) — **không** cần login riêng cho domain HR, và cũng không cần build lại phần auth.

---

## 1. Quy ước chung

- **Response envelope**: dùng đúng envelope đã chuẩn ở BE thật — `{"status": "success", "data": ...}` cho GET/list, `{"status": "created", "data": ...}` cho POST tạo mới, đúng như ví dụ trong [`GCARE_API.md`](../GCARE_API.md). **Không dùng** kiểu `{result_code, data}` đang khai báo (nhưng không dùng tới) trong `apiClient.ts` — xem mục 6.
- **Lỗi**: theo đúng convention hiện có của `apiClient.ts` — non-2xx trả `{"message": "..."}` hoặc `{"message": ["...", "..."]}`. Token hết hạn trả JSON có `{"code": "token_not_valid", ...}` (FE tự logout khi thấy field này, không nhất thiết cần HTTP 401 kèm theo, nhưng nên trả 401 luôn cho chuẩn).
- **Phân trang**: các API danh sách trong tài liệu này đề xuất `page`, `page_size` (default `page_size=20`), response bọc thêm `meta: {total, page, page_size}` bên trong `data` — vì FE hiện chưa có UI phân trang nên BE cứ trả kèm, FE sẽ bổ sung sau.
- **Ngày giờ**: FE hiện dùng `date` (yyyy-mm-dd, input `type=date`) và hiển thị `dd/mm/yyyy`. Đề xuất BE luôn trả/nhận ISO `YYYY-MM-DD` cho ngày, `YYYY-MM-DDTHH:mm:ssZ` cho timestamp.

---

## 2. Leave Request (Nghỉ phép)

Áp dụng cho: `pages/leaveCreate`, `pages/leaveList`, `pages/leaveApproval` (list + detail), `pages/home/AdminDashboard.tsx` (mục "Chờ duyệt"), `pages/home/MemberDashboard.tsx` (mục "Đơn gần đây").

### 2.1 Model `LeaveRequest`

```json
{
  "id": 1,
  "user_id": 42,
  "requester_name": "Nguyễn Văn A",
  "avatar_initial": "A",
  "leave_type": "annual",
  "leave_type_label": "Nghỉ phép có lương",
  "start_date": "2026-08-20",
  "end_date": "2026-08-20",
  "duration_days": 1,
  "duration_label": "1 ngày",
  "attendance_date": null,
  "correction_time": null,
  "status": "pending",
  "approver_id": 7,
  "approver_name": "Trần Thị B (Trưởng nhóm)",
  "reason": "Việc gia đình",
  "decided_at": null,
  "decided_by": null,
  "decision_note": null,
  "created_at": "2026-08-18T09:00:00Z",
  "updated_at": "2026-08-18T09:00:00Z"
}
```

- `leave_type` enum: `annual` (nghỉ phép có lương), `unpaid` (không lương), `maternity` (thai sản), `feedback` (giải trình/điều chỉnh công — sinh từ màn hình Lịch sử chấm công, xem mục 3.3). BE nên trả kèm `leave_type_label` để FE khỏi tự map (hiện FE map cứng trong `leaveCreate`).
- `attendance_date` + `correction_time`: chỉ có giá trị khi `leave_type = "feedback"` — ngày công cần giải trình và giờ chấm công thực tế nhập tay (input `type=time` trên form).
- `status` enum: `pending | approved | rejected`.
- `duration_days`: BE tự tính từ `start_date`/`end_date` (hoặc theo bảng chấm công nếu cần trừ ngày lễ/cuối tuần) — FE hiện chỉ hiển thị chuỗi tự do (`"0.5 ngày"`, `"180 ngày"`...), nên cần BE trả cả `duration_days` (number, hỗ trợ 0.5/0.25 cho nghỉ nửa/¼ ngày) lẫn `duration_label` (chuỗi hiển thị sẵn).

### 2.2 Tạo đơn nghỉ phép

- Method: `POST`
- URL: `/api/g-care/hr/leave`
- Header: `Authorization: Bearer <access_token>`
- Body:
  ```json
  {
    "leave_type": "annual",
    "approver_id": 7,
    "start_date": "2026-08-20",
    "end_date": "2026-08-20",
    "reason": "Việc gia đình",
    "attendance_date": null,
    "correction_time": null
  }
  ```
- Validate: `reason` bắt buộc (FE giới hạn 200 ký tự), `attendance_date`+`correction_time` bắt buộc khi `leave_type = "feedback"`.
- Response (200/201):
  ```json
  { "status": "created", "data": { "id": 123, "status": "pending", "...": "toàn bộ field model 2.1" } }
  ```
- Ghi chú: màn hình `leaveCreate` được vào từ 2 nơi — menu "Tạo đơn" (leave_type mặc định `annual`) và từ `histories` khi bấm vào ngày công bất thường chưa giải trình (`?date=YYYY-MM-DD` → leave_type mặc định `feedback`, `attendance_date` = query param).

### 2.3 Danh sách đơn của tôi

- Method: `GET`
- URL: `/api/g-care/hr/leave/mine`
- Query: `status` (optional: `pending|approved|rejected`, bỏ trống = tất cả), `page`, `page_size`
- Response: `{"status": "success", "data": {"items": [LeaveRequest...], "meta": {...}}}`
- Dùng bởi: `leaveList/index.tsx` (tab filter `all|pending|approved|rejected`).

### 2.4 Danh sách đơn chờ duyệt (quản lý)

- Method: `GET`
- URL: `/api/g-care/hr/leave/approval`
- Header: yêu cầu role có quyền duyệt (approver/admin) — BE tự lọc theo `approver_id = current_user` hoặc theo `admin`.
- Query: `status` (default trả tất cả trạng thái BE quản lý), `page`, `page_size`
- Response: giống 2.3, kèm thêm field đếm để hiển thị badge tab "Chờ duyệt (n)":
  ```json
  { "status": "success", "data": { "items": [...], "pending_count": 4, "meta": {...} } }
  ```
- Ghi chú: FE hiện hardcode badge `(2)` trên tab — cần BE trả `pending_count` thật để sửa.

### 2.5 Chi tiết đơn

- Method: `GET`
- URL: `/api/g-care/hr/leave/<id>`
- Response: `{"status": "success", "data": LeaveRequest}`
- Dùng bởi: `leaveApproval/detail.tsx` (đọc `id` từ query string `?id=`).

### 2.6 Duyệt / Từ chối đơn

- Method: `PATCH`
- URL: `/api/g-care/hr/leave/<id>/approve` hoặc `/api/g-care/hr/leave/<id>/reject`
- Body (reject nên bắt buộc lý do, approve optional):
  ```json
  { "note": "Lý do từ chối (nếu có)" }
  ```
- Quyền: chỉ `approver_id` của đơn hoặc admin mới được gọi; chỉ hợp lệ khi `status = pending`.
- Response: `{"status": "success", "data": LeaveRequest}` (status đã đổi thành `approved`/`rejected`, kèm `decided_at`, `decided_by`).
- Ghi chú: đây là API **quan trọng nhất còn thiếu** — hiện `handleApprove`/`handleReject` trong `leaveApproval/detail.tsx` chỉ `setTimeout` giả rồi quay lại màn trước, **không lưu gì cả**.

### 2.7 Danh sách người duyệt (approver lookup)

- Method: `GET`
- URL: `/api/g-care/hr/approvers`
- Response:
  ```json
  { "status": "success", "data": [
    { "id": 7, "name": "Trần Thị B", "role_label": "Trưởng nhóm" },
    { "id": 8, "name": "Phòng Hành chính Nhân sự", "role_label": "HR" }
  ] }
  ```
- Ghi chú: `leaveCreate/index.tsx` hiện hardcode đúng 2 lựa chọn này (`manager_1`, `hr_1`) trong code — cần API để thay bằng danh sách thật (org chart/quản lý trực tiếp).

### 2.8 Quỹ phép năm (leave balance)

- Method: `GET`
- URL: `/api/g-care/hr/leave/balance`
- Query: `year` (optional, default năm hiện tại)
- Response:
  ```json
  { "status": "success", "data": { "year": 2026, "total": 12, "used": 3.5, "remaining": 8.5 } }
  ```
- Dùng bởi: `home/MemberDashboard.tsx` — hiện là hằng số cứng `LEAVE_BALANCE_DATA` dùng chung cho mọi user.

---

## 3. Attendance (Chấm công)

Áp dụng cho: `pages/histories` (lịch sử chấm công theo tháng), thẻ "Check-in/Check-out" trong `AdminDashboard`/`MemberDashboard`.

### 3.1 Check-in / Check-out

- Method: `POST`
- URL: `/api/g-care/hr/attendance/checkin` và `/api/g-care/hr/attendance/checkout`
- Body: rỗng, hoặc `{"location": {"latitude": ..., "longitude": ...}}` nếu sau này cần xác thực vị trí chấm công (hiện FE chưa gửi location ở bước này, chỉ ghi giờ hệ thống).
- Response:
  ```json
  { "status": "success", "data": { "checkin_time": "2026-08-18T08:02:00Z", "checkout_time": null } }
  ```
- Validate: không cho check-in 2 lần/ngày; không cho check-out trước khi check-in.
- Ghi chú: hiện tại `handleCheckin` trong 2 dashboard chỉ lưu `Date` vào state React — mất khi reload trang, không có giá trị thật. Cần thêm `GET /api/g-care/hr/attendance/today` để dashboard load lại đúng trạng thái đã check-in khi mở lại app trong ngày (FE hiện chưa gọi API nào lúc mount cho phần này).

### 3.2 Lịch sử chấm công theo tháng

- Method: `GET`
- URL: `/api/g-care/hr/attendance/history`
- Query: `year`, `month` (vd `year=2026&month=8`)
- Response:
  ```json
  {
    "status": "success",
    "data": [
      { "date": "2026-08-01", "status_code": "X", "has_feedback": false, "feedback_request_id": null },
      { "date": "2026-08-02", "status_code": "Ro", "has_feedback": true, "feedback_request_id": 88 }
    ]
  }
  ```
- `status_code` enum (bắt buộc BE dùng đúng các mã này, khớp `ATTENDANCE_STATUSES` FE đang định nghĩa cứng ở `histories/index.tsx`):

  | Code | Ý nghĩa |
  |------|---------|
  | `X` | Đủ công |
  | `L` | Công lễ |
  | `P` | Công phép (nghỉ phép cả ngày) |
  | `P/2` | Nửa ngày phép |
  | `P/4` | 1/4 ngày phép |
  | `M1` | Muộn 1 (mức cảnh báo 1) |
  | `M2` | Muộn 2 (mức cảnh báo 2) |
  | `x/2` | Nửa ngày công |
  | `x3/4` | 3/4 ngày công |
  | `Ro` | Không phép (vắng không lý do) |
  | `B` | Bù phép (công bù) |

- Ghi chú: FE hiện **sinh ngẫu nhiên** (`Math.random()`) toàn bộ dữ liệu tháng mỗi lần render — đây là API cần thay thế trực tiếp, không phải bổ sung tính năng mới.

### 3.3 Giải trình công (feedback/correction)

Không phải API riêng — đây chính là `LeaveRequest` với `leave_type = "feedback"` (mục 2.2/2.5). Luồng: user bấm vào 1 ngày "bất thường" (status_code không thuộc `X|L|P`) trong `histories`:
- Nếu `has_feedback = false` → điều hướng sang màn tạo đơn (`POST /api/g-care/hr/leave` với `leave_type=feedback`, `attendance_date` = ngày đã chọn).
- Nếu `has_feedback = true` → xem chi tiết đơn đã tạo, tức `GET /api/g-care/hr/leave/<feedback_request_id>` (mục 2.5) — **hiện FE đang hiển thị nội dung hardcode trong Modal thay vì gọi API này**, cần nối lại khi có BE.

---

## 4. Dashboard

### 4.1 Dashboard Admin

- Method: `GET`
- URL: `/api/g-care/hr/dashboard/admin`
- Response:
  ```json
  {
    "status": "success",
    "data": {
      "team_statistics": {
        "total_employees": 25,
        "present": 20,
        "absent": { "total": 5, "approved": 3, "unapproved": 2 },
        "pending_approvals": 4
      },
      "pending_leave_requests": [ "3 LeaveRequest gần nhất, status=pending" ],
      "absent_today": [
        { "id": 1, "name": "Lê Văn C", "role_label": "Nhân viên", "leave_type_label": "Nghỉ ốm", "avatar_initial": "C" }
      ]
    }
  }
  ```
- Thay thế 3 mock: `TEAM_STATISTICS`, top-3 `pending` trong `MOCK_LEAVE_REQUESTS`, `ABSENCE_LIST`.
- `pending_leave_requests` nên giới hạn server-side (BE trả sẵn 3 item mới nhất) thay vì FE tự cắt mảng như hiện tại.

### 4.2 Dashboard Member

- Method: `GET`
- URL: `/api/g-care/hr/dashboard/member`
- Response:
  ```json
  {
    "status": "success",
    "data": {
      "leave_balance": { "total": 12, "used": 3.5, "remaining": 8.5 },
      "recent_requests": [ "2-3 LeaveRequest gần nhất của user, mọi status" ]
    }
  }
  ```
- Thay thế: hằng số `LEAVE_BALANCE_DATA` và 2 dòng JSX hardcode "Đơn gần đây" trong `MemberDashboard.tsx` (hiện không map từ mảng nào cả, cần sửa cả FE lẫn thêm API).

---

## 5. News (Tin tức nội bộ)

Áp dụng: `components/home/NewsSection.tsx`, hiển thị trên cả 2 dashboard.

### 5.1 Danh sách tin

- Method: `GET`
- URL: `/api/g-care/hr/news`
- Query: `page`, `page_size`, `category` (optional)
- Response:
  ```json
  { "status": "success", "data": { "items": [
    { "id": 1, "title": "...", "content": "...", "image": "https://...", "is_new": true, "category": "Thông báo", "published_at": "2026-08-17T00:00:00Z" }
  ], "meta": {...} } }
  ```
- Ghi chú: field `categoryClasses` (class Tailwind) hiện FE tự tính từ `category` — không cần BE trả, giữ nguyên logic FE, BE chỉ cần trả `category` (string) là đủ.

### 5.2 Chi tiết tin (nếu cần riêng, hiện Sheet dùng luôn data đã có từ list)

- Method: `GET`
- URL: `/api/g-care/hr/news/<id>`
- Response: 1 object như trên. Optional — vì `NewsSection.tsx` hiện chỉ mở `Sheet` bằng data đã có sẵn trong danh sách, không gọi thêm API nào.

---

## 6. Vấn đề auth / apiClient cần đội BE xác nhận

Auth là phần backend chung duy nhất còn lại từ hệ thống cũ (đã có tài liệu ở [`GCARE_API.md`](../GCARE_API.md)) mà domain HR sẽ dùng lại. Rà soát FE thực tế phát hiện các điểm **lệch giữa code và tài liệu BE đã viết** cho phần auth này — cần đội FE và BE thống nhất trước khi build phần HR để tránh lặp lại lỗi tương tự:

1. **Path login sai**: `src/services/userApi.ts` gọi `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` — nhưng BE thật theo `GCARE_API.md` là `POST /api/g-care/auth`, `POST /api/g-care/refresh`, `GET /api/g-care/me`. FE cần sửa lại đúng path.
2. **Response shape login không khớp 2 nơi trong FE**: `pages/login/index.tsx` đọc `res.data.accessToken` + `res.data.user`; hook `usePermissionData.ts` (Zalo silent-login, hiện chưa gắn vào page nào) đọc `res.data.user` + `res.data.token`. BE thật trả `{access_token, refresh_token}` (không có object `user` kèm theo) — cả 2 chỗ FE đang đọc sai field, và **thiếu** một lời gọi `GET /api/g-care/me` sau khi login để lấy thông tin user thật (hiện `user.email` trong `InfoSection` luôn rỗng vì không có nguồn nào set).
3. **`REFRESH_TOKEN`/`ME` khai báo nhưng không nơi nào gọi** — cần bổ sung logic refresh khi access token hết hạn, và gọi `ME()` ngay sau login / khi load lại app.
4. **Response envelope không nhất quán trong `apiClient.ts`**: type `ApiResponse<T> = {result_code, data}` được khai báo nhưng không khớp với envelope thật `{status, data}` mà mọi page đang đọc (`res.status === "success"`) và mà `GCARE_API.md` mô tả. Nên sửa type khai báo cho khớp thực tế, tránh nhầm lẫn khi thêm domain HR.
5. **Bảo mật**: `login/index.tsx` lưu password dạng plaintext vào `localStorage` khi bật "Ghi nhớ đăng nhập" — nên đổi sang lưu `refresh_token` (đã có từ BE) thay vì password, tận dụng đúng API refresh đã tồn tại.
6. **`src/utils/encrypt.ts`** (dùng trong `usePermissionData.ts` chế độ `encrypt`) chỉ base64 + đảo byte liền kề — không phải mã hoá thật, không nên dùng để bảo vệ `access_token` nếu luồng Zalo silent-login được bật lại.

---

## 7. Mã hoặc luồng dead-code cần đội xác nhận trước khi bỏ qua trong spec

Các phần sau tồn tại trong code nhưng không được bất kỳ trang nào import/gọi tới — nếu không dùng nữa nên xoá, nếu còn dự định dùng thì cần API riêng (không nằm trong phạm vi tài liệu này vì không đủ context nghiệp vụ):

- `components/quickScanQR.tsx`, `components/modals/problemModal.tsx`, `components/modals/successModal.tsx` — ngôn ngữ "đơn hàng/giao hàng", có vẻ sót lại từ template khác, cần API kiểu Order/Delivery nếu giữ lại.
- `hooks/usePermissionData.ts` + `stores/useHasPermissionStore` — luồng đăng nhập ẩn danh qua Zalo, chưa gắn vào page nào.
- `services/dropdown.ts` (`GET logistics/dropdown`) + `services/apiResource.ts` (bộ helper REST chuẩn `list/detail/create/update/destroy`) — không trang nào gọi, nhưng là quy ước REST hợp lý nên áp dụng cho các API mới ở tài liệu này nếu BE muốn theo pattern generic.

---

## 8. Bảng tổng hợp: màn hình → API

| Màn hình | API cần |
|---|---|
| `login` | `POST /api/g-care/auth`, `GET /api/g-care/me` |
| `leaveCreate` | `POST /api/g-care/hr/leave`, `GET /api/g-care/hr/approvers` |
| `leaveList` | `GET /api/g-care/hr/leave/mine` |
| `leaveApproval` (list) | `GET /api/g-care/hr/leave/approval` |
| `leaveApproval/detail` | `GET /api/g-care/hr/leave/<id>`, `PATCH .../approve`, `PATCH .../reject` |
| `histories` | `GET /api/g-care/hr/attendance/history` |
| `home/AdminDashboard` | `GET /api/g-care/hr/dashboard/admin`, `POST /api/g-care/hr/attendance/checkin`\|`checkout`, `GET /api/g-care/hr/attendance/today`, `GET /api/g-care/hr/news` |
| `home/MemberDashboard` | `GET /api/g-care/hr/dashboard/member`, `POST /api/g-care/hr/attendance/checkin`\|`checkout`, `GET /api/g-care/hr/attendance/today`, `GET /api/g-care/hr/news` |
| `profile` | `GET /api/g-care/me` (đã có), logout chỉ xoá token phía client |
