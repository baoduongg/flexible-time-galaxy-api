import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveAppController } from './leave.app.controller';
import { LeaveAdminController } from './leave.admin.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AttendanceModule],
  controllers: [LeaveAppController, LeaveAdminController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
