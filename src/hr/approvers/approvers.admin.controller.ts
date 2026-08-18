import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApproversService } from './approvers.service';

@Controller('admin/approvers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ApproversAdminController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
