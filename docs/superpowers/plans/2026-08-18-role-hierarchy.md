# Member → Leader → Manager → Director Role Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `Role.ADMIN`/`Role.MEMBER` model with a 4-level org hierarchy (`MEMBER → LEADER → MANAGER → DIRECTOR`) backed by `Team`/`Department` entities, and rebuild leave approval as a multi-step chain that escalates by leave duration, while keeping `ADMIN` as an independent system-level flag with override power.

**Architecture:** Additive-first migration: add new schema (org tables, `isAdmin`/`orgRole`, approval-step table) alongside the old fields, migrate every consumer (guards, controllers, services, DTOs, seed) off the old fields, then drop the old fields in a final cleanup migration. This keeps the app buildable and testable after every task instead of one big-bang schema rewrite.

**Tech Stack:** NestJS 11, Prisma ORM 7 (`@prisma/client`, `@prisma/adapter-pg`, Postgres), Jest, class-validator/class-transformer.

**Spec:** [docs/superpowers/specs/2026-08-18-role-hierarchy-design.md](../specs/2026-08-18-role-hierarchy-design.md)

## Global Constraints

- Escalation thresholds (exact, from spec): `≤ 2 ngày` → `[LEADER]`; `3–5 ngày` → `[LEADER, MANAGER]`; `> 5 ngày` → `[LEADER, MANAGER, DIRECTOR]`.
- Requester = LEADER → chain starts at MANAGER (skip self); `> 5 ngày` adds DIRECTOR.
- Requester = MANAGER → chain is always `[DIRECTOR]` regardless of duration.
- Requester = DIRECTOR → single step `{ level: DIRECTOR, approverId: null }`; only `isAdmin` can decide it (no explicit special-case needed — `actor.sub` can never equal `null`).
- `ADMIN` stays a separate `User.isAdmin` boolean, orthogonal to `orgRole`; `isAdmin` always overrides any approval-step or org-role gate.
- Chain is snapshotted into `LeaveApprovalStep` rows at `create()` time — never re-resolved later, so mid-flight requests survive org changes.
- Every admin-only route uses the new `AdminGuard` (checks `user.isAdmin === true`); no per-route role list needed since `isAdmin` was always the only value ever passed to the old `@Roles(...)`.
- Org-scoped routes (leader/manager dashboards) use `OrgRoleGuard` + `@MinOrgRole(...)`, a "minimum rank" check (`MEMBER < LEADER < MANAGER < DIRECTOR`), not exact-match.

---

### Task 1: Prisma schema — additive migration for org hierarchy

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_org_hierarchy/migration.sql` (generated, then hand-edited)

**Interfaces:**
- Produces: `OrgRole` enum (`MEMBER`, `LEADER`, `MANAGER`, `DIRECTOR`), `ApprovalStepStatus` enum (`pending`, `approved`, `rejected`), `Team`, `Department`, `LeaveApprovalStep` models, `User.isAdmin: Boolean`, `User.orgRole: OrgRole`, `User.teamId: Int?`. Old `Role` enum, `User.role`, `User.isApprover`, `User.approverTitle`, `LeaveRequest.approverId`/`approver` are untouched — later tasks migrate off them, Task 12 drops them.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Replace the whole file with:

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Get a free hosted Postgres database in seconds: `npx create-db`

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  MEMBER
}

enum OrgRole {
  MEMBER
  LEADER
  MANAGER
  DIRECTOR
}

enum LeaveType {
  annual
  unpaid
  maternity
  feedback
}

enum LeaveStatus {
  pending
  approved
  rejected
}

enum ApprovalStepStatus {
  pending
  approved
  rejected
}

model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  password  String
  email     String?
  firstName String?
  lastName  String?
  role      Role     @default(MEMBER)
  isAdmin   Boolean  @default(false)
  orgRole   OrgRole  @default(MEMBER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  isApprover    Boolean @default(false)
  approverTitle String?

  teamId Int?
  team   Team? @relation("TeamMembers", fields: [teamId], references: [id])

  ledTeam     Team?       @relation("TeamLeader")
  managedDept Department? @relation("DepartmentManager")

  leaveRequestsAsRequester LeaveRequest[]      @relation("LeaveRequester")
  leaveRequestsAsApprover  LeaveRequest[]      @relation("LeaveApprover")
  leaveRequestsAsDecider   LeaveRequest[]      @relation("LeaveDecider")
  approvalStepsAsApprover  LeaveApprovalStep[]
  leaveBalances            LeaveBalance[]
  attendances              Attendance[]
}

model Team {
  id           Int        @id @default(autoincrement())
  name         String
  leaderId     Int        @unique
  leader       User       @relation("TeamLeader", fields: [leaderId], references: [id])
  departmentId Int
  department   Department @relation(fields: [departmentId], references: [id])
  members      User[]     @relation("TeamMembers")

  @@index([departmentId])
}

model Department {
  id        Int    @id @default(autoincrement())
  name      String
  managerId Int    @unique
  manager   User   @relation("DepartmentManager", fields: [managerId], references: [id])
  teams     Team[]
}

model LeaveRequest {
  id             Int         @id @default(autoincrement())
  userId         Int
  user           User        @relation("LeaveRequester", fields: [userId], references: [id])
  leaveType      LeaveType
  startDate      DateTime    @db.Date
  endDate        DateTime    @db.Date
  durationDays   Decimal     @db.Decimal(5, 2)
  attendanceDate DateTime?   @db.Date
  correctionTime String?
  status         LeaveStatus @default(pending)
  approverId     Int
  approver       User        @relation("LeaveApprover", fields: [approverId], references: [id])
  reason         String
  decidedAt      DateTime?
  decidedById    Int?
  decidedBy      User?       @relation("LeaveDecider", fields: [decidedById], references: [id])
  decisionNote   String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  approvalSteps LeaveApprovalStep[]

  @@index([userId])
  @@index([approverId])
  @@index([status])
}

model LeaveApprovalStep {
  id             Int                @id @default(autoincrement())
  leaveRequestId Int
  leaveRequest   LeaveRequest       @relation(fields: [leaveRequestId], references: [id])
  level          OrgRole
  order          Int
  approverId     Int?
  approver       User?              @relation(fields: [approverId], references: [id])
  status         ApprovalStepStatus @default(pending)
  note           String?
  decidedAt      DateTime?

  @@index([leaveRequestId])
  @@index([approverId, status])
}

model LeaveBalance {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  year      Int
  totalDays Decimal  @default(12) @db.Decimal(5, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, year])
}

model Attendance {
  id           Int       @id @default(autoincrement())
  userId       Int
  user         User      @relation(fields: [userId], references: [id])
  date         DateTime  @db.Date
  checkinTime  DateTime?
  checkoutTime DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([userId, date])
  @@index([date])
}

model PublicHoliday {
  id   Int      @id @default(autoincrement())
  date DateTime @unique @db.Date
  name String

  @@index([date])
}

model News {
  id          Int      @id @default(autoincrement())
  title       String
  content     String
  image       String?
  category    String?
  isNew       Boolean  @default(true)
  publishedAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([publishedAt])
}
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `npx prisma migrate dev --create-only --name add_org_hierarchy`

- [ ] **Step 3: Hand-edit the generated SQL to backfill `isAdmin`**

Open `prisma/migrations/<timestamp>_add_org_hierarchy/migration.sql`. The generated `ALTER TABLE "User" ADD COLUMN "isAdmin" ...` already defaults every row to `false`, which is wrong for the seeded `admin` account (`role = 'ADMIN'`). Append this line at the end of the file:

```sql
UPDATE "User" SET "isAdmin" = true WHERE "role" = 'ADMIN';
```

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate dev`
Expected: applies the pending migration, regenerates the Prisma client, no further prompts (schema already matches).

- [ ] **Step 5: Verify build still passes**

Run: `npm run build`
Expected: success — nothing in `src/` references the new fields/models yet, so this only proves the schema/client compiles.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add org hierarchy schema (Team, Department, LeaveApprovalStep, isAdmin/orgRole)"
```

---

### Task 2: Auth — isAdmin/orgRole in JWT + new AdminGuard/OrgRoleGuard

**Files:**
- Modify: `src/auth/types/jwt-payload.type.ts`
- Modify: `src/auth/auth.service.ts`
- Create: `src/auth/guards/admin.guard.ts`
- Create: `src/auth/guards/admin.guard.spec.ts`
- Create: `src/auth/decorators/min-org-role.decorator.ts`
- Create: `src/auth/guards/org-role.guard.ts`
- Create: `src/auth/guards/org-role.guard.spec.ts`

**Interfaces:**
- Consumes: `OrgRole` enum from Task 1.
- Produces: `JwtPayload = { sub: number; username: string; isAdmin: boolean; orgRole: OrgRole }`; `AdminGuard` (class); `OrgRoleGuard` (class) + `MinOrgRole(role: OrgRole)` decorator + `MIN_ORG_ROLE_KEY` constant. These are additive — nothing that currently imports `Role`/`RolesGuard`/`Roles` breaks yet.

- [ ] **Step 1: Update `JwtPayload`**

```typescript
import { OrgRole } from '@prisma/client';

