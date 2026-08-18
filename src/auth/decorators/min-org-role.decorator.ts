import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const MIN_ORG_ROLE_KEY = 'minOrgRole';
export const MinOrgRole = (role: OrgRole) => SetMetadata(MIN_ORG_ROLE_KEY, role);
