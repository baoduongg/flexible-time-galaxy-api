# Admin panel / Mini app route split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `hr/*` / `users` routes into `admin/*` (HR admin panel) and `app/*` (mini app) namespaces, and wire the currently-unwired `hr` modules into `AppModule`, without changing any service/DTO/prisma logic.

**Architecture:** Each domain keeps its existing folder (`src/hr/<domain>/`, `src/users/`). Domains serving both clients get 2 thin controller files (`*.app.controller.ts`, `*.admin.controller.ts`) that inject the same unchanged Service. Domains serving one client get their single controller's `@Controller()` prefix (and guards, where needed) updated in place. Permission rule: every `admin/*` controller carries class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; every `app/*` controller carries class-level `@UseGuards(JwtAuthGuard)` only, with any finer-grained permission (e.g. leave approve/reject) staying inside the Service as it already is.

**Tech Stack:** NestJS 10, Prisma, Jest.

**Spec:** `docs/superpowers/specs/2026-08-18-admin-app-split-design.md`

## Global Constraints

- No changes to any `*.service.ts`, `*.dto.ts`, or Prisma schema/logic — controllers only.
- `admin/*` controllers: class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`.
- `app/*` controllers: class-level `@UseGuards(JwtAuthGuard)` only; no `Role.ADMIN` gate on approve/reject (business logic in `LeaveService` already restricts this).
- `news` GET endpoints stay unguarded (public read) — this is existing behavior, not a regression to fix.
- Every renamed/split controller keeps its original handler bodies byte-for-byte (only `@Controller()` path, guard decorators, and file/class names change).

---

### Task 1: Fix `AppModule` wiring

**Files:**
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `DashboardModule` (`src/hr/dashboard/dashboard.module.ts`, already exists, already imports `LeaveModule`), `ApproversModule` (`src/hr/approvers/approvers.module.ts`, already exists, standalone).
- Produces: nothing new — this task only fixes the module graph so later tasks' routes are reachable at all.

- [ ] **Step 1: Add the missing imports to `AppModule`**

Edit `src/app.module.ts` to:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NewsModule } from './hr/news/news.module';
import { DashboardModule } from './hr/dashboard/dashboard.module';
import { ApproversModule } from './hr/approvers/approvers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    NewsModule,
    DashboardModule,
    ApproversModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

`DashboardModule` already `imports: [LeaveModule]`, and `LeaveModule` already `imports: [AttendanceModule]` — importing `DashboardModule` here pulls `LeaveController` and `AttendanceController` into the app's module graph too, so this one edit wires all 4 previously-missing modules.

- [ ] **Step 2: Run the e2e test to verify the module graph resolves**

Run: `pnpm test:e2e`
Expected: PASS. `test/app.e2e-spec.ts` boots the full `AppModule` via `Test.createTestingModule({ imports: [AppModule] }).compile()` then `app.init()` — if any provider in the newly-wired modules is missing a dependency, this call throws immediately. A pass here proves the wiring is correct.

- [ ] **Step 3: Commit**

```bash
git add src/app.module.ts
git commit -m "fix: wire DashboardModule and ApproversModule into AppModule

Their routes (hr/dashboard/*, hr/attendance/*, hr/leave/*, hr/approvers)
were dead code — never reachable because nothing imported them into
AppModule's module graph."
```

---

### Task 2: Rename `users` routes to `admin/users`

**Files:**
- Modify: `src/users/users.controller.ts:24`

**Interfaces:**
- Consumes: nothing new.
- Produces: `admin/users` route prefix, used as the pattern later tasks copy.

- [ ] **Step 1: Write the failing test**

Create `src/users/users.controller.spec.ts`:

```typescript
import { PATH_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('is mounted under admin/users', () => {
    const path = Reflect.getMetadata(PATH_METADATA, UsersController) as string;
    expect(path).toBe('admin/users');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- users.controller.spec.ts`
Expected: FAIL — actual path is `'users'`, not `'admin/users'`.

- [ ] **Step 3: Update the controller prefix**

In `src/users/users.controller.ts`, change:

```typescript
@Controller('users')
```

to:

```typescript
@Controller('admin/users')
```

(Guards are already `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` at class level — matches the `admin/*` rule as-is, no other change needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- users.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/users/users.controller.ts src/users/users.controller.spec.ts
git commit -m "refactor: mount users routes under admin/users"
```

---

### Task 3: Rename `hr/approvers` routes to `admin/approvers`

**Files:**
- Modify: `src/hr/approvers/approvers.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `admin/approvers` route.

- [ ] **Step 1: Write the failing test**

Create `src/hr/approvers/approvers.controller.spec.ts`:

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { ApproversController } from './approvers.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('ApproversController', () => {
  it('is mounted under admin/approvers', () => {
    const path = Reflect.getMetadata(PATH_METADATA, ApproversController) as string;
    expect(path).toBe('admin/approvers');
  });

  it('requires ADMIN role', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ApproversController) as unknown[];
    expect(guards).toContain(RolesGuard);

    const roles = Reflect.getMetadata(ROLES_KEY, ApproversController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- approvers.controller.spec.ts`
Expected: FAIL — current path is `'hr/approvers'`, no `RolesGuard`/`@Roles` present.

- [ ] **Step 3: Update the controller**

Replace `src/hr/approvers/approvers.controller.ts` with:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApproversService } from './approvers.service';

@Controller('admin/approvers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ApproversController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- approvers.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hr/approvers/approvers.controller.ts src/hr/approvers/approvers.controller.spec.ts
git commit -m "refactor: mount approvers routes under admin/approvers, require ADMIN role"
```

---

### Task 4: Rename `hr/attendance` routes to `app/attendance`

**Files:**
- Modify: `src/hr/attendance/attendance.controller.ts:16`

**Interfaces:**
- Consumes: nothing new.
- Produces: `app/attendance` route.

- [ ] **Step 1: Write the failing test**

Add to `src/hr/attendance/attendance.controller.spec.ts` (append inside the existing `describe` block, keep the existing `it.each` test as-is):

```typescript
  it('is mounted under app/attendance', () => {
    const path = Reflect.getMetadata(PATH_METADATA, AttendanceController) as string;
    expect(path).toBe('app/attendance');
  });
```

Add the needed import at the top of the file:

```typescript
import { PATH_METADATA } from '@nestjs/common/constants';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- attendance.controller.spec.ts`
Expected: FAIL — actual path is `'hr/attendance'`.

- [ ] **Step 3: Update the controller prefix**

In `src/hr/attendance/attendance.controller.ts`, change:

```typescript
@Controller('hr/attendance')
```

to:

```typescript
@Controller('app/attendance')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- attendance.controller.spec.ts`
Expected: PASS (both the new test and the pre-existing `checkin`/`checkout` 200-status test)

- [ ] **Step 5: Commit**

```bash
git add src/hr/attendance/attendance.controller.ts src/hr/attendance/attendance.controller.spec.ts
git commit -m "refactor: mount attendance routes under app/attendance"
```

---

### Task 5: Split `hr/news` into `app/news` + `admin/news`

**Files:**
- Create: `src/hr/news/news.app.controller.ts`
- Create: `src/hr/news/news.admin.controller.ts`
- Delete: `src/hr/news/news.controller.ts`
- Modify: `src/hr/news/news.module.ts`

**Interfaces:**
- Consumes: `NewsService` (unchanged), `CreateNewsDto`, `UpdateNewsDto`, `ListNewsQueryDto` (unchanged).
- Produces: `NewsAppController`, `NewsAdminController` — exported class names later tasks/tests reference.

- [ ] **Step 1: Write the failing test**

Create `src/hr/news/news.controller.spec.ts`:

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { NewsAppController } from './news.app.controller';
import { NewsAdminController } from './news.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('NewsAppController', () => {
  it('is mounted under app/news with no class-level role guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, NewsAppController) as string;
    expect(path).toBe('app/news');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, NewsAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(RolesGuard);
  });
});

describe('NewsAdminController', () => {
  it('is mounted under admin/news and requires ADMIN role', () => {
    const path = Reflect.getMetadata(PATH_METADATA, NewsAdminController) as string;
    expect(path).toBe('admin/news');

    const guards = Reflect.getMetadata(GUARDS_METADATA, NewsAdminController) as unknown[];
    expect(guards).toContain(RolesGuard);

    const roles = Reflect.getMetadata(ROLES_KEY, NewsAdminController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- news.controller.spec.ts`
Expected: FAIL with "Cannot find module './news.app.controller'" (files don't exist yet).

- [ ] **Step 3: Create `news.app.controller.ts`**

```typescript
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { NewsService } from './news.service';

@Controller('app/news')
export class NewsAppController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  findAll(@Query() query: ListNewsQueryDto) {
    return this.newsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.findOne(id);
  }
}
```

- [ ] **Step 4: Create `news.admin.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsService } from './news.service';

@Controller('admin/news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  create(@Body() dto: CreateNewsDto) {
    return this.newsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.remove(id);
  }
}
```

- [ ] **Step 5: Delete the old controller and update the module**

```bash
rm src/hr/news/news.controller.ts
```

Replace `src/hr/news/news.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { NewsAppController } from './news.app.controller';
import { NewsAdminController } from './news.admin.controller';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsAppController, NewsAdminController],
  providers: [NewsService],
})
export class NewsModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- news.controller.spec.ts`
Expected: PASS

- [ ] **Step 7: Run full unit suite to catch any stale reference to the deleted file**

Run: `pnpm test`
Expected: PASS, no "Cannot find module './news.controller'" errors.

- [ ] **Step 8: Commit**

```bash
git add src/hr/news/
git commit -m "refactor: split news routes into app/news (read) and admin/news (CRUD)"
```

---

### Task 6: Split `hr/dashboard` into `app/dashboard` + `admin/dashboard`

**Files:**
- Create: `src/hr/dashboard/dashboard.app.controller.ts`
- Create: `src/hr/dashboard/dashboard.admin.controller.ts`
- Delete: `src/hr/dashboard/dashboard.controller.ts`
- Modify: `src/hr/dashboard/dashboard.module.ts`

**Interfaces:**
- Consumes: `DashboardService` (unchanged, methods `admin()` and `member(userId: number)`).
- Produces: `DashboardAppController`, `DashboardAdminController`.

- [ ] **Step 1: Write the failing test**

Create `src/hr/dashboard/dashboard.controller.spec.ts`:

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { DashboardAppController } from './dashboard.app.controller';
import { DashboardAdminController } from './dashboard.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('DashboardAppController', () => {
  it('is mounted under app/dashboard with no class-level role guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, DashboardAppController) as string;
    expect(path).toBe('app/dashboard');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, DashboardAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(RolesGuard);
  });
});

describe('DashboardAdminController', () => {
  it('is mounted under admin/dashboard and requires ADMIN role', () => {
    const path = Reflect.getMetadata(PATH_METADATA, DashboardAdminController) as string;
    expect(path).toBe('admin/dashboard');

    const guards = Reflect.getMetadata(GUARDS_METADATA, DashboardAdminController) as unknown[];
    expect(guards).toContain(RolesGuard);

    const roles = Reflect.getMetadata(ROLES_KEY, DashboardAdminController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- dashboard.controller.spec.ts`
Expected: FAIL with "Cannot find module './dashboard.app.controller'".

- [ ] **Step 3: Create `dashboard.app.controller.ts`**

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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
}
```

- [ ] **Step 4: Create `dashboard.admin.controller.ts`**

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DashboardAdminController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  admin() {
    return this.dashboardService.admin();
  }
}
```

- [ ] **Step 5: Delete the old controller and update the module**

```bash
rm src/hr/dashboard/dashboard.controller.ts
```

Replace `src/hr/dashboard/dashboard.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module';
import { DashboardAppController } from './dashboard.app.controller';
import { DashboardAdminController } from './dashboard.admin.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [LeaveModule],
  controllers: [DashboardAppController, DashboardAdminController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- dashboard.controller.spec.ts`
Expected: PASS

- [ ] **Step 7: Run full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/hr/dashboard/
git commit -m "refactor: split dashboard routes into app/dashboard/member and admin/dashboard/admin"
```

---

### Task 7: Split `hr/leave` into `app/leave` + `admin/leave`

**Files:**
- Create: `src/hr/leave/leave.app.controller.ts`
- Create: `src/hr/leave/leave.admin.controller.ts`
- Delete: `src/hr/leave/leave.controller.ts`
- Modify: `src/hr/leave/leave.module.ts`

**Interfaces:**
- Consumes: `LeaveService` (unchanged: `create(userId, dto)`, `listMine(userId, query)`, `listApproval(user, query)`, `getBalance(userId, year)`, `findOne(id)`, `approve(id, user, note)`, `reject(id, user, note)`).
- Produces: `LeaveAppController`, `LeaveAdminController`.

- [ ] **Step 1: Write the failing test**

Create `src/hr/leave/leave.controller.spec.ts`:

```typescript
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('LeaveAppController', () => {
  it('is mounted under app/leave with no class-level role guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, LeaveAppController) as string;
    expect(path).toBe('app/leave');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, LeaveAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(RolesGuard);
  });
});

describe('LeaveAdminController', () => {
  it('is mounted under admin/leave and requires ADMIN role', () => {
    const path = Reflect.getMetadata(PATH_METADATA, LeaveAdminController) as string;
    expect(path).toBe('admin/leave');

    const guards = Reflect.getMetadata(GUARDS_METADATA, LeaveAdminController) as unknown[];
    expect(guards).toContain(RolesGuard);

    const roles = Reflect.getMetadata(ROLES_KEY, LeaveAdminController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- leave.controller.spec.ts`
Expected: FAIL with "Cannot find module './leave.app.controller'".

- [ ] **Step 3: Create `leave.app.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveQueryDto } from './dto/list-leave-query.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { LeaveService } from './leave.service';

@Controller('app/leave')
@UseGuards(JwtAuthGuard)
export class LeaveAppController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.create(user.sub, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: JwtPayload, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listMine(user.sub, query);
  }

  @Get('approval')
  listApproval(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListLeaveQueryDto,
  ) {
    return this.leaveService.listApproval(user, query);
  }

  @Get('balance')
  getBalance(
    @CurrentUser() user: JwtPayload,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.leaveService.getBalance(user.sub, query.year);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leaveService.findOne(id);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.approve(id, user, dto.note);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.reject(id, user, dto.note);
  }
}
```

- [ ] **Step 4: Create `leave.admin.controller.ts`**

```typescript
import { Body, Controller, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { LeaveService } from './leave.service';

@Controller('admin/leave')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class LeaveAdminController {
  constructor(private readonly leaveService: LeaveService) {}

  @Patch(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.approve(id, user, dto.note);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.reject(id, user, dto.note);
  }
}
```

- [ ] **Step 5: Delete the old controller and update the module**

```bash
rm src/hr/leave/leave.controller.ts
```

Replace `src/hr/leave/leave.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AttendanceModule],
  controllers: [LeaveAppController, LeaveAdminController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- leave.controller.spec.ts`
Expected: PASS

- [ ] **Step 7: Run full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/hr/leave/
git commit -m "refactor: split leave routes into app/leave (self-service + approve) and admin/leave (HR approve)"
```

---

### Task 8: Final verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS, all suites green.

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS — confirms the full `AppModule` graph (now including `DashboardModule` → `LeaveModule` → `AttendanceModule`, and `ApproversModule`) still boots cleanly with every controller's routes registered.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS, no TypeScript errors (catches any stale import left pointing at a deleted `*.controller.ts`).

- [ ] **Step 4: Manually confirm the route table** (optional sanity check, no assertion — just eyeball it)

Run: `pnpm start:dev` briefly and check the Nest startup log lines (`Mapped {path}, {method} route`) list `app/news`, `admin/news`, `app/leave`, `admin/leave`, `app/attendance`, `app/dashboard/member`, `admin/dashboard/admin`, `admin/approvers`, `admin/users` — then stop the process.

- [ ] **Step 5: Commit** (only if any fixups were needed in this task; otherwise skip — nothing to commit)
