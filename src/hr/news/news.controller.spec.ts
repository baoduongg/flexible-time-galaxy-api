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
