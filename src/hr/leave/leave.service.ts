import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveStatus, LeaveType, OrgRole, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginationMeta,
  paginationSkip,
} from '../../common/utils/paginate.util';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttendanceService } from '../attendance/attendance.service';
import { LEAVE_INCLUDE } from './leave.constants';
import { toLeaveRequestResponse } from './leave.mapper';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveQueryDto } from './dto/list-leave-query.dto';
import { AdminListLeaveQueryDto } from './dto/admin-list-leave-query.dto';
import { resolveApprovalChain, type OrgContext } from './leave-chain.util';

// ponytail: mirrors LeaveBalance.totalDays @default(12), used until real balances are seeded per user
const DEFAULT_ANNUAL_DAYS = 12;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async create(userId: number, dto: CreateLeaveRequestDto) {
    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );
    const context = await this.buildOrgContext(userId);
    const chain = resolveApprovalChain(context, durationDays);

    const created = await this.prisma.leaveRequest.create({
      data: {
        userId,
        leaveType: dto.leave_type,
        startDate: new Date(dto.start_date),
        endDate: new Date(dto.end_date),
        durationDays,
        attendanceDate: dto.attendance_date
          ? new Date(dto.attendance_date)
          : null,
        correctionTime: dto.correction_time ?? null,
        status: LeaveStatus.pending,
        reason: dto.reason,
        approvalSteps: {
          create: chain.map((step, index) => ({
            level: step.level,
            order: index,
            approverId: step.approverId,
          })),
        },
      },
      include: LEAVE_INCLUDE,
    });

    return toLeaveRequestResponse(created);
  }

  private async buildOrgContext(userId: number): Promise<OrgContext> {
    const [requester, director] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          orgRole: true,
          team: {
            select: {
              leaderId: true,
              department: { select: { managerId: true } },
            },
          },
          ledTeam: {
            select: { department: { select: { managerId: true } } },
          },
        },
      }),
      this.prisma.user.findFirst({
        where: { orgRole: OrgRole.DIRECTOR },
        orderBy: { id: 'asc' },
        select: { id: true },
      }),
    ]);

    if (!requester) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      id: requester.id,
      orgRole: requester.orgRole,
      leaderId: requester.team?.leaderId ?? null,
      managerId:
        requester.team?.department.managerId ??
        requester.ledTeam?.department.managerId ??
        null,
      directorId: director?.id ?? null,
    };
  }

  async listMine(userId: number, query: ListLeaveQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const where = { userId, ...(query.status ? { status: query.status } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items: items.map(toLeaveRequestResponse),
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }

  async listApproval(user: JwtPayload, query: ListLeaveQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const scope = user.isAdmin ? {} : { approverId: user.sub };
    const where = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total, pendingCount] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.count({
        where: { ...scope, status: LeaveStatus.pending },
      }),
    ]);

    return {
      items: items.map(toLeaveRequestResponse),
      pending_count: pendingCount,
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }

  async listAllAdmin(query: AdminListLeaveQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? query.limit ?? 20;

    const where: Prisma.LeaveRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.leave_type ? { leaveType: query.leave_type } : {}),
      ...(query.user_id ? { userId: query.user_id } : {}),
      ...(query.approver_id ? { approverId: query.approver_id } : {}),
      ...(query.start_date
        ? { startDate: { gte: new Date(query.start_date) } }
        : {}),
      ...(query.end_date
        ? { endDate: { lte: new Date(query.end_date) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                user: {
                  firstName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  lastName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  username: { contains: query.search, mode: 'insensitive' },
                },
              },
              { reason: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      items: items.map(toLeaveRequestResponse),
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }

  async getBalance(userId: number, year?: number) {
    const targetYear = year ?? new Date().getFullYear();

    const [balance, usedAgg] = await Promise.all([
      this.prisma.leaveBalance.findUnique({
        where: { userId_year: { userId, year: targetYear } },
      }),
      this.prisma.leaveRequest.aggregate({
        where: {
          userId,
          leaveType: LeaveType.annual,
          status: LeaveStatus.approved,
          startDate: {
            gte: new Date(Date.UTC(targetYear, 0, 1)),
            lte: new Date(Date.UTC(targetYear, 11, 31)),
          },
        },
        _sum: { durationDays: true },
      }),
    ]);

    const total = balance ? Number(balance.totalDays) : DEFAULT_ANNUAL_DAYS;
    const used = Number(usedAgg._sum.durationDays ?? 0);

    return {
      year: targetYear,
      total,
      used,
      remaining: Math.max(0, Number((total - used).toFixed(2))),
    };
  }

  async findOne(id: number) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });

    if (!leave) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }

    return toLeaveRequestResponse(leave);
  }

  async approve(id: number, actor: JwtPayload, note?: string) {
    return this.decide(id, actor, LeaveStatus.approved, note);
  }

  async reject(id: number, actor: JwtPayload, note?: string) {
    if (!note) {
      throw new BadRequestException('note bắt buộc khi từ chối đơn');
    }
    return this.decide(id, actor, LeaveStatus.rejected, note);
  }

  private async decide(
    id: number,
    actor: JwtPayload,
    status: typeof LeaveStatus.approved | typeof LeaveStatus.rejected,
    note?: string,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });

    if (!leave) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }
    if (leave.status !== LeaveStatus.pending) {
      throw new BadRequestException('Đơn đã được xử lý');
    }
    if (leave.approverId !== actor.sub && !actor.isAdmin) {
      throw new ForbiddenException('Không có quyền duyệt đơn này');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        decidedAt: new Date(),
        decidedById: actor.sub,
        decisionNote: note ?? null,
      },
      include: LEAVE_INCLUDE,
    });

    if (
      status === LeaveStatus.approved &&
      leave.leaveType === LeaveType.feedback &&
      leave.attendanceDate &&
      leave.correctionTime
    ) {
      await this.attendanceService.applyCorrection(
        leave.userId,
        leave.attendanceDate,
        leave.correctionTime,
      );
    }

    return toLeaveRequestResponse(updated);
  }

  // ponytail: weekday count only, no public-holiday calendar yet — see plan's Open Questions.
  private calculateDurationDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let days = 0;

    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const dayOfWeek = cursor.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days += 1;
      }
    }

    return days;
  }
}
