import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  function contextWithUser(user: { isAdmin: boolean }): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows when isAdmin is true', () => {
    expect(guard.canActivate(contextWithUser({ isAdmin: true }))).toBe(true);
  });

  it('denies when isAdmin is false', () => {
    expect(guard.canActivate(contextWithUser({ isAdmin: false }))).toBe(false);
  });
});
