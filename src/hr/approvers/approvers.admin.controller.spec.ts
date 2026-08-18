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
