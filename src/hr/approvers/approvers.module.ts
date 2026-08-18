import { Module } from '@nestjs/common';
import { ApproversController } from './approvers.controller';
import { ApproversService } from './approvers.service';

@Module({
  controllers: [ApproversController],
  providers: [ApproversService],
})
export class ApproversModule {}
