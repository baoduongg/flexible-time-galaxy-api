import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { DashboardService } from './dashboard.service';

@Controller('app/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardAppController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('member')
  member(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.member(user.sub);
  }
}
