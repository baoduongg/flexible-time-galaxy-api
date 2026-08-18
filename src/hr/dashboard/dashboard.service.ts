import { Injectable } from '@nestjs/common';
import { LeaveStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfToday } from '../attendance/attendance-status.util';
import { LEAVE_INCLUDE, LEAVE_TYPE_LABELS } from '../leave/leave.constants';
import { displayName, toLeaveRequestResponse } from '../leave/leave.mapper';
import { LeaveService } from '../leave/leave.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveService: LeaveService,
  ) {}

  async admin() {
    const today = startOfToday();

    const [
      totalEmployees,
      totalAdmins,
      totalMembers,
      presentToday,
      pendingApprovals,
      onLeaveToday,
      pendingLeaveRequests,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.user.count({ where: { role: Role.MEMBER } }),
      this.prisma.attendance.count({
        where: { date: today, checkinTime: { not: null } },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.pending },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: LeaveStatus.approved,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.pending },
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const absentApprovedCount = onLeaveToday.length;
    const absentUnapprovedCount = await this.countUnapprovedAbsences(
      today,
      onLeaveToday.map((leave) => leave.userId),
    );

    return {
      team_statistics: {
        total_employees: totalEmployees,
        total_admins: totalAdmins,
        total_members: totalMembers,
        present: presentToday,
        absent: {
          total: absentApprovedCount + absentUnapprovedCount,
          approved: absentApprovedCount,
          unapproved: absentUnapprovedCount,
        },
        pending_approvals: pendingApprovals,
      },
      pending_leave_requests: pendingLeaveRequests.map(toLeaveRequestResponse),
      absent_today: onLeaveToday.map((leave) => ({
        id: leave.user.id,
        name: displayName(leave.user),
        role_label:
          leave.user.role === Role.ADMIN ? 'Quản trị viên' : 'Nhân viên',
        leave_type_label: LEAVE_TYPE_LABELS[leave.leaveType],
        avatar_initial: displayName(leave.user).charAt(0).toUpperCase(),
      })),
    };
  }

  async member(userId: number) {
    const [balance, recentRequests] = await Promise.all([
      this.leaveService.getBalance(userId),
      this.prisma.leaveRequest.findMany({
        where: { userId },
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    return {
      leave_balance: { total: balance.total, used: balance.used, remaining: balance.remaining },
      recent_requests: recentRequests.map(toLeaveRequestResponse),
    };
  }

  // ponytail: approximate — doesn't exclude weekends/holidays from "unapproved absent" count.
  // Good enough for the dashboard tile; revisit once a holiday calendar exists (see plan Open Questions).
  private async countUnapprovedAbsences(
    today: Date,
    onLeaveUserIds: number[],
  ): Promise<number> {
    const [checkedIn, totalEmployees] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: today, checkinTime: { not: null } },
        select: { userId: true },
      }),
      this.prisma.user.count(),
    ]);

    const accountedFor = new Set([
      ...checkedIn.map((a) => a.userId),
      ...onLeaveUserIds,
    ]);
    return Math.max(0, totalEmployees - accountedFor.size);
  }
}
