# Tài liệu Đặc tả API cho Trang Quản Trị (G-Care Admin Portal)

Tài liệu này mô tả chi tiết toàn bộ các API được sử dụng cho hệ thống **G-Care Web Admin Portal**.

---

## 1. Thông tin chung

* **Base URL:** `http://localhost:3001` *(hoặc domain server backend)*
* **Global Prefix:** `/api/g-care`
* **Xác thực & Quyền hạn (Authentication & Authorization):**
  * Tất cả các endpoint trong module Admin đều được bảo vệ bởi **`JwtAuthGuard`** và **`RolesGuard`**.
  * Yêu cầu tài khoản có quyền **`ADMIN`** (`Role.ADMIN`).
  * Header bắt buộc:
    ```http
    Authorization: Bearer <access_token>
    ```
* **Cấu trúc Response Envelope chuẩn:**
  ```json
  {
    "status": "success", // hoặc "created" đối với HTTP 201
    "data": { ... }
  }
  ```
* **Cấu trúc Response Lỗi:**
  ```json
  {
    "message": "Nội dung thông báo lỗi hoặc danh sách lỗi validation",
    "error": "Bad Request / Unauthorized / Forbidden / Not Found",
    "statusCode": 400
  }
  ```

---

## 2. Bảng tổng hợp API cho Trang Admin

| STT | Module | Method | Endpoint đầy đủ | Chức năng | Phân quyền |
| :---: | :--- | :---: | :--- | :--- | :---: |
| 1 | **Auth** | `POST` | `/api/g-care/auth/login` | Đăng nhập Admin | Public |
| 2 | **Auth** | `POST` | `/api/g-care/auth/refresh` | Làm mới Access Token | Public |
| 3 | **Auth** | `GET` | `/api/g-care/auth/me` | Lấy thông tin tài khoản hiện tại | JWT |
| 4 | **Dashboard** | `GET` | `/api/g-care/admin/dashboard/admin` | Thống kê số liệu bảng điều khiển Admin | ADMIN |
| 5 | **Users** | `GET` | `/api/g-care/admin/users` | Danh sách người dùng / nhân viên | ADMIN |
| 6 | **Users** | `GET` | `/api/g-care/admin/users/:id` | Chi tiết thông tin một người dùng | ADMIN |
| 7 | **Users** | `POST` | `/api/g-care/admin/users` | Tạo mới tài khoản người dùng | ADMIN |
| 8 | **Users** | `PATCH` | `/api/g-care/admin/users/:id` | Cập nhật thông tin người dùng | ADMIN |
| 9 | **Users** | `DELETE` | `/api/g-care/admin/users/:id` | Xóa người dùng | ADMIN |
| 10 | **Leave** | `GET` | `/api/g-care/admin/leave` | Danh sách toàn bộ đơn xin nghỉ phép | ADMIN |
| 11 | **Leave** | `GET` | `/api/g-care/admin/leave/:id` | Chi tiết một đơn xin nghỉ phép | ADMIN |
| 12 | **Leave** | `PATCH` | `/api/g-care/admin/leave/:id/approve` | Duyệt đơn xin nghỉ phép | ADMIN |
| 13 | **Leave** | `PATCH` | `/api/g-care/admin/leave/:id/reject` | Từ chối đơn xin nghỉ phép | ADMIN |
| 14 | **News** | `POST` | `/api/g-care/admin/news` | Tạo bài viết tin tức mới | ADMIN |
| 15 | **News** | `PATCH` | `/api/g-care/admin/news/:id` | Chỉnh sửa bài viết tin tức | ADMIN |
| 16 | **News** | `DELETE` | `/api/g-care/admin/news/:id` | Xóa bài viết tin tức | ADMIN |
| 17 | **Approvers** | `GET` | `/api/g-care/admin/approvers` | Danh sách người có quyền duyệt | ADMIN |

---

## 3. Chi tiết từng API

### 3.1 Module: Auth (Xác thực)

