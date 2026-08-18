import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LEAVE_INCLUDE } from './leave.constants';
import { toLeaveRequestResponse } from './leave.mapper';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

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
