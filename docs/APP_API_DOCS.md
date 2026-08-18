# Tài liệu Đặc tả API cho Mobile App (G-Care App)

Tài liệu này mô tả chi tiết toàn bộ các API được sử dụng cho ứng dụng **G-Care Mobile App / Zalo Mini App**.

---

## 1. Thông tin chung

* **Base URL:** `http://localhost:3000` *(hoặc domain production/staging)*
* **Global Prefix:** `/api/g-care`
* **Xác thực (Authentication):**
  * Hầu hết các API đều yêu cầu Access Token JWT truyền qua HTTP Header:
    ```http
    Authorization: Bearer <access_token>
    ```
* **Cấu trúc Response Envelope:**
  Tất cả các response thành công đều được bọc bởi interceptor chuẩn:
  ```json
  {
    "status": "success", // hoặc "created" đối với HTTP 201
    "data": { ... }
  }
  ```
* **Cấu trúc Response Lỗi:**
  ```json
  {
    "message": "Nội dung thông báo lỗi hoặc mảng các lỗi validation",
    "error": "Bad Request / Unauthorized / Forbidden / Not Found",
    "statusCode": 400
  }
  ```

---

## 2. Bảng tổng hợp API cho Mobile App

| STT | Module | Method | Endpoint đầy đủ | Chức năng | Auth |
| :---: | :--- | :---: | :--- | :--- | :---: |
| 1 | **Auth** | `POST` | `/api/g-care/auth/login` | Đăng nhập tài khoản | Không |
| 2 | **Auth** | `POST` | `/api/g-care/auth/refresh` | Làm mới Access Token | Không |
| 3 | **Auth** | `GET` | `/api/g-care/auth/me` | Lấy thông tin tài khoản đang đăng nhập | Có (JWT) |
| 4 | **Dashboard** | `GET` | `/api/g-care/app/dashboard/member` | Số liệu tổng quan màn hình chính Member | Có (JWT) |
| 5 | **Attendance** | `POST` | `/api/g-care/app/attendance/checkin` | Chấm công vào (Check-in) | Có (JWT) |
| 6 | **Attendance** | `POST` | `/api/g-care/app/attendance/checkout` | Chấm công ra (Check-out) | Có (JWT) |
| 7 | **Attendance** | `GET` | `/api/g-care/app/attendance/today` | Trạng thái chấm công hôm nay | Có (JWT) |
| 8 | **Attendance** | `GET` | `/api/g-care/app/attendance/history` | Lịch sử chấm công theo tháng/năm | Có (JWT) |
| 9 | **Leave** | `POST` | `/api/g-care/app/leave` | Tạo đơn xin nghỉ phép / giải trình công | Có (JWT) |
| 10 | **Leave** | `GET` | `/api/g-care/app/leave/mine` | Danh sách đơn của cá nhân tôi | Có (JWT) |
| 11 | **Leave** | `GET` | `/api/g-care/app/leave/approval` | Danh sách đơn gửi đến tôi để duyệt | Có (JWT) |
| 12 | **Leave** | `GET` | `/api/g-care/app/leave/balance` | Xem số ngày phép còn lại trong năm | Có (JWT) |
| 13 | **Leave** | `GET` | `/api/g-care/app/leave/:id` | Chi tiết đơn nghỉ phép | Có (JWT) |
| 14 | **Leave** | `PATCH` | `/api/g-care/app/leave/:id/approve` | Phê duyệt đơn xin nghỉ phép | Có (JWT) |
| 15 | **Leave** | `PATCH` | `/api/g-care/app/leave/:id/reject` | Từ chối đơn xin nghỉ phép | Có (JWT) |
| 16 | **News** | `GET` | `/api/g-care/app/news` | Danh sách tin tức, bài viết nội bộ | Không |
| 17 | **News** | `GET` | `/api/g-care/app/news/:id` | Chi tiết một bài viết tin tức | Không |
| 18 | **Approvers** | `GET` | `/api/g-care/app/approvers` | Danh sách người có quyền duyệt đơn | Có (JWT) |

---

## 3. Chi tiết từng API

### 3.1 Module: Auth (Xác thực)

#### 1. Đăng nhập
* **Endpoint:** `POST /api/g-care/auth/login`
* **Mô tả:** Đăng nhập bằng `username` và `password` để lấy token.
* **Request Body:**
  ```json
  {
    "username": "nguyenvana",
    "password": "password123"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi...",
      "user": {
        "id": 1,
        "username": "nguyenvana",
        "email": "vana@g-care.vn",
        "firstName": "Văn A",
        "lastName": "Nguyễn",
        "role": "MEMBER",
        "isApprover": false
      }
    }
  }
  ```

