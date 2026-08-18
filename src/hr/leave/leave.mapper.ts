import { Prisma, User } from '@prisma/client';
import { LEAVE_INCLUDE, LEAVE_TYPE_LABELS } from './leave.constants';

type LeaveUser = Pick<User, 'username' | 'firstName' | 'lastName'>;
export type LeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{
  include: typeof LEAVE_INCLUDE;
}>;

export function displayName(user: LeaveUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toLeaveRequestResponse(leave: LeaveRequestWithRelations) {
  const durationDays = Number(leave.durationDays);
  const requesterName = displayName(leave.user);

  return {
    id: leave.id,
    user_id: leave.userId,
    requester_name: requesterName,
    avatar_initial: requesterName.charAt(0).toUpperCase(),
    leave_type: leave.leaveType,
    leave_type_label: LEAVE_TYPE_LABELS[leave.leaveType],
    start_date: formatDate(leave.startDate),
    end_date: formatDate(leave.endDate),
    duration_days: durationDays,
    duration_label: `${durationDays} ngày`,
    attendance_date: leave.attendanceDate
      ? formatDate(leave.attendanceDate)
      : null,
    correction_time: leave.correctionTime,
    status: leave.status,
    approval_steps: leave.approvalSteps.map((step) => ({
      level: step.level,
      approver_id: step.approverId,
      approver_name: step.approver ? displayName(step.approver) : null,
      status: step.status,
      note: step.note,
      decided_at: step.decidedAt ? step.decidedAt.toISOString() : null,
    })),
    reason: leave.reason,
    decided_at: leave.decidedAt ? leave.decidedAt.toISOString() : null,
    decided_by: leave.decidedBy ? displayName(leave.decidedBy) : null,
    decision_note: leave.decisionNote,
    created_at: leave.createdAt.toISOString(),
    updated_at: leave.updatedAt.toISOString(),
  };
}
