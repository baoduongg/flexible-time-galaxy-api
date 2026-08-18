import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [LeaveModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
