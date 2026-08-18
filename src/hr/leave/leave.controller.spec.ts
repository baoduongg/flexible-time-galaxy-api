import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('LeaveAppController', () => {
  it('is mounted under app/leave with no class-level role guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, LeaveAppController) as string;
    expect(path).toBe('app/leave');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, LeaveAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(RolesGuard);
    expect(guards).toContain(JwtAuthGuard);
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
