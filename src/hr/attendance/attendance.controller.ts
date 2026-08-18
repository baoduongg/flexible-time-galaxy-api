import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttendanceService } from './attendance.service';
import { AttendanceHistoryQueryDto } from './dto/attendance-history-query.dto';

@Controller('hr/attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  checkin(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.checkin(user.sub);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.checkout(user.sub);
  }

  @Get('today')
  today(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.today(user.sub);
  }

  @Get('history')
  history(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceHistoryQueryDto,
  ) {
    return this.attendanceService.getHistory(user.sub, query.year, query.month);
  }
}
