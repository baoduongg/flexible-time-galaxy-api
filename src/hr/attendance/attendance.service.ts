import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveStatus, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAttendanceHistory, startOfToday } from './attendance-status.util';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkin(userId: number) {
    const today = startOfToday();

    // create() (not upsert) so the DB's unique(userId, date) constraint is the
    // single source of truth for "already checked in" — closes the race window
    // a separate read-then-write check would leave open under concurrent requests.
    try {
      const record = await this.prisma.attendance.create({
        data: { userId, date: today, checkinTime: new Date() },
      });

      return {
        checkin_time: record.checkinTime,
        checkout_time: record.checkoutTime,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Đã check-in hôm nay');
      }
      throw error;
    }
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

  // Writes an approved "giải trình" (attendance correction) request's
  // correction_time back onto the actual Attendance row, so the corrected
  // day resolves to a real checkin-derived status instead of staying "Ro".
  async applyCorrection(userId: number, date: Date, correctionTime: string) {
    const dateKey = date.toISOString().slice(0, 10);
    const correctedAt = new Date(`${dateKey}T${correctionTime}:00+07:00`);

    if (Number.isNaN(correctedAt.getTime())) {
      return;
    }

    await this.prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, checkinTime: correctedAt },
      update: { checkinTime: correctedAt },
    });
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

    const [attendances, approvedLeaves, feedbackRequests, holidays] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: { userId, date: { gte: monthStart, lte: monthEnd } },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            userId,
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
        this.prisma.publicHoliday.findMany({
          where: { date: { gte: monthStart, lte: monthEnd } },
        }),
      ]);

    const holidayDates = new Set(
      holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)),
    );

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
      holidayDates,
    });
  }
}
