import { Module } from '@nestjs/common';
import { ApproversAdminController } from './approvers.admin.controller';
import { ApproversAppController } from './approvers.app.controller';
import { ApproversService } from './approvers.service';

@Module({
  controllers: [ApproversAdminController, ApproversAppController],
  providers: [ApproversService],
})
export class ApproversModule {}
