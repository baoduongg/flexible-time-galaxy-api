import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApproversService } from './approvers.service';

@Controller('app/approvers')
@UseGuards(JwtAuthGuard)
export class ApproversAppController {
  constructor(private readonly approversService: ApproversService) {}

  @Get()
  findAll() {
    return this.approversService.findAll();
  }
}
