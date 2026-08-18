import { BadRequestException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export type OrgContext = {
  id: number;
  orgRole: OrgRole;
  leaderId: number | null;
  managerId: number | null;
  directorId: number | null;
};

export type ChainStep = { level: OrgRole; approverId: number | null };

export function resolveApprovalChain(
  context: OrgContext,
  durationDays: number,
): ChainStep[] {
  if (context.orgRole === OrgRole.DIRECTOR) {
    return [{ level: OrgRole.DIRECTOR, approverId: null }];
  }

  if (context.orgRole === OrgRole.MANAGER) {
    return [{ level: OrgRole.DIRECTOR, approverId: requireDirector(context) }];
  }

  if (context.orgRole === OrgRole.LEADER) {
    const steps: ChainStep[] = [{ level: OrgRole.MANAGER, approverId: requireManager(context) }];
    if (durationDays > 5) {
      steps.push({ level: OrgRole.DIRECTOR, approverId: requireDirector(context) });
    }
    return steps;
  }

  // MEMBER
  const steps: ChainStep[] = [{ level: OrgRole.LEADER, approverId: requireLeader(context) }];
  if (durationDays > 2) {
    steps.push({ level: OrgRole.MANAGER, approverId: requireManager(context) });
  }
  if (durationDays > 5) {
    steps.push({ level: OrgRole.DIRECTOR, approverId: requireDirector(context) });
  }
  return steps;
}

function requireLeader(context: OrgContext): number {
  if (context.leaderId === null) {
    throw new BadRequestException('Bạn chưa được gán vào team nào, không thể tạo đơn');
  }
  return context.leaderId;
}

function requireManager(context: OrgContext): number {
  if (context.managerId === null) {
    throw new BadRequestException('Team/phòng ban của bạn chưa được gán Trưởng phòng');
  }
  return context.managerId;
}

function requireDirector(context: OrgContext): number {
  if (context.directorId === null) {
    throw new BadRequestException('Công ty chưa có Director nào trong hệ thống');
  }
  return context.directorId;
}
