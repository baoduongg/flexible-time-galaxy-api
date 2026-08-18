import { Role } from '@prisma/client';

export type JwtPayload = {
  sub: number;
  username: string;
  role: Role;
};