export type JwtPayload = {
  sub: number;
  username: string;
  isAdmin: boolean;
  orgRole: OrgRole;
};
```

- [ ] **Step 2: Update `AuthService` to carry `isAdmin`/`orgRole`**

Replace `src/auth/auth.service.ts` contents:

```typescript
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }

    return this.buildAuthResponse(user.id, user.username, user.isAdmin, user.orgRole);
  }

  async refreshToken(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    return this.buildAuthResponse(user.id, user.username, user.isAdmin, user.orgRole);
  }

  private async buildAuthResponse(
    id: number,
    username: string,
    isAdmin: boolean,
    orgRole: JwtPayload['orgRole'],
  ) {
    const payload: JwtPayload = { sub: id, username, isAdmin, orgRole };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: { id, username, isAdmin, orgRole },
    };
  }
}
```

- [ ] **Step 3: Check for existing `auth.service.spec.ts`**

Run: `find src/auth -name "auth.service.spec.ts"`
If it exists, update every `role: Role.ADMIN`/`Role.MEMBER` fixture to `isAdmin`/`orgRole` fixtures and every assertion on `result.user.role` to `result.user.isAdmin`/`result.user.orgRole`. If it doesn't exist, skip.

- [ ] **Step 4: Write `AdminGuard`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    return user.isAdmin === true;
  }
}
```

- [ ] **Step 5: Write `AdminGuard` test**

```typescript
import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  function contextWithUser(user: { isAdmin: boolean }): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows when isAdmin is true', () => {
    expect(guard.canActivate(contextWithUser({ isAdmin: true }))).toBe(true);
  });

  it('denies when isAdmin is false', () => {
    expect(guard.canActivate(contextWithUser({ isAdmin: false }))).toBe(false);
  });
});
```

- [ ] **Step 6: Run the new test**

Run: `npx jest src/auth/guards/admin.guard.spec.ts`
Expected: PASS

- [ ] **Step 7: Write `MinOrgRole` decorator**

```typescript
import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const MIN_ORG_ROLE_KEY = 'minOrgRole';
export const MinOrgRole = (role: OrgRole) => SetMetadata(MIN_ORG_ROLE_KEY, role);
```

- [ ] **Step 8: Write `OrgRoleGuard`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { MIN_ORG_ROLE_KEY } from '../decorators/min-org-role.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  [OrgRole.MEMBER]: 0,
  [OrgRole.LEADER]: 1,
  [OrgRole.MANAGER]: 2,
  [OrgRole.DIRECTOR]: 3,
};

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<OrgRole>(MIN_ORG_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!minRole) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    return (
      user.isAdmin === true || ORG_ROLE_RANK[user.orgRole] >= ORG_ROLE_RANK[minRole]
    );
  }
}
```

- [ ] **Step 9: Write `OrgRoleGuard` test**

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { OrgRoleGuard } from './org-role.guard';
import { MIN_ORG_ROLE_KEY } from '../decorators/min-org-role.decorator';

describe('OrgRoleGuard', () => {
  function contextWithUser(user: { isAdmin: boolean; orgRole: OrgRole }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function guardWithMinRole(minRole: OrgRole | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(minRole),
    } as unknown as Reflector;
    return new OrgRoleGuard(reflector);
  }

  it('allows any authenticated user when no @MinOrgRole is set', () => {
    const guard = guardWithMinRole(undefined);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies a MEMBER when the route requires at least LEADER', () => {
    const guard = guardWithMinRole(OrgRole.LEADER);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows a MANAGER on a route that requires at least LEADER', () => {
    const guard = guardWithMinRole(OrgRole.LEADER);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MANAGER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('always allows isAdmin regardless of orgRole', () => {
    const guard = guardWithMinRole(OrgRole.DIRECTOR);
    const ctx = contextWithUser({ isAdmin: true, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
```

- [ ] **Step 10: Run the new tests**

