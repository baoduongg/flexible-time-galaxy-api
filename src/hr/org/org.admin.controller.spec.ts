import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { OrgAdminController } from './org.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('OrgAdminController', () => {
  it('is mounted under admin/org and requires AdminGuard', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      OrgAdminController,
    ) as string;
    expect(path).toBe('admin/org');

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrgAdminController,
    ) as unknown[];
    expect(guards).toContain(AdminGuard);
  });
});
