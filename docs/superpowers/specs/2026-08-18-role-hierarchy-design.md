# Phân cấp role member → leader → manager → director — design

## Context

Role hiện tại (`Role` enum, `prisma/schema.prisma:14-17`) chỉ có 2 giá trị phẳng `ADMIN` / `MEMBER`, check exact-match qua `RolesGuard` (`src/auth/guards/roles.guard.ts`) dựa trên JWT claim, không refresh theo DB sau khi token phát hành.

"Approver" hiện tại không gắn với tổ chức: chỉ là boolean `isApprover` trên `User` (`prisma/schema.prisma:43-44`). Người tạo đơn tự chọn approver bất kỳ trong danh sách `isApprover = true` toàn công ty (`src/hr/approvers/approvers.service.ts`). Quyền duyệt check business-level trong `LeaveService` (`leave.service.ts:247`): `approverId === actor.sub || actor.role === ADMIN` — độc lập hoàn toàn với `Role`.

DB **chưa có** bảng Team/Department/Organization, chưa có field `managerId`/`leaderId` nào trên `User`. Không thể biểu diễn báo cáo theo tổ chức ở schema hiện tại.

## Goal

1. Thêm phân cấp tổ chức 2 tầng: Team (do Leader đứng đầu) → Department (do Manager đứng đầu, gồm nhiều Team) → công ty (Director, toàn bộ Department).
2. Thay flow duyệt đơn 1 bước, free-pick approver, bằng multi-level approval chain tự sinh theo tổ chức, escalate theo số ngày nghỉ.
3. Giữ `ADMIN` là role hệ thống độc lập (quản user/news/config), song song với 4 cấp org-role, vẫn giữ quyền override duyệt bất kỳ đơn nào.
4. Dashboard scope theo tổ chức: Leader→team, Manager→department, Director→toàn công ty (thay `team_statistics` company-wide giả hiện tại).

## Non-goals

- Không đổi client split `admin/*` / `app/*` đã có (`docs/superpowers/specs/2026-08-18-admin-app-split-design.md`) — spec này chỉ đổi bên trong business logic/schema, guard vẫn nằm đúng 2 namespace đó.
- Không xây UI/API riêng để ADMIN nhập liệu tổ chức (gán user vào team, chọn leader/manager) trong lần đầu — cần endpoint CRUD Team/Department (đơn giản, giống `UsersController` CRUD hiện có), coi là 1 phần của plan implementation, không mở rộng thêm ngoài CRUD cơ bản.
- Không làm approval chain có thể tùy biến theo `leave_type` — chỉ dùng ngưỡng số ngày (xem Approach). Có thể mở rộng sau nếu cần.
- Không đổi cơ chế JWT (role vẫn baked-in tại login, không re-check DB per-request) — ngoài phạm vi spec này.

## Approach

### Data model

```prisma
enum OrgRole {
  MEMBER
  LEADER
  MANAGER
  DIRECTOR
}

model User {
  ...
  isAdmin   Boolean  @default(false)   // thay Role.ADMIN — cờ hệ thống, độc lập orgRole
  orgRole   OrgRole  @default(MEMBER)  // thay Role.MEMBER — cấp trong hierarchy
  teamId    Int?
  team      Team?    @relation(fields: [teamId], references: [id])
}

model Team {
  id           Int      @id @default(autoincrement())
  name         String
  leaderId     Int      @unique   // FK User, User.orgRole phải = LEADER
  departmentId Int
  department   Department @relation(fields: [departmentId], references: [id])
  members      User[]
}

model Department {
  id        Int    @id @default(autoincrement())
  name      String
  managerId Int    @unique        // FK User, User.orgRole phải = MANAGER
  teams     Team[]
}

model LeaveApprovalStep {
  id             Int       @id @default(autoincrement())
  leaveRequestId Int
  leaveRequest   LeaveRequest @relation(fields: [leaveRequestId], references: [id])
  level          OrgRole      // LEADER / MANAGER / DIRECTOR
  order          Int          // thứ tự step trong chain (0,1,2)
  approverId     Int
  status         ApprovalStepStatus @default(PENDING) // PENDING | APPROVED | REJECTED
  note           String?
  decidedAt      DateTime?
}
```

