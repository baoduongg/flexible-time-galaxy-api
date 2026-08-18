# Admin panel / Mini app route split — design

## Context

Backend hiện tại (`g-care-api`, NestJS) phục vụ 2 client tương lai:

- **Admin panel** (web, HR dùng): CRUD tài khoản, preview dashboard, duyệt đơn, sửa/xóa tin tức, xử lý vấn đề phát sinh.
- **Mini app** (nhân viên dùng): role `MEMBER` tạo/gửi đơn, checkin/checkout; role `ADMIN` (hoặc approver) duyệt đơn, checkin/checkout ngay trong app.

Toàn bộ nghiệp vụ hiện nằm dưới prefix chung `hr/*`, guard theo `JwtAuthGuard` + `RolesGuard` (`Role.ADMIN` / `Role.MEMBER`) áp per-handler. Ngoài ra `LeaveController.approve/reject` không dùng `Role.ADMIN` mà check quyền approver ngay trong `LeaveService` — cơ chế phân quyền theo nghiệp vụ (ai là approver của ai), độc lập với Role toàn cục.

Vấn đề: `AppModule` hiện chỉ import `NewsModule` (đang uncommitted). `ApproversModule`, `AttendanceModule`, `DashboardModule`, `LeaveModule` chưa được wire vào — route của các module này không hoạt động dù code đã viết xong.

## Goal

1. Tách route thành 2 namespace theo client: `admin/*` (HR/admin panel) và `app/*` (mini app), thay cho `hr/*` / `users` hiện tại.
2. Wire đầy đủ các module `hr/*` còn thiếu vào `AppModule` để route hoạt động.
3. Không đổi business logic (service/DTO/prisma) — chỉ tổ chức lại controller.

## Non-goals

- Không tách thành 2 service/app deploy riêng (Nest monorepo) — vẫn 1 backend duy nhất.
- Không thêm tính năng mới ngoài route split (vd: chưa có endpoint HR sửa giờ checkin lỗi — xem mục Gaps).
- Không đổi `auth/*` (login/refresh dùng chung cho cả 2 client).

## Approach

Giữ nguyên cấu trúc domain hiện có (`src/hr/<domain>/`, `src/users/`). Với domain cần phục vụ cả 2 client, tách controller thành 2 file mỏng, cùng inject 1 Service không đổi:

- `<domain>.app.controller.ts` — prefix `app/<domain>`.
- `<domain>.admin.controller.ts` — prefix `admin/<domain>`.

Domain thuần 1 client chỉ có 1 controller (đổi prefix, giữ nguyên file).

**Lý do chọn cách này thay vì restructure top-level `src/admin/*` + `src/app/*`:** service/DTO hiện tại đã ổn định qua review gần đây (`4a4482b`, `152e635`); restructure toàn bộ cây thư mục sẽ di chuyển nhiều file, rủi ro gãy import cao hơn nhiều so với lợi ích. Có thể nâng cấp lên tách deploy riêng sau này nếu cần scale — cấu trúc theo domain hiện tại không cản trở việc đó.

## Permission rule (áp dụng đồng nhất)

- `admin/*`: class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`. Mọi handler admin đều ADMIN-only.
- `app/*`: class-level `@UseGuards(JwtAuthGuard)` (đăng nhập là đủ). Handler cần quyền cao hơn (approve/reject) giữ nguyên business-check trong Service (approver check), **không** thêm `Role.ADMIN` — vì quyền duyệt đơn gắn với quan hệ approver, không phải Role toàn cục.

## Endpoint mapping

| Domain | `app/*` (mini app) | `admin/*` (admin panel) |
|---|---|---|
| news | `GET app/news`, `GET app/news/:id` (public read, giữ không guard — hành vi hiện tại) | `POST admin/news`, `PATCH admin/news/:id`, `DELETE admin/news/:id` (ADMIN, giữ nguyên logic CRUD) |
| leave | `POST app/leave`, `GET app/leave/mine`, `GET app/leave/approval`, `GET app/leave/balance`, `GET app/leave/:id`, `PATCH app/leave/:id/approve`, `PATCH app/leave/:id/reject` | `PATCH admin/leave/:id/approve`, `PATCH admin/leave/:id/reject` (HR duyệt qua web, gọi cùng `LeaveService.approve/reject`) |
| attendance | `POST app/attendance/checkin`, `POST app/attendance/checkout`, `GET app/attendance/today`, `GET app/attendance/history` | — (không có nghiệp vụ admin attendance hiện tại) |
| dashboard | `GET app/dashboard/member` | `GET admin/dashboard/admin` |
| approvers | — | `GET admin/approvers` |
| users | — | `admin/users` (đổi prefix từ `users`, giữ ADMIN-only CRUD) |

Cả `app.controller.ts` và `admin.controller.ts` của cùng 1 domain constructor-inject cùng 1 Service instance (Nest DI theo module, không duplicate provider).

## Module wiring fix

`AppModule.imports` hiện tại: `ConfigModule`, `PrismaModule`, `AuthModule`, `UsersModule`, `NewsModule`.

Thêm: `DashboardModule`, `ApproversModule`.

Không cần thêm `LeaveModule` / `AttendanceModule` riêng — `DashboardModule` đã `imports: [LeaveModule]`, và `LeaveModule` đã `imports: [AttendanceModule]`, nên import `DashboardModule` kéo theo toàn bộ chuỗi qua module graph của Nest.

`UsersModule` giữ nguyên import, chỉ đổi prefix route bên trong controller.

## Gaps phát hiện (ngoài phạm vi lần này)

- Không có endpoint để HR sửa/điều chỉnh bản ghi checkin/checkout lỗi (chỉ có tạo mới qua `checkin`/`checkout`). Nếu cần, đây là 1 endpoint mới `PATCH admin/attendance/:id` — để task riêng, không gộp vào lần tách module này.

## Testing

- Giữ nguyên toàn bộ test hiện có (theo service, không bị ảnh hưởng).
- Thêm test route-level (theo pattern `test/` hiện có) xác nhận: `admin/*` trả 403 với `Role.MEMBER`, `app/*` trả 200 với `Role.MEMBER` đã login.

## Migration order (gợi ý cho plan)

1. Fix `AppModule` wiring (`DashboardModule`, `ApproversModule`) — độc lập, làm trước để có thể test route ngay.
2. Split `users.controller.ts` → đổi prefix `admin/users` (không cần split, chỉ đổi prefix).
3. Split `news.controller.ts` → `news.app.controller.ts` + `news.admin.controller.ts`.
4. Split `dashboard.controller.ts` → `dashboard.app.controller.ts` + `dashboard.admin.controller.ts`.
5. Split `approvers.controller.ts` → đổi prefix `admin/approvers` (không cần split).
6. Split `attendance.controller.ts` → đổi prefix `app/attendance` (không cần split).
7. Split `leave.controller.ts` → `leave.app.controller.ts` (đủ 7 handler) + `leave.admin.controller.ts` (2 handler approve/reject, gọi lại service).
8. Update module `controllers:` array tương ứng mỗi domain module.
9. Chạy full test suite + build.
