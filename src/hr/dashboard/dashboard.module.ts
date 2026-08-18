import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module';
import { DashboardAppController } from './dashboard.app.controller';
import { DashboardAdminController } from './dashboard.admin.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [LeaveModule],
  controllers: [DashboardAppController, DashboardAdminController],
  providers: [DashboardService],
})
export class DashboardModule {}
