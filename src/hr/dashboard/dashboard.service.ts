import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfToday } from '../attendance/attendance-status.util';
import { LEAVE_INCLUDE, LEAVE_TYPE_LABELS } from '../leave/leave.constants';
import { displayName, toLeaveRequestResponse } from '../leave/leave.mapper';
import { LeaveService } from '../leave/leave.service';

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  [OrgRole.MEMBER]: 'Nhân viên',
  [OrgRole.LEADER]: 'Trưởng nhóm',
  [OrgRole.MANAGER]: 'Trưởng phòng',
  [OrgRole.DIRECTOR]: 'Giám đốc',
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveService: LeaveService,
  ) {}

  admin() {
    return this.buildStatistics({});
  }

  async leader(userId: number) {
    const team = await this.prisma.team.findUnique({ where: { leaderId: userId } });
    if (!team) {
      throw new NotFoundException('Bạn chưa được gán làm Trưởng nhóm của team nào');
    }
    return this.buildStatistics({ teamId: team.id });
  }

  async manager(userId: number) {
    const department = await this.prisma.department.findUnique({ where: { managerId: userId } });
    if (!department) {
      throw new NotFoundException('Bạn chưa được gán làm Trưởng phòng của phòng ban nào');
    }
    return this.buildStatistics({ team: { departmentId: department.id } });
  }

  private async buildStatistics(userWhere: Prisma.UserWhereInput) {
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
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({ where: { ...userWhere, isAdmin: true } }),
      this.prisma.user.count({ where: { ...userWhere, isAdmin: false } }),
      this.prisma.attendance.count({
        where: { date: today, checkinTime: { not: null }, user: userWhere },
      }),
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.pending, user: userWhere },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: LeaveStatus.approved,
          startDate: { lte: today },
          endDate: { gte: today },
          user: userWhere,
        },
        include: {
          user: {
            select: { id: true, username: true, firstName: true, lastName: true, isAdmin: true, orgRole: true },
          },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.pending, user: userWhere },
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const absentApprovedCount = onLeaveToday.length;
    const absentUnapprovedCount = await this.countUnapprovedAbsences(
      today,
      onLeaveToday.map((leave) => leave.userId),
      userWhere,
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
        role_label: leave.user.isAdmin ? 'Quản trị viên' : ORG_ROLE_LABELS[leave.user.orgRole],
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
  // Good enough for the dashboard tile; revisit once a holiday calendar exists.
  private async countUnapprovedAbsences(
    today: Date,
    onLeaveUserIds: number[],
    userWhere: Prisma.UserWhereInput,
  ): Promise<number> {
    const [checkedIn, totalEmployees] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: today, checkinTime: { not: null }, user: userWhere },
        select: { userId: true },
      }),
      this.prisma.user.count({ where: userWhere }),
    ]);

    const accountedFor = new Set([
      ...checkedIn.map((a) => a.userId),
      ...onLeaveUserIds,
    ]);
    return Math.max(0, totalEmployees - accountedFor.size);
  }
}