#### 2. Làm mới Token
* **Endpoint:** `POST /api/g-care/auth/refresh`
* **Request Body:**
  ```json
  {
    "refreshToken": "eyJhbGciOi..."
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

#### 3. Thông tin tài khoản hiện tại
* **Endpoint:** `GET /api/g-care/auth/me`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "sub": 1,
      "username": "nguyenvana",
      "role": "MEMBER",
      "iat": 1723968000,
      "exp": 1724054400
    }
  }
  ```

---

### 3.2 Module: Dashboard Member

#### 4. Dữ liệu tổng quan màn hình chính
* **Endpoint:** `GET /api/g-care/app/dashboard/member`
* **Headers:** `Authorization: Bearer <access_token>`
* **Mô tả:** Lấy thông tin chấm công hôm nay, số phép còn lại, số ngày công trong tháng và danh sách đơn gần đây.
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "today_attendance": {
        "date": "2026-08-18",
        "status": "checked_in",
        "status_label": "Đã check-in",
        "check_in_time": "08:15",
        "check_out_time": null
      },
      "leave_balance": {
        "year": 2026,
        "total": 12,
        "used": 2.5,
        "remaining": 9.5
      },
      "month_stats": {
        "year": 2026,
        "month": 8,
        "work_days": 14,
        "late_count": 1,
        "leave_days": 1
      },
      "recent_leave_requests": [
        {
          "id": 10,
          "leave_type": "annual",
          "leave_type_label": "Nghỉ phép có lương",
          "start_date": "2026-08-20",
          "end_date": "2026-08-20",
          "duration_days": 1,
          "duration_label": "1 ngày",
          "status": "pending",
          "created_at": "2026-08-18T07:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### 3.3 Module: Attendance (Chấm công)

#### 5. Chấm công vào (Check-in)
* **Endpoint:** `POST /api/g-care/app/attendance/checkin`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 101,
      "date": "2026-08-18",
      "check_in_time": "08:25",
      "check_out_time": null,
      "status": "checked_in",
      "status_label": "Đã check-in",
      "is_late": false
    }
  }
  ```

#### 6. Chấm công ra (Check-out)
* **Endpoint:** `POST /api/g-care/app/attendance/checkout`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 101,
      "date": "2026-08-18",
      "check_in_time": "08:25",
      "check_out_time": "17:35",
      "status": "checked_out",
      "status_label": "Đã check-out",
      "working_hours": 8.17
    }
  }
  ```

#### 7. Trạng thái chấm công hôm nay
* **Endpoint:** `GET /api/g-care/app/attendance/today`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "date": "2026-08-18",
      "check_in_time": "08:25",
      "check_out_time": null,
      "status": "checked_in",
      "status_label": "Đã check-in"
    }
  }
  ```

#### 8. Lịch sử chấm công
* **Endpoint:** `GET /api/g-care/app/attendance/history`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:**
  * `year` *(optional, number)*: Năm (mặc định năm hiện tại)
  * `month` *(optional, number)*: Tháng từ 1-12 (mặc định tháng hiện tại)
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "year": 2026,
      "month": 8,
      "summary": {
        "total_work_days": 12,
        "late_days": 1,
        "early_leave_days": 0
      },
      "records": [
        {
          "id": 101,
          "date": "2026-08-18",
          "check_in_time": "08:25",
          "check_out_time": "17:30",
          "status": "completed",
          "status_label": "Đủ công"
        }
      ]
    }
  }
  ```

---

### 3.4 Module: Leave (Đơn xin nghỉ phép / Giải trình công)

#### 9. Tạo đơn mới
* **Endpoint:** `POST /api/g-care/app/leave`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "leave_type": "annual", // "annual" | "unpaid" | "maternity" | "feedback"
    "start_date": "2026-08-20",
    "end_date": "2026-08-21",
    "approver_id": 2,
    "reason": "Bận việc gia đình",
    "attendance_date": null, // Dành riêng cho loại feedback (giải trình công), VD: "2026-08-17"
    "correction_time": null  // Dành riêng cho feedback, VD: "08:30"
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "status": "created",
    "data": {
      "id": 15,
      "user_id": 1,
      "requester_name": "Nguyễn Văn A",
      "leave_type": "annual",
      "leave_type_label": "Nghỉ phép có lương",
      "start_date": "2026-08-20",
      "end_date": "2026-08-21",
      "duration_days": 2,
      "duration_label": "2 ngày",
      "status": "pending",
      "approver_id": 2,
      "approver_name": "Trần Thị Quản Lý",
      "reason": "Bận việc gia đình",
      "created_at": "2026-08-18T07:45:00.000Z"
    }
  }
  ```

#### 10. Danh sách đơn của tôi
* **Endpoint:** `GET /api/g-care/app/leave/mine`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:**
  * `page` *(optional, number, default: 1)*
  * `page_size` *(optional, number, default: 20)*
  * `status` *(optional, enum: `pending`, `approved`, `rejected`)*
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "items": [
        {
          "id": 15,
          "leave_type": "annual",
          "leave_type_label": "Nghỉ phép có lương",
          "start_date": "2026-08-20",
          "end_date": "2026-08-21",
          "duration_days": 2,
          "duration_label": "2 ngày",
          "status": "pending",
          "approver_name": "Trần Thị Quản Lý",
          "reason": "Bận việc gia đình",
          "created_at": "2026-08-18T07:45:00.000Z"
        }
      ],
      "meta": {
        "total": 1,
        "page": 1,
        "page_size": 20,
        "total_pages": 1
      }
    }
  }
  ```

