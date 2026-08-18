import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { NewsAppController } from './news.app.controller';
import { NewsAdminController } from './news.admin.controller';
import { AdminGuard } from '../../auth/guards/admin.guard';

describe('NewsAppController', () => {
  it('is mounted under app/news with no admin guard', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      NewsAppController,
    ) as string;
    expect(path).toBe('app/news');

    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, NewsAppController) as unknown[]) ??
      [];
    expect(guards).not.toContain(AdminGuard);
  });
});

describe('NewsAdminController', () => {
  it('is mounted under admin/news and requires AdminGuard', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      NewsAdminController,
    ) as string;
    expect(path).toBe('admin/news');

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NewsAdminController,
    ) as unknown[];
    expect(guards).toContain(AdminGuard);
  });
});