#### 1. Đăng nhập Admin
* **Endpoint:** `POST /api/g-care/auth/login`
* **Request Body:**
  ```json
  {
    "username": "admin",
    "password": "AdminPassword123"
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
        "username": "admin",
        "email": "admin@g-care.vn",
        "firstName": "Admin",
        "lastName": "System",
        "role": "ADMIN",
        "isApprover": true
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

#### 3. Thông tin tài khoản Admin hiện tại
* **Endpoint:** `GET /api/g-care/auth/me`
* **Headers:** `Authorization: Bearer <access_token>`

---

### 3.2 Module: Dashboard Admin

#### 4. Thống kê số liệu tổng quan
* **Endpoint:** `GET /api/g-care/admin/dashboard/admin`
* **Headers:** `Authorization: Bearer <access_token>`
* **Mô tả:** Lấy tổng số nhân sự (phân loại theo role Admin, Member), số lượng nhân sự đi làm/nghỉ hôm nay, số đơn chờ duyệt và danh sách nghỉ phép hôm nay.
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "team_statistics": {
        "total_employees": 45,
        "total_admins": 5,
        "total_members": 40,
        "present": 40,
        "absent": {
          "total": 5,
          "approved": 3,
          "unapproved": 2
        },
        "pending_approvals": 4
      },
      "pending_leave_requests": [
        {
          "id": 12,
          "user_id": 3,
          "user_name": "Lê Văn C",
          "leave_type": "annual",
          "leave_type_label": "Nghỉ phép năm",
          "start_date": "2026-08-20",
          "end_date": "2026-08-21",
          "duration_days": 2.0,
          "reason": "Việc gia đình",
          "status": "pending",
          "created_at": "2026-08-18T08:00:00.000Z"
        }
      ],
      "absent_today": [
        {
          "id": 3,
          "name": "Lê Văn C",
          "role_label": "Nhân viên",
          "leave_type_label": "Không lương",
          "avatar_initial": "L"
        }
      ]
    }
  }
  ```

---

### 3.3 Module: Users Management (Quản lý Người dùng / Nhân viên)

#### 5. Danh sách Người dùng
* **Endpoint:** `GET /api/g-care/admin/users`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:**
  * `page` *(optional, number, default: 1)*
  * `limit` *(optional, number, default: 10)*
  * `search` *(optional, string)*: Tìm kiếm theo tên, username, email, số điện thoại
  * `role` *(optional, enum: `ADMIN`, `MANAGER`, `MEMBER`)*
  * `departmentId` *(optional, number)*
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "items": [
        {
          "id": 1,
          "username": "vana",
          "email": "vana@g-care.vn",
          "firstName": "Văn A",
          "lastName": "Nguyễn",
          "phone": "0987654321",
          "role": "MEMBER",
          "isApprover": false,
          "department": {
            "id": 1,
            "name": "Phòng Kỹ thuật"
          },
          "createdAt": "2026-01-15T08:00:00.000Z"
        }
      ],
      "meta": {
        "total": 45,
        "page": 1,
        "limit": 10,
        "totalPages": 5
      }
    }
  }
  ```

#### 6. Chi tiết Người dùng
* **Endpoint:** `GET /api/g-care/admin/users/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "username": "vana",
      "email": "vana@g-care.vn",
      "firstName": "Văn A",
      "lastName": "Nguyễn",
      "phone": "0987654321",
      "role": "MEMBER",
      "isApprover": false,
      "departmentId": 1,
      "department": {
        "id": 1,
        "name": "Phòng Kỹ thuật"
      }
    }
  }
  ```

#### 7. Tạo mới Người dùng
* **Endpoint:** `POST /api/g-care/admin/users`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "username": "nguyenvanb",
    "password": "Password123@",
    "email": "vanb@g-care.vn",
    "firstName": "Văn B",
    "lastName": "Nguyễn",
    "phone": "0912345678",
    "role": "MEMBER", // "ADMIN" | "MANAGER" | "MEMBER"
    "departmentId": 1,
    "isApprover": false
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "status": "created",
    "data": {
      "id": 46,
      "username": "nguyenvanb",
      "email": "vanb@g-care.vn",
      "firstName": "Văn B",
      "lastName": "Nguyễn",
      "role": "MEMBER"
    }
  }
  ```

#### 8. Cập nhật thông tin Người dùng
* **Endpoint:** `PATCH /api/g-care/admin/users/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "firstName": "Văn B Updated",
    "email": "new_email@g-care.vn",
    "role": "MANAGER",
    "isApprover": true
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 46,
      "username": "nguyenvanb",
      "firstName": "Văn B Updated",
      "role": "MANAGER",
      "isApprover": true
    }
  }
  ```

#### 9. Xóa Người dùng
* **Endpoint:** `DELETE /api/g-care/admin/users/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "message": "User deleted successfully"
    }
  }
  ```

---

### 3.4 Module: Leave Management (Quản lý Đơn Nghỉ phép)

