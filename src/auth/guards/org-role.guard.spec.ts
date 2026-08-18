import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { OrgRoleGuard } from './org-role.guard';
import { MIN_ORG_ROLE_KEY } from '../decorators/min-org-role.decorator';

describe('OrgRoleGuard', () => {
  function contextWithUser(user: { isAdmin: boolean; orgRole: OrgRole }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function guardWithMinRole(minRole: OrgRole | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(minRole),
    } as unknown as Reflector;
    return new OrgRoleGuard(reflector);
  }

  it('allows any authenticated user when no @MinOrgRole is set', () => {
    const guard = guardWithMinRole(undefined);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies a MEMBER when the route requires at least LEADER', () => {
    const guard = guardWithMinRole(OrgRole.LEADER);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows a MANAGER on a route that requires at least LEADER', () => {
    const guard = guardWithMinRole(OrgRole.LEADER);
    const ctx = contextWithUser({ isAdmin: false, orgRole: OrgRole.MANAGER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('always allows isAdmin regardless of orgRole', () => {
    const guard = guardWithMinRole(OrgRole.DIRECTOR);
    const ctx = contextWithUser({ isAdmin: true, orgRole: OrgRole.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
