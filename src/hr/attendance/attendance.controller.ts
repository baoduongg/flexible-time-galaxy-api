import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttendanceService } from './attendance.service';

@Controller('hr/attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('checkin')
  checkin(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.checkin(user.sub);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.checkout(user.sub);
  }

  @Get('today')
  today(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.today(user.sub);
  }
}
