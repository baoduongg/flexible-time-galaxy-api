import { LeaveType } from '@prisma/client';
import { Prisma } from '@prisma/client';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Nghỉ phép có lương',
  unpaid: 'Không lương',
  maternity: 'Thai sản',
  feedback: 'Giải trình công',
};

export const LEAVE_INCLUDE = {
  user: {
    select: { id: true, username: true, firstName: true, lastName: true },
  },
  decidedBy: {
    select: { id: true, username: true, firstName: true, lastName: true },
  },
  approvalSteps: {
    orderBy: { order: 'asc' },
    include: {
      approver: {
        select: { id: true, username: true, firstName: true, lastName: true },
      },
    },
  },
} satisfies Prisma.LeaveRequestInclude;
