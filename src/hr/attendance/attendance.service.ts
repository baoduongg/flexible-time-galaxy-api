import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAttendanceHistory, startOfToday } from './attendance-status.util';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkin(userId: number) {
    const today = startOfToday();
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    if (existing?.checkinTime) {
      throw new BadRequestException('Đã check-in hôm nay');
    }

    const record = await this.prisma.attendance.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, checkinTime: new Date() },
      update: { checkinTime: new Date() },
    });

    return {
      checkin_time: record.checkinTime,
      checkout_time: record.checkoutTime,
    };
  }

  async checkout(userId: number) {
    const today = startOfToday();
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    if (!existing?.checkinTime) {
      throw new BadRequestException('Chưa check-in hôm nay');
    }
    if (existing.checkoutTime) {
      throw new BadRequestException('Đã check-out hôm nay');
    }

    const record = await this.prisma.attendance.update({
      where: { userId_date: { userId, date: today } },
      data: { checkoutTime: new Date() },
    });

    return {
      checkin_time: record.checkinTime,
      checkout_time: record.checkoutTime,
    };
  }

  async today(userId: number) {
    const today = startOfToday();
    const record = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    return {
      checkin_time: record?.checkinTime ?? null,
      checkout_time: record?.checkoutTime ?? null,
    };
  }

  async getHistory(userId: number, year: number, month: number) {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    const [attendances, approvedLeaves, feedbackRequests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { userId, date: { gte: monthStart, lte: monthEnd } },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          userId,
          leaveType: LeaveType.annual,
          status: LeaveStatus.approved,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          userId,
          leaveType: LeaveType.feedback,
          attendanceDate: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);

    const approvedLeaveDates = new Set<string>();
    for (const leave of approvedLeaves) {
      for (
        const cursor = new Date(
          Math.max(leave.startDate.getTime(), monthStart.getTime()),
        );
        cursor <= leave.endDate && cursor <= monthEnd;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        approvedLeaveDates.add(cursor.toISOString().slice(0, 10));
      }
    }

    const feedbackByDate = new Map<string, number>();
    for (const feedback of feedbackRequests) {
      if (feedback.attendanceDate) {
        feedbackByDate.set(
          feedback.attendanceDate.toISOString().slice(0, 10),
          feedback.id,
        );
      }
    }

    return buildAttendanceHistory({
      year,
      month,
      attendances,
      approvedLeaveDates,
      feedbackByDate,
    });
  }
}