`Role` enum cũ bị xoá, thay bằng `isAdmin` + `orgRole` trên `User`. `LeaveRequest` bỏ free-pick `approverId` field hiện tại — trạng thái tổng của đơn suy ra từ `LeaveApprovalStep` (còn PENDING step nào → đơn đang chờ; step nào REJECTED → cả đơn REJECTED; hết step, toàn bộ APPROVED → đơn APPROVED).

`Team.leaderId` / `Department.managerId` là unique 1-1 (1 leader/1 manager mỗi nhóm) — đơn giản nhất, đúng theo yêu cầu, không cần model đa-lead.

`Director`: không có bảng riêng — bất kỳ `User.orgRole = DIRECTOR` nào cũng là director cấp công ty (không gắn Department cụ thể). Nếu có nhiều director, bước resolve chain (xem dưới) chọn 1 theo cách đơn giản nhất có thể implement (vd: director đầu tiên theo id) — ghi rõ trong plan, không over-engineer round-robin/assignment phức tạp.

### Quyền theo role (permission matrix)

| | MEMBER | LEADER | MANAGER | DIRECTOR | ADMIN |
|---|---|---|---|---|---|
| Checkin/checkout, xem lịch sử bản thân | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tạo đơn nghỉ, xem đơn của mình | ✓ | ✓ | ✓ | ✓ | ✓ |
| Duyệt step LEADER (đơn của member trong team mình) | | ✓ | | | override |
| Duyệt step MANAGER (đơn leo lên từ team trong department mình) | | | ✓ | | override |
| Duyệt step DIRECTOR (đơn leo hết chain) | | | | ✓ | override |
| Dashboard scope team | | ✓ | | | ✓ (toàn bộ) |
| Dashboard scope department | | | ✓ | | ✓ (toàn bộ) |
| Dashboard scope company | | | | ✓ | ✓ |
| CRUD user, gán team/department/orgRole | | | | | ✓ |
| CRUD news, config hệ thống | | | | | ✓ |

### Approval flow & escalation

Ngưỡng theo số ngày nghỉ (`daysRequested` tính từ `startDate`/`endDate` của đơn, logic đã có sẵn trong `LeaveService`):

- `≤ 2 ngày`: chain = `[LEADER]`
- `3–5 ngày`: chain = `[LEADER, MANAGER]`
- `> 5 ngày`: chain = `[LEADER, MANAGER, DIRECTOR]`

Trường hợp requester chính là LEADER/MANAGER/DIRECTOR (không có cấp dưới mình trong chain vì mình chính là điểm bắt đầu):

- Requester = LEADER: chain bỏ step LEADER (không tự duyệt đơn mình), bắt đầu từ MANAGER của department chứa team mình lead (nếu ngày nghỉ đủ ngưỡng cần leo tới đó) hoặc DIRECTOR.
- Requester = MANAGER: chain chỉ còn `[DIRECTOR]` bất kể ngưỡng ngày — manager không có ai duyệt hộ ở cấp thấp hơn, và cần ít nhất 1 người duyệt nên luôn đẩy lên DIRECTOR.
- Requester = DIRECTOR: không có ai trong hierarchy cao hơn → đơn tạo với step duy nhất `approverId = null`, đánh dấu cần ADMIN duyệt (dùng cơ chế override sẵn có: `actor.isAdmin === true` được phép quyết định bất kỳ step nào, kể cả step "không có approver cụ thể" này).

Resolve chain thực hiện 1 lần lúc `create()`, snapshot `approverId` vào từng `LeaveApprovalStep` ngay — tránh vỡ chain nếu tổ chức đổi người khi đơn đang chờ duyệt (leader nghỉ việc giữa chừng không ảnh hưởng đơn đã tạo).

`decide()`: actor phải là `approverId` của step đang `order` nhỏ nhất còn `PENDING`, hoặc `actor.isAdmin`. Approve → step đó `APPROVED`, step kế tiếp (nếu có) trở thành step đang chờ; hết step → đơn APPROVED. Reject ở bất kỳ step nào → đơn REJECTED ngay, các step sau (nếu có) giữ nguyên chưa quyết định (không cần set trạng thái).

`listApproval()`: trả về đơn có step đang `PENDING` mà `approverId === actor.sub`; `isAdmin` thấy toàn bộ step PENDING toàn công ty (giữ đúng hành vi override hiện tại).

