import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { ApproversAdminController } from './approvers.admin.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('ApproversAdminController', () => {
  it('is mounted under admin/approvers', () => {
    const path = Reflect.getMetadata(PATH_METADATA, ApproversAdminController) as string;
    expect(path).toBe('admin/approvers');
  });

  it('requires ADMIN role', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ApproversAdminController) as unknown[];
    expect(guards).toContain(RolesGuard);

    const roles = Reflect.getMetadata(ROLES_KEY, ApproversAdminController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });
});
