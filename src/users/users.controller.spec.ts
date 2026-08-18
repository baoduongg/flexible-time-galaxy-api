import { PATH_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('is mounted under admin/users', () => {
    const path = Reflect.getMetadata(PATH_METADATA, UsersController) as string;
    expect(path).toBe('admin/users');
  });
});