#### 10. Danh sách toàn bộ Đơn nghỉ phép
* **Endpoint:** `GET /api/g-care/admin/leave`
* **Headers:** `Authorization: Bearer <access_token>`
* **Query Parameters:**
  * `page` *(optional, number, default: 1)*
  * `page_size` hoặc `limit` *(optional, number, default: 20)*
  * `status` *(optional, enum: `pending`, `approved`, `rejected`)*
  * `leave_type` *(optional, enum: `annual`, `unpaid`, `maternity`, `feedback`)*
  * `user_id` *(optional, number)*: Lọc theo nhân viên
  * `approver_id` *(optional, number)*: Lọc theo người duyệt
  * `search` *(optional, string)*: Tìm kiếm theo tên nhân viên hoặc lý do
  * `start_date` *(optional, string, YYYY-MM-DD)*: Từ ngày
  * `end_date` *(optional, string, YYYY-MM-DD)*: Đến ngày
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "items": [
        {
          "id": 12,
          "user_id": 5,
          "requester_name": "Trần Văn C",
          "avatar_initial": "C",
          "leave_type": "annual",
          "leave_type_label": "Nghỉ phép có lương",
          "start_date": "2026-08-22",
          "end_date": "2026-08-23",
          "duration_days": 2,
          "duration_label": "2 ngày",
          "attendance_date": null,
          "correction_time": null,
          "status": "pending",
          "approver_id": 2,
          "approver_name": "Lê Quản Lý",
          "reason": "Giải quyết việc cá nhân",
          "decided_at": null,
          "decided_by": null,
          "decision_note": null,
          "created_at": "2026-08-18T07:30:00.000Z",
          "updated_at": "2026-08-18T07:30:00.000Z"
        }
      ],
      "meta": {
        "total": 35,
        "page": 1,
        "page_size": 20,
        "total_pages": 2
      }
    }
  }
  ```

#### 11. Chi tiết Đơn nghỉ phép
* **Endpoint:** `GET /api/g-care/admin/leave/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 12,
      "user_id": 5,
      "requester_name": "Trần Văn C",
      "avatar_initial": "C",
      "leave_type": "annual",
      "leave_type_label": "Nghỉ phép có lương",
      "start_date": "2026-08-22",
      "end_date": "2026-08-23",
      "duration_days": 2,
      "duration_label": "2 ngày",
      "status": "pending",
      "approver_id": 2,
      "approver_name": "Lê Quản Lý",
      "reason": "Giải quyết việc cá nhân",
      "decided_at": null,
      "decided_by": null,
      "decision_note": null,
      "created_at": "2026-08-18T07:30:00.000Z",
      "updated_at": "2026-08-18T07:30:00.000Z"
    }
  }
  ```

#### 12. Duyệt đơn nghỉ phép
* **Endpoint:** `PATCH /api/g-care/admin/leave/:id/approve`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "note": "Admin đã duyệt đơn" // optional
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 12,
      "status": "approved",
      "decided_at": "2026-08-18T08:00:00.000Z",
      "decided_by": "Admin System",
      "decision_note": "Admin đã duyệt đơn"
    }
  }
  ```

#### 13. Từ chối đơn nghỉ phép
* **Endpoint:** `PATCH /api/g-care/admin/leave/:id/reject`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "note": "Lý do từ chối (bắt buộc)"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 12,
      "status": "rejected",
      "decided_at": "2026-08-18T08:00:00.000Z",
      "decided_by": "Admin System",
      "decision_note": "Không đủ người trực"
    }
  }
  ```

---

### 3.5 Module: News Management (Quản lý Tin tức / Bản tin)

#### 14. Tạo bài viết tin tức
* **Endpoint:** `POST /api/g-care/admin/news`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "title": "Chính sách phúc lợi mới 2026",
    "summary": "Tóm tắt ngắn gọn chính sách bảo hiểm và khám sức khỏe định kỳ",
    "content": "<h2>Chi tiết chính sách phúc lợi</h2><p>Toàn bộ nhân sự được hỗ trợ...</p>",
    "thumbnail": "https://cdn.domain.com/uploads/news-thumb-1.jpg",
    "isPublished": true
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "status": "created",
    "data": {
      "id": 10,
      "title": "Chính sách phúc lợi mới 2026",
      "summary": "Tóm tắt ngắn gọn chính sách bảo hiểm và khám sức khỏe định kỳ",
      "thumbnail": "https://cdn.domain.com/uploads/news-thumb-1.jpg",
      "isPublished": true,
      "publishedAt": "2026-08-18T08:00:00.000Z",
      "createdAt": "2026-08-18T08:00:00.000Z"
    }
  }
  ```

#### 15. Chỉnh sửa bài viết tin tức
* **Endpoint:** `PATCH /api/g-care/admin/news/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Request Body:**
  ```json
  {
    "title": "Chính sách phúc lợi mới 2026 (Đã cập nhật)",
    "isPublished": true
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 10,
      "title": "Chính sách phúc lợi mới 2026 (Đã cập nhật)",
      "updatedAt": "2026-08-18T08:15:00.000Z"
    }
  }
  ```

#### 16. Xóa bài viết tin tức
* **Endpoint:** `DELETE /api/g-care/admin/news/:id`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "message": "News deleted successfully"
    }
  }
  ```

---

### 3.6 Module: Approvers Management

#### 17. Danh sách người duyệt
* **Endpoint:** `GET /api/g-care/admin/approvers`
* **Headers:** `Authorization: Bearer <access_token>`
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