Run: `npx jest src/auth/guards/org-role.guard.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 11: Full build + test check**

Run: `npm run build && npm test`
Expected: both succeed — old `RolesGuard`/`Roles`/`Role` usages are still intact and unaffected.

- [ ] **Step 12: Commit**

```bash
git add src/auth
git commit -m "feat: add isAdmin/orgRole to JWT payload, AdminGuard, OrgRoleGuard"
```

---

### Task 3: Swap admin controllers to AdminGuard, delete old RolesGuard/Roles

**Files:**
- Modify: `src/users/users.controller.ts`, `src/users/users.controller.spec.ts`
- Modify: `src/hr/leave/leave.admin.controller.ts`, `src/hr/leave/leave.controller.spec.ts`
- Modify: `src/hr/dashboard/dashboard.admin.controller.ts`, `src/hr/dashboard/dashboard.controller.spec.ts`
- Modify: `src/hr/approvers/approvers.admin.controller.ts`, `src/hr/approvers/approvers.admin.controller.spec.ts`
- Modify: `src/hr/news/news.admin.controller.ts`, `src/hr/news/news.controller.spec.ts`
- Delete: `src/auth/guards/roles.guard.ts`
- Delete: `src/auth/decorators/roles.decorator.ts`

**Interfaces:**
- Consumes: `AdminGuard` from Task 2.
- Produces: no more references to `RolesGuard`/`Roles`/`ROLES_KEY`/`Role` anywhere under `src/*.controller.ts`.

- [ ] **Step 1: Swap `users.controller.ts`**

In `src/users/users.controller.ts`, replace lines 13-23:

```typescript
import { AdminGuard } from '../auth/guards/admin.guard';
```
(remove the `Role`, `RolesGuard`, `Roles` imports)

and the class decorators:
```typescript
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
export class UsersController {
```
(drop `@Roles(Role.ADMIN)`)

- [ ] **Step 2: Swap `leave.admin.controller.ts`**

Same pattern in `src/hr/leave/leave.admin.controller.ts`: drop the `Role`/`RolesGuard`/`Roles` imports, import `AdminGuard` from `../../auth/guards/admin.guard`, change:
```typescript
@Controller('admin/leave')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LeaveAdminController {
```

- [ ] **Step 3: Swap `dashboard.admin.controller.ts`**

Same pattern:
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DashboardAdminController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  admin() {
    return this.dashboardService.admin();
  }
}
```

- [ ] **Step 4: Swap `approvers.admin.controller.ts`**

Same pattern:
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ApproversService } from './approvers.service';

@Controller('admin/approvers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ApproversAdminController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
```

(This whole module is deleted in Task 11 — this step just keeps it compiling in the meantime.)

- [ ] **Step 5: Swap `news.admin.controller.ts`**

In `src/hr/news/news.admin.controller.ts`, replace lines 11 and 19-21 the same way (drop `Role`/`RolesGuard`/`Roles`, import `AdminGuard`, `@UseGuards(JwtAuthGuard, AdminGuard)` with no `@Roles(...)`).

- [ ] **Step 6: Delete the old guard/decorator**

```bash
rm src/auth/guards/roles.guard.ts src/auth/decorators/roles.decorator.ts
```

- [ ] **Step 7: Update `users.controller.spec.ts`**

It currently only checks the route path — no change needed. Run: `npx jest src/users/users.controller.spec.ts` to confirm it still passes untouched.

- [ ] **Step 8: Update `leave.controller.spec.ts`**

Replace `src/hr/leave/leave.controller.spec.ts`:

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('LeaveAppController', () => {
  it('is mounted under app/leave with no admin guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, LeaveAppController) as string;
    expect(path).toBe('app/leave');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, LeaveAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});

describe('LeaveAdminController', () => {
  it('is mounted under admin/leave and requires AdminGuard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, LeaveAdminController) as string;
    expect(path).toBe('admin/leave');

    const guards = Reflect.getMetadata(GUARDS_METADATA, LeaveAdminController) as unknown[];
    expect(guards).toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});
```

- [ ] **Step 9: Update `dashboard.controller.spec.ts`**

Same transformation as Step 8, mirrored for `DashboardAppController`/`DashboardAdminController` (paths `app/dashboard`/`admin/dashboard`).

- [ ] **Step 10: Update `approvers.admin.controller.spec.ts`**

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ApproversAdminController } from './approvers.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('ApproversAdminController', () => {
  it('is mounted under admin/approvers and requires AdminGuard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, ApproversAdminController) as string;
    expect(path).toBe('admin/approvers');

    const guards = Reflect.getMetadata(GUARDS_METADATA, ApproversAdminController) as unknown[];
    expect(guards).toContain(AdminGuard);
  });
});
```

(`approvers.app.controller.spec.ts` only asserted `RolesGuard` is absent — update its import from `RolesGuard` to `AdminGuard` in the same "not.toContain" assertion. This whole file is deleted in Task 11 anyway.)

- [ ] **Step 11: Update `news.controller.spec.ts`**

Apply the same `RolesGuard` → `AdminGuard` swap used in Steps 8-9, scoped to whatever the admin-controller assertions in that file check today (inspect the file first — `cat src/hr/news/news.controller.spec.ts` — before editing, since its exact shape wasn't part of this plan's source reading).

- [ ] **Step 12: Full test + build**

Run: `npm run build && npm test`
Expected: all pass, zero references to `RolesGuard`/`Roles`/`ROLES_KEY` remain.

Run: `grep -rn "RolesGuard\|ROLES_KEY\|from '.*roles.decorator'" src`
Expected: no output.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: swap admin controllers to AdminGuard, delete RolesGuard/Roles"
```

---

### Task 4: Org module — Team + Department CRUD (admin only)

**Files:**
- Create: `src/hr/org/org.module.ts`
- Create: `src/hr/org/org.service.ts`
- Create: `src/hr/org/org.service.spec.ts`
- Create: `src/hr/org/org.admin.controller.ts`
- Create: `src/hr/org/org.admin.controller.spec.ts`
- Create: `src/hr/org/dto/create-team.dto.ts`
- Create: `src/hr/org/dto/update-team.dto.ts`
- Create: `src/hr/org/dto/create-department.dto.ts`
- Create: `src/hr/org/dto/update-department.dto.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `OrgRole` from Task 1, `AdminGuard` from Task 2.
- Produces: `OrgService` with `createTeam`, `listTeams`, `updateTeam`, `createDepartment`, `listDepartments`, `updateDepartment` — exported for later tasks (dashboard's `leader()`/`manager()` query `Team`/`Department` directly via Prisma, not via `OrgService`, so no cross-task method-signature dependency here).

- [ ] **Step 1: DTOs**

`src/hr/org/dto/create-team.dto.ts`:
```typescript
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  leader_id: number;

  @IsInt()
  department_id: number;
}
```

`src/hr/org/dto/update-team.dto.ts`:
```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  leader_id?: number;

  @IsOptional()
  @IsInt()
  department_id?: number;
}
```

`src/hr/org/dto/create-department.dto.ts`:
```typescript
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  manager_id: number;
}
```

`src/hr/org/dto/update-department.dto.ts`:
```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  manager_id?: number;
}
```

- [ ] **Step 2: Write `org.service.spec.ts` (failing first)**

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgService } from './org.service';

describe('OrgService', () => {
  let service: OrgService;
  const prisma = {
    user: { findUnique: jest.fn() },
    team: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    department: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [OrgService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(OrgService);
  });

  describe('createTeam', () => {
    it('rejects when leader_id user does not have orgRole=LEADER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, orgRole: OrgRole.MEMBER });

      await expect(
        service.createTeam({ name: 'Team A', leader_id: 5, department_id: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects when department_id does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, orgRole: OrgRole.LEADER });
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.createTeam({ name: 'Team A', leader_id: 5, department_id: 99 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('creates the team when leader and department are valid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, orgRole: OrgRole.LEADER });
      prisma.department.findUnique.mockResolvedValue({ id: 1 });
      prisma.team.create.mockResolvedValue({ id: 1, name: 'Team A', leaderId: 5, departmentId: 1 });

      const result = await service.createTeam({ name: 'Team A', leader_id: 5, department_id: 1 });

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: { name: 'Team A', leaderId: 5, departmentId: 1 },
      });
      expect(result).toEqual({ id: 1, name: 'Team A', leaderId: 5, departmentId: 1 });
    });
  });

  describe('createDepartment', () => {
    it('rejects when manager_id user does not have orgRole=MANAGER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9, orgRole: OrgRole.LEADER });

      await expect(
        service.createDepartment({ name: 'Dept A', manager_id: 9 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.department.create).not.toHaveBeenCalled();
    });

    it('creates the department when manager is valid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 9, orgRole: OrgRole.MANAGER });
      prisma.department.create.mockResolvedValue({ id: 1, name: 'Dept A', managerId: 9 });

      const result = await service.createDepartment({ name: 'Dept A', manager_id: 9 });

      expect(prisma.department.create).toHaveBeenCalledWith({
        data: { name: 'Dept A', managerId: 9 },
      });
      expect(result).toEqual({ id: 1, name: 'Dept A', managerId: 9 });
    });
  });

  describe('updateTeam', () => {
    it('throws NotFoundException when the team does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeam(404, { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/hr/org/org.service.spec.ts`
Expected: FAIL — `Cannot find module './org.service'`

- [ ] **Step 4: Implement `org.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(dto: CreateTeamDto) {
    await this.assertOrgRole(dto.leader_id, OrgRole.LEADER, 'Trưởng nhóm');
    await this.assertDepartmentExists(dto.department_id);

    return this.prisma.team.create({
      data: { name: dto.name, leaderId: dto.leader_id, departmentId: dto.department_id },
    });
  }

  listTeams() {
    return this.prisma.team.findMany({ orderBy: { id: 'asc' } });
  }

  async updateTeam(id: number, dto: UpdateTeamDto) {
    const existing = await this.prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy team');
    }
    if (dto.leader_id !== undefined) {
      await this.assertOrgRole(dto.leader_id, OrgRole.LEADER, 'Trưởng nhóm');
    }
    if (dto.department_id !== undefined) {
      await this.assertDepartmentExists(dto.department_id);
    }

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.leader_id !== undefined ? { leaderId: dto.leader_id } : {}),
        ...(dto.department_id !== undefined ? { departmentId: dto.department_id } : {}),
      },
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    await this.assertOrgRole(dto.manager_id, OrgRole.MANAGER, 'Trưởng phòng');

    return this.prisma.department.create({
      data: { name: dto.name, managerId: dto.manager_id },
    });
  }

  listDepartments() {
    return this.prisma.department.findMany({
      orderBy: { id: 'asc' },
      include: { teams: true },
    });
  }

  async updateDepartment(id: number, dto: UpdateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy phòng ban');
    }
    if (dto.manager_id !== undefined) {
      await this.assertOrgRole(dto.manager_id, OrgRole.MANAGER, 'Trưởng phòng');
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.manager_id !== undefined ? { managerId: dto.manager_id } : {}),
      },
    });
  }

  private async assertOrgRole(userId: number, expected: OrgRole, label: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException(`Không tìm thấy user id=${userId}`);
    }
    if (user.orgRole !== expected) {
      throw new BadRequestException(
        `User id=${userId} chưa có orgRole=${expected} (${label})`,
      );
    }
  }

  private async assertDepartmentExists(id: number) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new BadRequestException(`Không tìm thấy phòng ban id=${id}`);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/hr/org/org.service.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Implement the controller**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { OrgService } from './org.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('admin/org')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OrgAdminController {
  constructor(private readonly orgService: OrgService) {}

  @Post('teams')
  createTeam(@Body() dto: CreateTeamDto) {
    return this.orgService.createTeam(dto);
  }

  @Get('teams')
  listTeams() {
    return this.orgService.listTeams();
  }

  @Patch('teams/:id')
  updateTeam(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTeamDto) {
    return this.orgService.updateTeam(id, dto);
  }

  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.orgService.createDepartment(dto);
  }

  @Get('departments')
  listDepartments() {
    return this.orgService.listDepartments();
  }

  @Patch('departments/:id')
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.orgService.updateDepartment(id, dto);
  }
}
```

- [ ] **Step 7: Write `org.admin.controller.spec.ts`**

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { OrgAdminController } from './org.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('OrgAdminController', () => {
  it('is mounted under admin/org and requires AdminGuard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, OrgAdminController) as string;
    expect(path).toBe('admin/org');

    const guards = Reflect.getMetadata(GUARDS_METADATA, OrgAdminController) as unknown[];
    expect(guards).toContain(AdminGuard);
  });
});
```

- [ ] **Step 8: Write the module and wire it into `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { OrgAdminController } from './org.admin.controller';
import { OrgService } from './org.service';

@Module({
  controllers: [OrgAdminController],
  providers: [OrgService],
})
export class OrgModule {}
```

In `src/app.module.ts`, add `import { OrgModule } from './hr/org/org.module';` and add `OrgModule` to the `imports` array.

- [ ] **Step 9: Run full test + build**

Run: `npm run build && npm test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/hr/org src/app.module.ts
git commit -m "feat: add admin Team/Department CRUD (OrgModule)"
```

---

### Task 5: Users module — isAdmin/orgRole/teamId + seed data

**Files:**
- Modify: `src/users/dto/create-user.dto.ts`
- Modify: `src/users/dto/update-user.dto.ts`
- Modify: `src/users/dto/query-users.dto.ts`
- Modify: `src/users/users.service.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: `CreateUserDto`/`UpdateUserDto` accept `is_admin?: boolean`, `org_role?: OrgRole`, `team_id?: number` (replacing `role?: Role`); `USER_SELECT` includes `isAdmin`, `orgRole`, `teamId`. Seed creates a working org sample (`director`/`manager`/`leader`/`member`/`admin` accounts + 1 `Team` + 1 `Department`) so later tasks (leave chain, dashboards) are demoable end-to-end.

- [ ] **Step 1: Update `create-user.dto.ts`**

```typescript
import { OrgRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(3)
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @IsOptional()
  @IsEnum(OrgRole)
  org_role?: OrgRole;

  @IsOptional()
  @IsInt()
  team_id?: number;
}
```

- [ ] **Step 2: Update `update-user.dto.ts`** (same fields, all optional, no `password`/`username` change needed beyond what's already there)

```typescript
import { OrgRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  password?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @IsOptional()
  @IsEnum(OrgRole)
  org_role?: OrgRole;

  @IsOptional()
  @IsInt()
  team_id?: number;
}
```

- [ ] **Step 3: Update `query-users.dto.ts`**

```typescript
import { OrgRole } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OrgRole)
  org_role?: OrgRole;
}
```

- [ ] **Step 4: Update `users.service.ts`**

Replace `USER_SELECT` and the `role`-based logic:

```typescript
const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  isAdmin: true,
  orgRole: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
};
```

In `findAll`, change `where.role` to `where.orgRole`:
```typescript
const where = {
  ...(query.org_role ? { orgRole: query.org_role } : {}),
  ...(query.search
    ? {
        OR: [
          { username: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }
    : {}),
};
```

In `create`, change the `data` block's `role: dto.role` to:
```typescript
data: {
  username: dto.username,
  password: hashedPassword,
  email: dto.email,
  firstName: dto.firstName,
  lastName: dto.lastName,
  isAdmin: dto.is_admin ?? false,
  orgRole: dto.org_role ?? OrgRole.MEMBER,
  teamId: dto.team_id,
},
```
(add `import { OrgRole } from '@prisma/client';` at the top)

In `update`, the `data: { ...dto, password: ... }` spread now includes `is_admin`/`org_role`/`team_id` verbatim (snake_case), which Prisma won't recognize. Replace with an explicit mapping:

```typescript
async update(id: number, dto: UpdateUserDto) {
  await this.findOne(id);

  return this.prisma.user.update({
    where: { id },
    data: {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.is_admin !== undefined ? { isAdmin: dto.is_admin } : {}),
      ...(dto.org_role !== undefined ? { orgRole: dto.org_role } : {}),
      ...(dto.team_id !== undefined ? { teamId: dto.team_id } : {}),
      password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
    },
    select: USER_SELECT,
  });
}
```

- [ ] **Step 5: Check for existing `users.service.spec.ts`**

Run: `find src/users -name "users.service.spec.ts"`
If present, update fixtures/assertions from `role`/`Role.ADMIN` to `isAdmin`/`orgRole`/`OrgRole.MEMBER`. If absent, skip (no test currently covers this service directly — `users.controller.spec.ts` only checks the route path).

- [ ] **Step 6: Update `prisma/seed.ts`**

Replace the account-seeding block (imports + `main()`'s first section) so it creates a full working hierarchy — 1 director, 1 manager, 1 leader, 1 member, 1 admin, wired into 1 team + 1 department:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, OrgRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = [
    { username: 'admin', password: 'admin', isAdmin: true, orgRole: OrgRole.MEMBER },
    { username: 'director', password: 'director', isAdmin: false, orgRole: OrgRole.DIRECTOR },
    { username: 'manager', password: 'manager', isAdmin: false, orgRole: OrgRole.MANAGER },
    { username: 'leader', password: 'leader', isAdmin: false, orgRole: OrgRole.LEADER },
    { username: 'member', password: 'member', isAdmin: false, orgRole: OrgRole.MEMBER },
  ];

  const userIds: Record<string, number> = {};
  for (const account of accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    const user = await prisma.user.upsert({
      where: { username: account.username },
      update: { password: hashedPassword, isAdmin: account.isAdmin, orgRole: account.orgRole },
      create: {
        username: account.username,
        password: hashedPassword,
        isAdmin: account.isAdmin,
        orgRole: account.orgRole,
      },
    });
    userIds[account.username] = user.id;

    console.log(`Seeded user: ${account.username} (isAdmin=${account.isAdmin}, orgRole=${account.orgRole})`);
  }

  const department = await prisma.department.upsert({
    where: { managerId: userIds.manager },
    update: { name: 'Phòng Vận hành' },
    create: { name: 'Phòng Vận hành', managerId: userIds.manager },
  });
  console.log(`Seeded department: ${department.name}`);

  const team = await prisma.team.upsert({
    where: { leaderId: userIds.leader },
    update: { name: 'Team Sản phẩm', departmentId: department.id },
    create: { name: 'Team Sản phẩm', leaderId: userIds.leader, departmentId: department.id },
  });
  console.log(`Seeded team: ${team.name}`);

  await prisma.user.update({
    where: { id: userIds.leader },
    data: { teamId: team.id },
  });
  await prisma.user.update({
    where: { id: userIds.member },
    data: { teamId: team.id },
  });
  console.log('Assigned leader + member to team');

  const holidays = [
    { date: new Date('2026-01-01'), name: 'Tết Dương lịch' },
    { date: new Date('2026-02-16'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-02-17'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-02-18'), name: 'Tết Nguyên đán' },
    { date: new Date('2026-04-30'), name: 'Ngày Giải phóng miền Nam' },
    { date: new Date('2026-05-01'), name: 'Ngày Quốc tế Lao động' },
    { date: new Date('2026-09-02'), name: 'Ngày Quốc khánh' },
  ];

  for (const holiday of holidays) {
    await prisma.publicHoliday.upsert({
      where: { date: holiday.date },
      update: { name: holiday.name },
      create: holiday,
    });
  }

  console.log(`Seeded ${holidays.length} public holidays`);
```

(Leave the `sampleNews` block and `main().catch(...).finally(...)` footer exactly as they are — only the account-seeding section above changes. `isApprover`/`approverTitle` are no longer set — those fields still exist on the schema until Task 12 and simply keep their `@default(false)`/`null`.)

- [ ] **Step 7: Full build + test**

Run: `npm run build && npm test`
Expected: pass.

- [ ] **Step 8: Re-seed the dev database and sanity-check**

Run: `npm run db:seed`
Expected: logs show all 5 users, the department, the team, and the leader/member assignment with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/users prisma/seed.ts
git commit -m "feat: users module + seed use isAdmin/orgRole/teamId instead of Role"
```

---

### Task 6: Leave approval chain resolver (pure function)

**Files:**
- Create: `src/hr/leave/leave-chain.util.ts`
- Create: `src/hr/leave/leave-chain.util.spec.ts`

**Interfaces:**
- Produces: `OrgContext` type, `ChainStep` type, `resolveApprovalChain(context: OrgContext, durationDays: number): ChainStep[]` — pure, no DB access. Task 7 supplies the DB-fetched `OrgContext` and calls this.

- [ ] **Step 1: Write the failing test**

```typescript
import { BadRequestException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { resolveApprovalChain } from './leave-chain.util';

describe('resolveApprovalChain', () => {
  describe('requester is MEMBER', () => {
    const base = { id: 1, orgRole: OrgRole.MEMBER, leaderId: 10, managerId: 20, directorId: 30 };

    it('≤2 ngày: only LEADER', () => {
      expect(resolveApprovalChain(base, 2)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
      ]);
    });

    it('3-5 ngày: LEADER then MANAGER', () => {
      expect(resolveApprovalChain(base, 5)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
        { level: OrgRole.MANAGER, approverId: 20 },
      ]);
    });

    it('>5 ngày: LEADER, MANAGER, DIRECTOR', () => {
      expect(resolveApprovalChain(base, 6)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
        { level: OrgRole.MANAGER, approverId: 20 },
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });

    it('throws when the member has no team leader assigned', () => {
      expect(() =>
        resolveApprovalChain({ ...base, leaderId: null }, 2),
      ).toThrow(BadRequestException);
    });
  });

  describe('requester is LEADER', () => {
    const base = { id: 10, orgRole: OrgRole.LEADER, leaderId: null, managerId: 20, directorId: 30 };

    it('≤5 ngày: starts at MANAGER (skips self as LEADER)', () => {
      expect(resolveApprovalChain(base, 4)).toEqual([
        { level: OrgRole.MANAGER, approverId: 20 },
      ]);
    });

    it('>5 ngày: MANAGER then DIRECTOR', () => {
      expect(resolveApprovalChain(base, 6)).toEqual([
        { level: OrgRole.MANAGER, approverId: 20 },
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });
  });

  describe('requester is MANAGER', () => {
    it('always escalates straight to DIRECTOR regardless of duration', () => {
      const context = { id: 20, orgRole: OrgRole.MANAGER, leaderId: null, managerId: null, directorId: 30 };
      expect(resolveApprovalChain(context, 1)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
      expect(resolveApprovalChain(context, 10)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });

    it('throws when no DIRECTOR exists in the company', () => {
      const context = { id: 20, orgRole: OrgRole.MANAGER, leaderId: null, managerId: null, directorId: null };
      expect(() => resolveApprovalChain(context, 1)).toThrow(BadRequestException);
    });
  });

  describe('requester is DIRECTOR', () => {
    it('produces a single step with approverId null (ADMIN must decide)', () => {
      const context = { id: 30, orgRole: OrgRole.DIRECTOR, leaderId: null, managerId: null, directorId: 30 };
      expect(resolveApprovalChain(context, 3)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: null },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/hr/leave/leave-chain.util.spec.ts`
Expected: FAIL — `Cannot find module './leave-chain.util'`

- [ ] **Step 3: Implement `leave-chain.util.ts`**

```typescript
import { BadRequestException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export type OrgContext = {
  id: number;
  orgRole: OrgRole;
  leaderId: number | null;
  managerId: number | null;
  directorId: number | null;
};

export type ChainStep = { level: OrgRole; approverId: number | null };

export function resolveApprovalChain(
  context: OrgContext,
  durationDays: number,
): ChainStep[] {
  if (context.orgRole === OrgRole.DIRECTOR) {
    return [{ level: OrgRole.DIRECTOR, approverId: null }];
  }

  if (context.orgRole === OrgRole.MANAGER) {
    return [{ level: OrgRole.DIRECTOR, approverId: requireDirector(context) }];
  }

  if (context.orgRole === OrgRole.LEADER) {
    const steps: ChainStep[] = [{ level: OrgRole.MANAGER, approverId: requireManager(context) }];
    if (durationDays > 5) {
      steps.push({ level: OrgRole.DIRECTOR, approverId: requireDirector(context) });
    }
    return steps;
  }

  // MEMBER
  const steps: ChainStep[] = [{ level: OrgRole.LEADER, approverId: requireLeader(context) }];
  if (durationDays > 2) {
    steps.push({ level: OrgRole.MANAGER, approverId: requireManager(context) });
  }
  if (durationDays > 5) {
    steps.push({ level: OrgRole.DIRECTOR, approverId: requireDirector(context) });
  }
  return steps;
}

function requireLeader(context: OrgContext): number {
  if (context.leaderId === null) {
    throw new BadRequestException('Bạn chưa được gán vào team nào, không thể tạo đơn');
  }
  return context.leaderId;
}

function requireManager(context: OrgContext): number {
  if (context.managerId === null) {
    throw new BadRequestException('Team/phòng ban của bạn chưa được gán Trưởng phòng');
  }
  return context.managerId;
}

function requireDirector(context: OrgContext): number {
  if (context.directorId === null) {
    throw new BadRequestException('Công ty chưa có Director nào trong hệ thống');
  }
  return context.directorId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/hr/leave/leave-chain.util.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hr/leave/leave-chain.util.ts src/hr/leave/leave-chain.util.spec.ts
git commit -m "feat: add pure leave approval chain resolver"
```

---

### Task 7: LeaveService.create() — snapshot the chain into LeaveApprovalStep

**Files:**
- Modify: `src/hr/leave/dto/create-leave-request.dto.ts`
- Modify: `src/hr/leave/leave.constants.ts`
- Modify: `src/hr/leave/leave.mapper.ts`
- Modify: `src/hr/leave/leave.service.ts`
- Modify: `src/hr/leave/leave.service.spec.ts`

**Interfaces:**
- Consumes: `resolveApprovalChain`, `OrgContext` from Task 6.
- Produces: `LeaveService.create(userId, dto)` now creates `LeaveApprovalStep` rows instead of a flat `approverId`; `toLeaveRequestResponse(...)` now returns `approval_steps: [...]` instead of `approver_id`/`approver_name`. Task 8/9 read `leave.approvalSteps` — same field name.

- [ ] **Step 1: Drop `approver_id` from `CreateLeaveRequestDto`**

```typescript
import { LeaveType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leave_type: LeaveType;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) => dto.leave_type === LeaveType.feedback,
  )
  @IsDateString()
  attendance_date?: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) => dto.leave_type === LeaveType.feedback,
  )
  @IsString()
  @IsNotEmpty()
  correction_time?: string;
}
```

- [ ] **Step 2: Update `LEAVE_INCLUDE`**

In `src/hr/leave/leave.constants.ts`, replace the `approver` block with `approvalSteps`:

```typescript
export const LEAVE_INCLUDE = {
  user: {
    select: { id: true, username: true, firstName: true, lastName: true },
  },
  decidedBy: {
    select: { id: true, username: true, firstName: true, lastName: true },
  },
  approvalSteps: {
    orderBy: { order: 'asc' },
    include: {
      approver: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
    },
  },
} satisfies Prisma.LeaveRequestInclude;
```

- [ ] **Step 3: Update the mapper**

In `src/hr/leave/leave.mapper.ts`, replace the `approver_id`/`approver_name` lines in `toLeaveRequestResponse` with:

```typescript
    approval_steps: leave.approvalSteps.map((step) => ({
      level: step.level,
      approver_id: step.approverId,
      approver_name: step.approver ? displayName(step.approver) : null,
      status: step.status,
      note: step.note,
      decided_at: step.decidedAt ? step.decidedAt.toISOString() : null,
    })),
```
(placed where `approver_id`/`approver_name` used to sit, right before `reason`)

- [ ] **Step 4: Update failing tests first — `leave.service.spec.ts` `create` block**

Replace the whole `describe('create', ...)` block in `src/hr/leave/leave.service.spec.ts`:

```typescript
  describe('create', () => {
    it('throws when the requester has no team leader assigned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        orgRole: 'MEMBER',
        team: null,
        ledTeam: null,
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create(1, {
          leave_type: LeaveType.annual,
          start_date: '2026-08-17',
          end_date: '2026-08-17',
          reason: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('resolves the chain and persists LeaveApprovalStep rows via Prisma nested create', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        orgRole: 'MEMBER',
        team: { leaderId: 7, department: { managerId: 8 } },
        ledTeam: null,
      });
      prisma.user.findFirst.mockResolvedValue({ id: 9 });
      prisma.leaveRequest.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          ...data,
          user: { username: 'member', firstName: null, lastName: null },
          decidedBy: null,
          approvalSteps: [],
          createdAt: new Date('2026-08-18T00:00:00Z'),
          updatedAt: new Date('2026-08-18T00:00:00Z'),
        }),
      );

      // Mon 2026-08-17 .. Fri 2026-08-21 = 5 weekdays -> LEADER + MANAGER
      const result = await service.create(1, {
        leave_type: LeaveType.annual,
        start_date: '2026-08-17',
        end_date: '2026-08-21',
        reason: 'test',
      });

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durationDays: 5,
            approvalSteps: {
              create: [
                { level: 'LEADER', order: 0, approverId: 7 },
                { level: 'MANAGER', order: 1, approverId: 8 },
              ],
            },
          }),
        }),
      );
      expect(result.duration_days).toBe(5);
      expect(result.status).toBe('pending');
    });
  });
```

Remove the old `computes duration_days using UTC ...` timezone test from this block — its weekday-counting behavior is unrelated to approver resolution and stays covered indirectly; if you'd rather keep timezone coverage explicit, add it back with the same `prisma.user.findUnique`/`findFirst` mocks as the second test above.

- [ ] **Step 5: Run to verify the new tests fail**

Run: `npx jest src/hr/leave/leave.service.spec.ts -t create`
Expected: FAIL — `service.create` still expects `approver_id` in the DTO and queries `prisma.user.findUnique` differently.

- [ ] **Step 6: Rewrite `LeaveService.create()`**

In `src/hr/leave/leave.service.ts`:
- Change the import line to: `import { LeaveStatus, LeaveType, OrgRole, Prisma, Role } from '@prisma/client';` — add `OrgRole`, keep `Role` (it's still used at lines 94/247 until Tasks 8/9 rewrite them).
- Add: `import { resolveApprovalChain, type OrgContext } from './leave-chain.util';`
- Replace the `create` method and add a new private `buildOrgContext` method:

```typescript
  async create(userId: number, dto: CreateLeaveRequestDto) {
    const durationDays = this.calculateDurationDays(dto.start_date, dto.end_date);
    const context = await this.buildOrgContext(userId);
    const chain = resolveApprovalChain(context, durationDays);

    const created = await this.prisma.leaveRequest.create({
      data: {
        userId,
        leaveType: dto.leave_type,
        startDate: new Date(dto.start_date),
        endDate: new Date(dto.end_date),
        durationDays,
        attendanceDate: dto.attendance_date
          ? new Date(dto.attendance_date)
          : null,
        correctionTime: dto.correction_time ?? null,
        status: LeaveStatus.pending,
        reason: dto.reason,
        approvalSteps: {
          create: chain.map((step, index) => ({
            level: step.level,
            order: index,
            approverId: step.approverId,
          })),
        },
      },
      include: LEAVE_INCLUDE,
    });

    return toLeaveRequestResponse(created);
  }

  private async buildOrgContext(userId: number): Promise<OrgContext> {
    const [requester, director] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          orgRole: true,
          team: {
            select: { leaderId: true, department: { select: { managerId: true } } },
          },
          ledTeam: {
            select: { department: { select: { managerId: true } } },
          },
        },
      }),
      this.prisma.user.findFirst({
        where: { orgRole: OrgRole.DIRECTOR },
        orderBy: { id: 'asc' },
        select: { id: true },
      }),
    ]);

    if (!requester) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      id: requester.id,
      orgRole: requester.orgRole,
      leaderId: requester.team?.leaderId ?? null,
      managerId:
        requester.team?.department.managerId ??
        requester.ledTeam?.department.managerId ??
        null,
      directorId: director?.id ?? null,
    };
  }
```

Delete the old `approver`-validation block that used to sit at the top of `create` (the `this.prisma.user.findUnique({ where: { id: dto.approver_id } })` / `isApprover` checks) — it's fully replaced by `buildOrgContext` + `resolveApprovalChain`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest src/hr/leave/leave.service.spec.ts -t create`
Expected: PASS. (`listApproval`/`approve`/`reject` tests in the same file are still on the old flat-`approverId` shape — they'll fail until Tasks 8/9; that's expected here, don't fix them in this task.)

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: succeeds — `decide()`/`listApproval()` still compile against the old `approverId` field on `LeaveRequest`, which Task 1 left untouched.

- [ ] **Step 9: Commit**

```bash
git add src/hr/leave/dto/create-leave-request.dto.ts src/hr/leave/leave.constants.ts src/hr/leave/leave.mapper.ts src/hr/leave/leave.service.ts src/hr/leave/leave.service.spec.ts
git commit -m "feat: LeaveService.create() snapshots the resolved approval chain"
```

---

### Task 8: LeaveService decide()/approve()/reject() — step-based

**Files:**
- Modify: `src/hr/leave/leave.service.ts`
- Modify: `src/hr/leave/leave.service.spec.ts`

**Interfaces:**
- Consumes: `leave.approvalSteps` (ordered, from Task 7's `LEAVE_INCLUDE`), `actor.isAdmin` (from Task 2's `JwtPayload`).
- Produces: `approve`/`reject` unchanged signatures; internal `decide` renamed `decideStep`, now advances the current pending step instead of flipping a single flag.

- [ ] **Step 1: Replace the `approve / reject` tests first**

Replace the whole `describe('approve / reject', ...)` block in `leave.service.spec.ts`:

```typescript
  describe('approve / reject', () => {
    function pendingLeave(steps: Array<{ id: number; order: number; approverId: number | null; status: string }>) {
      return {
        id: 1,
        userId: 1,
        leaveType: LeaveType.annual,
        startDate: new Date('2026-08-17'),
        endDate: new Date('2026-08-17'),
        durationDays: 1,
        attendanceDate: null,
        correctionTime: null,
        status: LeaveStatus.pending,
        reason: 'test',
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        approvalSteps: steps,
      };
    }

    const twoStepLeave = pendingLeave([
      { id: 1, order: 0, approverId: 7, status: 'pending' },
      { id: 2, order: 1, approverId: 8, status: 'pending' },
    ]);

    it('rejects the decision when the actor is neither the current step approver nor admin', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      const stranger: JwtPayload = { sub: 99, username: 'stranger', isAdmin: false, orgRole: 'MEMBER' } as JwtPayload;

      await expect(service.approve(1, stranger)).rejects.toThrow(ForbiddenException);
      expect(prisma.leaveApprovalStep.update).not.toHaveBeenCalled();
    });

    it('requires a note to reject', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      const approver: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;

      await expect(service.reject(1, approver)).rejects.toThrow(BadRequestException);
    });

    it('approving the first of two steps advances to the next step without finalizing the request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const leaderApprover: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;

      const result = await service.approve(1, leaderApprover, 'ok');

      expect(prisma.leaveApprovalStep.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'approved', note: 'ok', decidedAt: expect.any(Date) },
      });
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: {} }),
      );
      expect(result.status).toBe('pending');
    });

    it('approving the last step finalizes the request as approved', async () => {
      const lastStepPending = pendingLeave([
        { id: 1, order: 0, approverId: 7, status: 'approved' },
        { id: 2, order: 1, approverId: 8, status: 'pending' },
      ]);
      prisma.leaveRequest.findUnique.mockResolvedValue(lastStepPending);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...lastStepPending, ...data }),
      );
      const managerApprover: JwtPayload = { sub: 8, username: 'manager', isAdmin: false, orgRole: 'MANAGER' } as JwtPayload;

      const result = await service.approve(2, managerApprover, 'ok');

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: LeaveStatus.approved,
            decidedAt: expect.any(Date),
            decidedById: 8,
            decisionNote: 'ok',
          },
        }),
      );
      expect(result.status).toBe('approved');
    });

    it('rejecting at any step finalizes the request as rejected', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const leaderApprover: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;

      const result = await service.reject(1, leaderApprover, 'không hợp lệ');

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: LeaveStatus.rejected,
            decidedAt: expect.any(Date),
            decidedById: 7,
            decisionNote: 'không hợp lệ',
          },
        }),
      );
      expect(result.status).toBe('rejected');
    });

    it('an isAdmin actor can decide a step even when not its approverId', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const admin: JwtPayload = { sub: 1, username: 'admin', isAdmin: true, orgRole: 'MEMBER' } as JwtPayload;

      await expect(service.approve(1, admin, 'ok')).resolves.toBeDefined();
      expect(prisma.leaveApprovalStep.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'approved', note: 'ok', decidedAt: expect.any(Date) },
      });
    });

    it('does not write back to Attendance when approving a non-feedback request', async () => {
      const singleStep = pendingLeave([{ id: 1, order: 0, approverId: 7, status: 'pending' }]);
      prisma.leaveRequest.findUnique.mockResolvedValue(singleStep);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...singleStep, ...data }),
      );
      const approver: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).not.toHaveBeenCalled();
    });

    it('writes the correction back to Attendance when the last step approves a feedback request', async () => {
      const singleStep = {
        ...pendingLeave([{ id: 1, order: 0, approverId: 7, status: 'pending' }]),
        leaveType: LeaveType.feedback,
        attendanceDate: new Date('2026-08-10'),
        correctionTime: '08:15',
      };
      prisma.leaveRequest.findUnique.mockResolvedValue(singleStep);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...singleStep, ...data }),
      );
      const approver: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).toHaveBeenCalledWith(
        1,
        new Date('2026-08-10'),
        '08:15',
      );
    });
  });
```

Add `leaveApprovalStep: { update: jest.fn() }` to the `prisma` mock object at the top of the spec file (next to `leaveBalance`), and add `type { JwtPayload }` is already imported.

- [ ] **Step 2: Run to verify these tests fail**

Run: `npx jest src/hr/leave/leave.service.spec.ts -t "approve / reject"`
Expected: FAIL — current `decide()` still reads `leave.approverId`/`actor.role`.

- [ ] **Step 3: Rewrite `decide()` in `leave.service.ts`**

Replace the `approve`, `reject`, and private `decide` methods:

```typescript
  async approve(id: number, actor: JwtPayload, note?: string) {
    return this.decideStep(id, actor, ApprovalStepStatus.approved, note);
  }

  async reject(id: number, actor: JwtPayload, note?: string) {
    if (!note) {
      throw new BadRequestException('note bắt buộc khi từ chối đơn');
    }
    return this.decideStep(id, actor, ApprovalStepStatus.rejected, note);
  }

  private async decideStep(
    id: number,
    actor: JwtPayload,
    decision: typeof ApprovalStepStatus.approved | typeof ApprovalStepStatus.rejected,
    note?: string,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { approvalSteps: { orderBy: { order: 'asc' } } },
    });

    if (!leave) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }
    if (leave.status !== LeaveStatus.pending) {
      throw new BadRequestException('Đơn đã được xử lý');
    }

    const currentStep = leave.approvalSteps.find(
      (step) => step.status === ApprovalStepStatus.pending,
    );
    if (!currentStep) {
      throw new BadRequestException('Đơn đã được xử lý');
    }
    if (currentStep.approverId !== actor.sub && !actor.isAdmin) {
      throw new ForbiddenException('Không có quyền duyệt đơn này');
    }

    await this.prisma.leaveApprovalStep.update({
      where: { id: currentStep.id },
      data: { status: decision, note: note ?? null, decidedAt: new Date() },
    });

    const isLastStep = currentStep.order === leave.approvalSteps.length - 1;
    const finalStatus =
      decision === ApprovalStepStatus.rejected
        ? LeaveStatus.rejected
        : isLastStep
          ? LeaveStatus.approved
          : null;

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: finalStatus
        ? {
            status: finalStatus,
            decidedAt: new Date(),
            decidedById: actor.sub,
            decisionNote: note ?? null,
          }
        : {},
      include: LEAVE_INCLUDE,
    });

    if (
      finalStatus === LeaveStatus.approved &&
      leave.leaveType === LeaveType.feedback &&
      leave.attendanceDate &&
      leave.correctionTime
    ) {
      await this.attendanceService.applyCorrection(
        leave.userId,
        leave.attendanceDate,
        leave.correctionTime,
      );
    }

    return toLeaveRequestResponse(updated);
  }
```

Update the import line to add `ApprovalStepStatus`: `import { ApprovalStepStatus, LeaveStatus, LeaveType, OrgRole, Prisma, Role } from '@prisma/client';` — `Role` is still needed by `listApproval` (line 94) until Task 9 rewrites it, so keep it in the import list for now.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/hr/leave/leave.service.spec.ts -t "approve / reject"`
Expected: PASS (8 tests)

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/hr/leave/leave.service.ts src/hr/leave/leave.service.spec.ts
git commit -m "feat: LeaveService approve/reject advance the current approval step"
```

---

### Task 9: LeaveService listApproval() + listAllAdmin() — step-scoped

**Files:**
- Modify: `src/hr/leave/leave.service.ts`
- Modify: `src/hr/leave/dto/admin-list-leave-query.dto.ts`
- Modify: `src/hr/leave/leave.service.spec.ts`

**Interfaces:**
- Produces: `listApproval(user, query)` scopes non-admins to "requests with a pending step assigned to me"; `listAllAdmin(query)`'s `approver_id` filter now matches "was ever assigned to this approver at any step" via `approvalSteps.some`.

- [ ] **Step 1: Replace the `listApproval` tests first**

```typescript
  describe('listApproval', () => {
    it('scopes non-admins to requests with a pending step assigned to them', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3);

      const approver: JwtPayload = { sub: 7, username: 'leader', isAdmin: false, orgRole: 'LEADER' } as JwtPayload;
      const result = await service.listApproval(approver, { page: 1, page_size: 20 });

      const expectedScope = {
        approvalSteps: { some: { approverId: 7, status: 'pending' } },
      };
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedScope }),
      );
      expect(result.pending_count).toBe(3);
    });

    it('lets isAdmin actors see every request', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      const admin: JwtPayload = { sub: 1, username: 'admin', isAdmin: true, orgRole: 'MEMBER' } as JwtPayload;
      await service.listApproval(admin, { page: 1, page_size: 20 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
```

- [ ] **Step 2: Update the `listAllAdmin` search-filter test's expectation**

In the existing `describe('listAllAdmin', ...)` test, no change is needed to the search/status assertions — only add a new test:

```typescript
    it('filters by approver_id against any approval step (not just pending)', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      await service.listAllAdmin({ page: 1, page_size: 10, approver_id: 7 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approvalSteps: { some: { approverId: 7 } },
          }),
        }),
      );
    });
```

- [ ] **Step 3: Run to verify the new/changed tests fail**

Run: `npx jest src/hr/leave/leave.service.spec.ts -t "listApproval|listAllAdmin"`
Expected: FAIL.

- [ ] **Step 4: Rewrite `listApproval()`**

```typescript
  async listApproval(user: JwtPayload, query: ListLeaveQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;

    const scope: Prisma.LeaveRequestWhereInput = user.isAdmin
      ? {}
      : {
          approvalSteps: {
            some: { approverId: user.sub, status: ApprovalStepStatus.pending },
          },
        };
    const where: Prisma.LeaveRequestWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total, pendingCount] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.count({
        where: { ...scope, status: LeaveStatus.pending },
      }),
    ]);

    return {
      items: items.map(toLeaveRequestResponse),
      pending_count: pendingCount,
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }
```

- [ ] **Step 5: Update `AdminListLeaveQueryDto`'s `approver_id` filter usage in `listAllAdmin`**

In `listAllAdmin`'s `where` block, replace:
```typescript
      ...(query.approver_id ? { approverId: query.approver_id } : {}),
```
with:
```typescript
      ...(query.approver_id
        ? { approvalSteps: { some: { approverId: query.approver_id } } }
        : {}),
```

(No change needed to `admin-list-leave-query.dto.ts` itself — `approver_id` stays an `@IsInt()` filter param, only its meaning in the service changes.)

- [ ] **Step 6: Remove the now-unused `Role` import**

`Role` is no longer referenced anywhere in `leave.service.ts` after this task — remove it from the import line: `import { ApprovalStepStatus, LeaveStatus, LeaveType, OrgRole, Prisma } from '@prisma/client';`

Run: `grep -n "Role\." src/hr/leave/leave.service.ts`
Expected: no output (only `OrgRole.DIRECTOR` remains, which is a different identifier).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest src/hr/leave/leave.service.spec.ts`
Expected: PASS — every test in the file (all `describe` blocks) is now green.

- [ ] **Step 8: Full build + test**

Run: `npm run build && npm test`
Expected: pass. (`dashboard.service.spec.ts` may still fail here — untouched until Task 10, that's expected.)

- [ ] **Step 9: Commit**

```bash
git add src/hr/leave
git commit -m "feat: LeaveService listApproval/listAllAdmin scope by approval step"
```

---

### Task 10: Dashboard — leader()/manager() + admin() counts rewrite

**Files:**
- Modify: `src/hr/dashboard/dashboard.service.ts`
- Modify: `src/hr/dashboard/dashboard.service.spec.ts`
- Modify: `src/hr/dashboard/dashboard.app.controller.ts`

**Interfaces:**
- Produces: `DashboardService.admin()` (unchanged signature, new internals), `.leader(userId)`, `.manager(userId)` — same response shape as `.admin()` but scoped. `DashboardAppController` gains `GET app/dashboard/leader` (requires `@MinOrgRole(OrgRole.LEADER)`) and `GET app/dashboard/manager` (requires `@MinOrgRole(OrgRole.MANAGER)`).

- [ ] **Step 1: Replace `dashboard.service.spec.ts`'s admin test + add leader/manager tests**

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    user: { count: jest.fn() },
    attendance: { count: jest.fn(), findMany: jest.fn() },
    leaveRequest: { count: jest.fn(), findMany: jest.fn() },
    team: { findUnique: jest.fn(), findMany: jest.fn() },
    department: { findUnique: jest.fn() },
  };
  const leaveService = { getBalance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeaveService, useValue: leaveService },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('assembles admin team statistics scoped to the whole company', async () => {
    prisma.user.count
      .mockResolvedValueOnce(25) // totalEmployees
      .mockResolvedValueOnce(3) // totalAdmins
      .mockResolvedValueOnce(22) // totalMembers
      .mockResolvedValueOnce(25); // totalEmployees inside countUnapprovedAbsences
    prisma.attendance.count.mockResolvedValue(20);
    prisma.leaveRequest.count.mockResolvedValue(4);
    prisma.leaveRequest.findMany
      .mockResolvedValueOnce([
        {
          userId: 3,
          leaveType: 'unpaid',
          user: { id: 3, username: 'lvc', firstName: 'Văn C', lastName: 'Lê', isAdmin: false, orgRole: 'MEMBER' },
        },
      ]) // onLeaveToday
      .mockResolvedValueOnce([]); // pendingLeaveRequests
    prisma.attendance.findMany.mockResolvedValue([]);

    const result = await service.admin();

    expect(prisma.user.count).toHaveBeenNthCalledWith(1, { where: {} });
    expect(result.team_statistics.total_employees).toBe(25);
    expect(result.team_statistics.total_admins).toBe(3);
    expect(result.team_statistics.total_members).toBe(22);
    expect(result.absent_today).toEqual([
      { id: 3, name: 'Văn C Lê', role_label: 'Nhân viên', leave_type_label: 'Không lương', avatar_initial: 'V' },
    ]);
  });

  it('leader() scopes every count to the caller\'s team', async () => {
    prisma.team.findUnique.mockResolvedValue({ id: 5, leaderId: 7 });
    prisma.user.count.mockResolvedValue(0);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.leaveRequest.count.mockResolvedValue(0);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);

    await service.leader(7);

    expect(prisma.team.findUnique).toHaveBeenCalledWith({ where: { leaderId: 7 } });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, { where: { teamId: 5 } });
  });

  it('leader() throws NotFoundException when the caller leads no team', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    await expect(service.leader(7)).rejects.toThrow(NotFoundException);
  });

  it('manager() scopes every count to the caller\'s department (via team.departmentId)', async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 2, managerId: 8 });
    prisma.user.count.mockResolvedValue(0);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.leaveRequest.count.mockResolvedValue(0);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);

    await service.manager(8);

    expect(prisma.department.findUnique).toHaveBeenCalledWith({ where: { managerId: 8 } });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { team: { departmentId: 2 } },
    });
  });

  it('manager() throws NotFoundException when the caller manages no department', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.manager(8)).rejects.toThrow(NotFoundException);
  });

  it('assembles member dashboard from LeaveService.getBalance + recent requests', async () => {
    leaveService.getBalance.mockResolvedValue({ year: 2026, total: 12, used: 3.5, remaining: 8.5 });
    prisma.leaveRequest.findMany.mockResolvedValue([]);

    const result = await service.member(1);

    expect(leaveService.getBalance).toHaveBeenCalledWith(1);
    expect(result.leave_balance).toEqual({ total: 12, used: 3.5, remaining: 8.5 });
    expect(result.recent_requests).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/hr/dashboard/dashboard.service.spec.ts`
Expected: FAIL — `service.leader`/`service.manager` don't exist yet, and `admin()` isn't called with `{ where: {} }`.

- [ ] **Step 3: Rewrite `dashboard.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfToday } from '../attendance/attendance-status.util';
import { LEAVE_INCLUDE, LEAVE_TYPE_LABELS } from '../leave/leave.constants';
import { displayName, toLeaveRequestResponse } from '../leave/leave.mapper';
import { LeaveService } from '../leave/leave.service';

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  [OrgRole.MEMBER]: 'Nhân viên',
  [OrgRole.LEADER]: 'Trưởng nhóm',
  [OrgRole.MANAGER]: 'Trưởng phòng',
  [OrgRole.DIRECTOR]: 'Giám đốc',
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveService: LeaveService,
  ) {}

  admin() {
    return this.buildStatistics({});
  }

  async leader(userId: number) {
    const team = await this.prisma.team.findUnique({ where: { leaderId: userId } });
    if (!team) {
      throw new NotFoundException('Bạn chưa được gán làm Trưởng nhóm của team nào');
    }
    return this.buildStatistics({ teamId: team.id });
  }

  async manager(userId: number) {
    const department = await this.prisma.department.findUnique({ where: { managerId: userId } });
    if (!department) {
      throw new NotFoundException('Bạn chưa được gán làm Trưởng phòng của phòng ban nào');
    }
    return this.buildStatistics({ team: { departmentId: department.id } });
  }

  private async buildStatistics(userWhere: Prisma.UserWhereInput) {
    const today = startOfToday();

    const [
      totalEmployees,
      totalAdmins,
      totalMembers,
      presentToday,
      pendingApprovals,
      onLeaveToday,
      pendingLeaveRequests,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, isAdmin: true } }),
      this.prisma.user.count({ where: { ...userWhere, isAdmin: false } }),
      this.prisma.attendance.count({
        where: { date: today, checkinTime: { not: null }, user: userWhere },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.pending, user: userWhere },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: LeaveStatus.approved,
          startDate: { lte: today },
          endDate: { gte: today },
          user: userWhere,
        },
        include: {
          user: {
            select: { id: true, username: true, firstName: true, lastName: true, isAdmin: true, orgRole: true },
          },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.pending, user: userWhere },
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const absentApprovedCount = onLeaveToday.length;
    const absentUnapprovedCount = await this.countUnapprovedAbsences(
      today,
      onLeaveToday.map((leave) => leave.userId),
      userWhere,
    );

    return {
      team_statistics: {
        total_employees: totalEmployees,
        total_admins: totalAdmins,
        total_members: totalMembers,
        present: presentToday,
        absent: {
          total: absentApprovedCount + absentUnapprovedCount,
          approved: absentApprovedCount,
          unapproved: absentUnapprovedCount,
        },
        pending_approvals: pendingApprovals,
      },
      pending_leave_requests: pendingLeaveRequests.map(toLeaveRequestResponse),
      absent_today: onLeaveToday.map((leave) => ({
        id: leave.user.id,
        name: displayName(leave.user),
        role_label: leave.user.isAdmin ? 'Quản trị viên' : ORG_ROLE_LABELS[leave.user.orgRole],
        leave_type_label: LEAVE_TYPE_LABELS[leave.leaveType],
        avatar_initial: displayName(leave.user).charAt(0).toUpperCase(),
      })),
    };
  }

  async member(userId: number) {
    const [balance, recentRequests] = await Promise.all([
      this.leaveService.getBalance(userId),
      this.prisma.leaveRequest.findMany({
        where: { userId },
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    return {
      leave_balance: { total: balance.total, used: balance.used, remaining: balance.remaining },
      recent_requests: recentRequests.map(toLeaveRequestResponse),
    };
  }

  // ponytail: approximate — doesn't exclude weekends/holidays from "unapproved absent" count.
  // Good enough for the dashboard tile; revisit once a holiday calendar exists.
  private async countUnapprovedAbsences(
    today: Date,
    onLeaveUserIds: number[],
    userWhere: Prisma.UserWhereInput,
  ): Promise<number> {
    const [checkedIn, totalEmployees] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: today, checkinTime: { not: null }, user: userWhere },
        select: { userId: true },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    const accountedFor = new Set([
      ...checkedIn.map((a) => a.userId),
      ...onLeaveUserIds,
    ]);
    return Math.max(0, totalEmployees - accountedFor.size);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/hr/dashboard/dashboard.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Add `leader`/`manager` endpoints to `DashboardAppController`**

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../../auth/guards/org-role.guard';
import { MinOrgRole } from '../../auth/decorators/min-org-role.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { DashboardService } from './dashboard.service';

@Controller('app/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardAppController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('member')
  member(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.member(user.sub);
  }

  @Get('leader')
  @UseGuards(OrgRoleGuard)
  @MinOrgRole(OrgRole.LEADER)
  leader(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.leader(user.sub);
  }

  @Get('manager')
  @UseGuards(OrgRoleGuard)
  @MinOrgRole(OrgRole.MANAGER)
  manager(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.manager(user.sub);
  }
}
```

- [ ] **Step 6: Add a controller test for the new guards**

Append to `dashboard.controller.spec.ts` (already updated in Task 3 to use `AdminGuard`):

```typescript
describe('DashboardAppController org-scoped routes', () => {
  it('gates leader/manager behind OrgRoleGuard', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, DashboardAppController.prototype.leader) as unknown[]) ?? [];
    expect(guards).toContain(OrgRoleGuard);
  });
});
```

(Add `import { OrgRoleGuard } from '../../auth/guards/org-role.guard';` at the top of the spec file.)

- [ ] **Step 7: Full build + test**

Run: `npm run build && npm test`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/hr/dashboard
git commit -m "feat: dashboard leader()/manager() scoped stats + isAdmin/orgRole counts"
```

---

### Task 11: Remove ApproversModule

**Files:**
- Delete: `src/hr/approvers/` (entire directory: `approvers.module.ts`, `approvers.service.ts`, `approvers.service.spec.ts`, `approvers.admin.controller.ts`, `approvers.admin.controller.spec.ts`, `approvers.app.controller.ts`, `approvers.app.controller.spec.ts`)
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: no `admin/approvers` or `app/approvers` routes. The mini-app's "pick your approver" dropdown has no backing endpoint anymore — approvers are resolved automatically by `LeaveService.create()` (Task 7).

- [ ] **Step 1: Confirm nothing outside the module still references it**

Run: `grep -rln "approvers" src --include="*.ts" | grep -v "^src/hr/approvers/"`
Expected: no output (only `app.module.ts`'s import, checked in Step 3 below, may show up — everything else should be clean since `isApprover`/`approverTitle` on `User` are unrelated fields still used by `seed.ts` defaults, not this module).

- [ ] **Step 2: Delete the module**

```bash
rm -rf src/hr/approvers
```

- [ ] **Step 3: Remove it from `AppModule`**

In `src/app.module.ts`, remove `import { ApproversModule } from './hr/approvers/approvers.module';` and remove `ApproversModule` from the `imports` array.

- [ ] **Step 4: Full build + test**

Run: `npm run build && npm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove ApproversModule (approver is now resolved from org hierarchy)"
```

---

### Task 12: Cleanup migration — drop Role/isApprover/approverTitle/LeaveRequest.approverId

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_drop_flat_role_and_approver/migration.sql` (generated)

**Interfaces:**
- Produces: final schema — no `Role` enum, no `User.role`/`isApprover`/`approverTitle`, no `LeaveRequest.approverId`/`approver` relation. `User.leaveRequestsAsApprover` back-relation removed too.

- [ ] **Step 1: Confirm nothing still references the fields being dropped**

Run: `grep -rn "\.role\b\|Role\.ADMIN\|Role\.MEMBER\|isApprover\|approverTitle\|\.approverId\b" src --include="*.ts" | grep -v approvalSteps`
Expected: no output. If anything shows up, stop and fix it in place before touching the schema — it means an earlier task missed a reference.

- [ ] **Step 2: Edit `prisma/schema.prisma`**

Remove the `Role` enum block entirely. In `model User`, remove these lines:
```prisma
  role      Role     @default(MEMBER)
```
```prisma
  isApprover    Boolean @default(false)
  approverTitle String?
```
```prisma
  leaveRequestsAsApprover  LeaveRequest[]      @relation("LeaveApprover")
```

In `model LeaveRequest`, remove:
```prisma
  approverId     Int
  approver       User        @relation("LeaveApprover", fields: [approverId], references: [id])
```
and the index:
```prisma
  @@index([approverId])
```

- [ ] **Step 3: Generate the migration**

Run: `npx prisma migrate dev --name drop_flat_role_and_approver`
This is destructive (drops columns/enum) — Prisma will show a warning about data loss on `User.role`/`isApprover`/`approverTitle`/`LeaveRequest.approverId`. Confirm it (dev database only; these fields' data is fully superseded by `isAdmin`/`orgRole`/`LeaveApprovalStep` from Tasks 1/7).

- [ ] **Step 4: Full build + test**

Run: `npm run build && npm test`
Expected: pass — nothing in `src/` referenced the dropped fields as of Task 11's grep check.

- [ ] **Step 5: Re-seed and smoke-test**

Run: `npm run db:seed`
Expected: succeeds with the Task 5 seed script (which never referenced `isApprover`/`approverTitle`/`role`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore: drop legacy Role enum, isApprover/approverTitle, LeaveRequest.approverId"
```

---

### Task 13: Update API docs

**Files:**
- Modify: `docs/ADMIN_API_DOCS.md`
- Modify: `docs/APP_API_DOCS.md`
- Modify: `docs/HR_API_DOCS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: `ADMIN_API_DOCS.md`**

- Row 17 (`Approvers`, `GET /api/g-care/admin/approvers`) — delete; endpoint no longer exists.
- Add two rows for the new Org module: `GET/POST /api/g-care/admin/org/teams`, `PATCH /api/g-care/admin/org/teams/:id`, `GET/POST /api/g-care/admin/org/departments`, `PATCH /api/g-care/admin/org/departments/:id`.
- §3.2 "Thống kê số liệu tổng quan" example JSON — `total_admins`/`total_members` keys stay the same name but now count `isAdmin`/non-`isAdmin` users across all 4 org levels, not the old 2-value `Role`; add one line of prose noting that.
- §3.4 leave endpoints — every sample JSON showing `"approver_id": 2` / `"approver_name": "..."` must be replaced with an `"approval_steps"` array sample, e.g.:
```json
"approval_steps": [
  { "level": "LEADER", "approver_id": 7, "approver_name": "Trần Thị B", "status": "approved", "note": null, "decided_at": "2026-08-18T02:00:00.000Z" },
  { "level": "MANAGER", "approver_id": 8, "approver_name": "Lê Văn C", "status": "pending", "note": null, "decided_at": null }
]
```
- Note under §10 that `approver_id` as a *query filter* now matches "assigned at any step," not just the old single flat field.

- [ ] **Step 2: `APP_API_DOCS.md`**

- Row 18 (`Approvers`, `GET /api/g-care/app/approvers`) — delete.
- §9 "Tạo đơn mới" — remove `approver_id` from the request body sample (it's no longer accepted; the chain is resolved server-side). Response sample gets the same `approval_steps` array treatment as above.
- §11 "Danh sách đơn cần tôi phê duyệt" — add a note that this now returns requests where the caller has a *pending* step, not "requests where I'm the flat approver."
- §13 and any other leave-detail sample JSON — same `approval_steps` replacement.
- Add two new dashboard rows: `GET /api/g-care/app/dashboard/leader` (requires orgRole ≥ LEADER) and `GET /api/g-care/app/dashboard/manager` (requires orgRole ≥ MANAGER), same response shape as the admin dashboard endpoint but scoped.

- [ ] **Step 3: `HR_API_DOCS.md`**

Run: `grep -n "approver\|Role\.\|role:" docs/HR_API_DOCS.md` first to see what needs the same treatment (this file wasn't read during planning) — apply the same `approval_steps`/`isAdmin`+`orgRole` substitutions used in Steps 1-2 wherever they appear.

- [ ] **Step 4: Commit**

```bash
git add docs/ADMIN_API_DOCS.md docs/APP_API_DOCS.md docs/HR_API_DOCS.md
git commit -m "docs: reflect org hierarchy, approval-step chain, removed Approvers endpoints"
```

---

### Task 14: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable if pre-existing).

- [ ] **Step 4: Exhaustive grep for dead references**

Run: `grep -rn "RolesGuard\|ROLES_KEY\|approvers\.\|isApprover\|approverTitle\|Role\.ADMIN\|Role\.MEMBER" src --include="*.ts"`
Expected: no output.

- [ ] **Step 5: Re-seed the dev DB one more time end-to-end**

Run: `npm run db:seed`
Expected: succeeds, logs the 5 seeded accounts + department + team.

- [ ] **Step 6: Manual smoke test of the chain (optional but recommended)**

Start the server (`npm run start:dev`), log in as `member`/`member`, `POST app/leave` with a 6-day `annual` request, then confirm via `GET app/leave/mine` that `approval_steps` has 3 entries (`LEADER`, `MANAGER`, `DIRECTOR`) with the seeded `leader`/`manager`/`director` ids. Log in as `leader`/`leader`, `PATCH app/leave/:id/approve`, confirm `status` stays `pending` and the `MANAGER` step is now current. Repeat as `manager`, then `director`, confirming `status` finally flips to `approved`.
