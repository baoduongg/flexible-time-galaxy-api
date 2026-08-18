import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfToday } from './attendance-status.util';

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

    return { checkin_time: record.checkinTime, checkout_time: record.checkoutTime };
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

    return { checkin_time: record.checkinTime, checkout_time: record.checkoutTime };
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
}
