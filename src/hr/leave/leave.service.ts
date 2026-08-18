import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveStatus, LeaveType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginationMeta,
  paginationSkip,
} from '../../common/utils/paginate.util';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { LEAVE_INCLUDE } from './leave.constants';
import { toLeaveRequestResponse } from './leave.mapper';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveQueryDto } from './dto/list-leave-query.dto';

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateLeaveRequestDto) {
    const approver = await this.prisma.user.findUnique({
      where: { id: dto.approver_id },
    });

    if (!approver || !approver.isApprover) {
      throw new BadRequestException('Người duyệt không hợp lệ');
    }

    const durationDays = this.calculateDurationDays(
      dto.start_date,
      dto.end_date,
    );

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
        approverId: dto.approver_id,
        reason: dto.reason,
      },
      include: LEAVE_INCLUDE,
    });

    return toLeaveRequestResponse(created);
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
    const scope = user.role === Role.ADMIN ? {} : { approverId: user.sub };
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

    const total = balance ? Number(balance.totalDays) : 0;
    const used = Number(usedAgg._sum.durationDays ?? 0);

    return {
      year: targetYear,
      total,
      used,
      remaining: Number((total - used).toFixed(2)),
    };
  }

  // ponytail: weekday count only, no public-holiday calendar yet — see plan's Open Questions.
  private calculateDurationDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let days = 0;

    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days += 1;
      }
    }

    return days;
  }
}
