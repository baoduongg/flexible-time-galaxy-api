import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DashboardAppController } from './dashboard.app.controller';
import { DashboardAdminController } from './dashboard.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('DashboardAppController', () => {
  it('is mounted under app/dashboard with no admin guard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, DashboardAppController) as string;
    expect(path).toBe('app/dashboard');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, DashboardAppController) as unknown[]) ?? [];
    expect(guards).not.toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});

describe('DashboardAdminController', () => {
  it('is mounted under admin/dashboard and requires AdminGuard', () => {
    const path = Reflect.getMetadata(PATH_METADATA, DashboardAdminController) as string;
    expect(path).toBe('admin/dashboard');

    const guards = Reflect.getMetadata(GUARDS_METADATA, DashboardAdminController) as unknown[];
    expect(guards).toContain(AdminGuard);
    expect(guards).toContain(JwtAuthGuard);
  });
});
