import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { MIN_ORG_ROLE_KEY } from '../decorators/min-org-role.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  [OrgRole.MEMBER]: 0,
  [OrgRole.LEADER]: 1,
  [OrgRole.MANAGER]: 2,
  [OrgRole.DIRECTOR]: 3,
};

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<OrgRole>(MIN_ORG_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!minRole) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    return (
      user.isAdmin === true || ORG_ROLE_RANK[user.orgRole] >= ORG_ROLE_RANK[minRole]
    );
  }
}
