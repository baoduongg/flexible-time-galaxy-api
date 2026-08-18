import { Module } from '@nestjs/common';
import { OrgAdminController } from './org.admin.controller';
import { OrgService } from './org.service';

@Module({
  controllers: [OrgAdminController],
  providers: [OrgService],
})
export class OrgModule {}
