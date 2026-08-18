import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('LeaveAppController', () => {
  it('is mounted under app/leave with no admin guard', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      LeaveAppController,
    ) as string;
    expect(path).toBe('app/leave');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, LeaveAppController) as unknown[]) ??
      [];
    expect(guards).not.toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});

describe('LeaveAdminController', () => {
  it('is mounted under admin/leave and requires AdminGuard', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      LeaveAdminController,
    ) as string;
    expect(path).toBe('admin/leave');

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      LeaveAdminController,
    ) as unknown[];
    expect(guards).toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});
