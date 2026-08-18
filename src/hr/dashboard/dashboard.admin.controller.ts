import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DashboardAdminController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  admin() {
    return this.dashboardService.admin();
  }
}
