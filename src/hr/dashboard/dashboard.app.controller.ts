import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../../auth/guards/org-role.guard';
import { MinOrgRole } from '../../auth/decorators/min-org-role.decorator';
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

  @Get('leader')
  @UseGuards(OrgRoleGuard)
  @MinOrgRole(OrgRole.LEADER)
  leader(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.leader(user.sub);
  }

  @Get('manager')
  @UseGuards(OrgRoleGuard)
  @MinOrgRole(OrgRole.MANAGER)
  manager(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.manager(user.sub);
  }
}
