import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApproversService } from './approvers.service';

@Controller('hr/approvers')
@UseGuards(JwtAuthGuard)
export class ApproversController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
