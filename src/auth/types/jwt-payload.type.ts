import { OrgRole } from '@prisma/client';

export type JwtPayload = {
  sub: number;
  username: string;
  isAdmin: boolean;
  orgRole: OrgRole;
};