### Guard

`RolesGuard` hiện tại (exact-match theo `Reflector` metadata) đổi nguồn check từ `Role.ADMIN` → `user.isAdmin === true` (dùng cho toàn bộ `admin/*` route hiện có, không đổi hành vi ngoài tên field).

Thêm guard mới `OrgRoleGuard` + decorator `@MinOrgRole(OrgRole.X)` cho route cần "tối thiểu cấp X" (vd: dashboard team-scope cần tối thiểu LEADER — LEADER/MANAGER/DIRECTOR đều vào được, MEMBER thì không). Thứ tự cấp so sánh theo index trong enum (`MEMBER < LEADER < MANAGER < DIRECTOR`).

### Dashboard scoping

- `dashboard.service.ts` hiện có `admin()` company-wide và `member()` self-scope — thêm `leader()` (scope `teamId = actor.teamId`) và `manager()` (scope `departmentId` suy từ team mình quản) dùng chung pattern query đã có, chỉ đổi `where` clause.
- `team_statistics` key hiện tại (company-wide, tên gây hiểu lầm) đổi thành scope thật theo actor's team/department khi actor là LEADER/MANAGER; giữ nguyên company-wide khi actor `isAdmin` hoặc `orgRole = DIRECTOR`.

## Migration order (gợi ý cho plan)

1. Prisma migration: thêm `OrgRole` enum, `Team`, `Department`, `LeaveApprovalStep`; thêm `isAdmin`, `orgRole`, `teamId` lên `User`; backfill `isAdmin = (role == ADMIN)`, `orgRole = MEMBER` cho toàn bộ user hiện có (chưa có team/department nào — bước sau xử lý).
2. Xoá `Role` enum, field `LeaveRequest.approverId` cũ (sau khi xác nhận không còn nơi nào dùng — `isApprover`/`approverTitle` trên `User` cũng bỏ, thay hoàn toàn bằng orgRole+team/department).
3. Thêm CRUD Team/Department cơ bản dưới `admin/*` (tạo team, gán leader; tạo department, gán manager, gán team vào department) — cần có trước khi chain hoạt động thật.
4. Đổi `RolesGuard` sang check `isAdmin`; thêm `OrgRoleGuard` + `@MinOrgRole`.
5. Viết lại `LeaveService.create()`: tính ngưỡng ngày, resolve chain, insert `LeaveApprovalStep`.
6. Viết lại `LeaveService.decide()` / `listApproval()` theo step thay vì `approverId` đơn.
7. Thêm `dashboard.service.ts`: `leader()`, `manager()`; sửa `admin()` bỏ đếm `Role.ADMIN`/`Role.MEMBER` (không còn ý nghĩa), đếm theo `orgRole` thay thế.
8. Data thật: ADMIN dùng CRUD Team/Department gán toàn bộ nhân sự hiện có vào tổ chức trước khi tắt hẳn flow cũ.
9. Chạy full test suite + build.

## Testing

- Unit test `LeaveService`: escalation đúng ngưỡng (2/5 ngày biên), chain đúng khi requester là LEADER/MANAGER/DIRECTOR (3 case đặc biệt ở trên), reject giữa chừng dừng đúng chỗ, `isAdmin` override được mọi step.
- Guard test: `OrgRoleGuard` chặn đúng theo `@MinOrgRole`, `RolesGuard` vẫn chặn đúng theo `isAdmin`.
- Dashboard: `leader()`/`manager()` trả đúng scope, không leak dữ liệu ngoài team/department.

## Gaps / rủi ro đã biết (ngoài phạm vi implement lần này)

- Nhiều director cùng lúc: chain hiện chọn "director đầu tiên" — nếu cần chia tải/route theo mảng phụ trách, để task riêng sau khi có nhu cầu thật.
- Đổi leader/manager giữa chừng không ảnh hưởng đơn đang chờ (do snapshot) nhưng cũng nghĩa là đơn cũ không tự cập nhật theo tổ chức mới — chấp nhận được cho HR, nêu rõ để tránh hiểu nhầm là bug.
- Chưa có endpoint sửa chấm công lỗi (gap đã ghi nhận từ spec admin/app split trước, vẫn còn treo).
