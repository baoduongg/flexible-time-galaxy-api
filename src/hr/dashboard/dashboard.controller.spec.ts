import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { DashboardAppController } from './dashboard.app.controller';
import { DashboardAdminController } from './dashboard.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('DashboardAppController', () => {
  it('is mounted under app/dashboard with no class-level role guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, DashboardAppController) as string;
    expect(path).toBe('app/dashboard');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, DashboardAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(RolesGuard);
    expect(guards).toContain(JwtAuthGuard);
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
