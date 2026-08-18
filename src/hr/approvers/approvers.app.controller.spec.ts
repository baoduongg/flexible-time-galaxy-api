import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ApproversAppController } from './approvers.app.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('ApproversAppController', () => {
  it('is mounted under app/approvers', () => {
    const path = Reflect.getMetadata(PATH_METADATA, ApproversAppController) as string;
    expect(path).toBe('app/approvers');
  });

  it('requires an authenticated user (no role restriction)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ApproversAppController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).not.toContain(AdminGuard);
  });
});