#### 11. Danh sách đơn cần tôi phê duyệt
* **Endpoint:** `GET /api/g-care/app/leave/approval`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:** `page`, `page_size`, `status`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "items": [ ... ],
      "pending_count": 2,
      "meta": {
        "total": 5,
        "page": 1,
        "page_size": 20,
        "total_pages": 1
      }
    }
  }
  ```

#### 12. Tra cứu số ngày phép còn lại
* **Endpoint:** `GET /api/g-care/app/leave/balance`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:** `year` *(optional, number)*
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "year": 2026,
      "total": 12,
      "used": 2.5,
      "remaining": 9.5
    }
  }
  ```

#### 13. Chi tiết đơn nghỉ phép
* **Endpoint:** `GET /api/g-care/app/leave/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 15,
      "user_id": 1,
      "requester_name": "Nguyễn Văn A",
      "leave_type": "annual",
      "leave_type_label": "Nghỉ phép có lương",
      "start_date": "2026-08-20",
      "end_date": "2026-08-21",
      "duration_days": 2,
      "duration_label": "2 ngày",
      "status": "pending",
      "approver_id": 2,
      "approver_name": "Trần Thị Quản Lý",
      "reason": "Bận việc gia đình",
      "decided_at": null,
      "decided_by": null,
      "decision_note": null,
      "created_at": "2026-08-18T07:45:00.000Z"
    }
  }
  ```

#### 14. Phê duyệt đơn (Dành cho Quản lý / Người duyệt)
* **Endpoint:** `PATCH /api/g-care/app/leave/:id/approve`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "note": "Đồng ý phê duyệt" // optional
  }
  ```

#### 15. Từ chối đơn
* **Endpoint:** `PATCH /api/g-care/app/leave/:id/reject`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "note": "Lý do từ chối (bắt buộc)"
  }
  ```

---

### 3.5 Module: News (Tin tức & Bài viết)

#### 16. Danh sách tin tức
* **Endpoint:** `GET /api/g-care/app/news`
* **Query Parameters:**
  * `page` *(optional, number, default: 1)*
  * `page_size` *(optional, number, default: 20)*
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "items": [
        {
          "id": 1,
          "title": "Thông báo lịch nghỉ lễ Quốc Khánh",
          "summary": "Công ty thông báo lịch nghỉ lễ 2/9 cho toàn thể CBNV",
          "thumbnail": "https://cdn.domain.com/news/1.jpg",
          "published_at": "2026-08-15T08:00:00.000Z"
        }
      ],
      "meta": {
        "total": 1,
        "page": 1,
        "page_size": 20,
        "total_pages": 1
      }
    }
  }
  ```

#### 17. Chi tiết tin tức
* **Endpoint:** `GET /api/g-care/app/news/:id`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "title": "Thông báo lịch nghỉ lễ Quốc Khánh",
      "summary": "Công ty thông báo lịch nghỉ lễ 2/9 cho toàn thể CBNV",
      "content": "<p>Nội dung chi tiết bài viết HTML hoặc Markdown...</p>",
      "thumbnail": "https://cdn.domain.com/news/1.jpg",
      "published_at": "2026-08-15T08:00:00.000Z",
      "created_at": "2026-08-15T08:00:00.000Z"
    }
  }
  ```

---

### 3.6 Module: Approvers (Danh sách người duyệt)

#### 18. Lấy danh sách người duyệt
* **Endpoint:** `GET /api/g-care/app/approvers`
* **Headers:** `Authorization: Bearer <access_token>`
* **Mô tả:** Lấy danh sách CBNV có quyền phê duyệt (`isApprover = true`) để hiển thị dropdown khi tạo đơn xin nghỉ phép.
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 2,
        "name": "Trần Thị Quản Lý",
        "username": "quanly_tt",
        "email": "quanly@g-care.vn"
      }
    ]
  }
  ```
