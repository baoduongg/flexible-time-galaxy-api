import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ApproversService } from './approvers.service';

@Controller('admin/approvers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ApproversAdminController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
