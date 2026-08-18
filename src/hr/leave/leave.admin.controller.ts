import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { AdminListLeaveQueryDto } from './dto/admin-list-leave-query.dto';
import { LeaveService } from './leave.service';

@Controller('admin/leave')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LeaveAdminController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  findAll(@Query() query: AdminListLeaveQueryDto) {
    return this.leaveService.listAllAdmin(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leaveService.findOne(id);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.approve(id, user, dto.note);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.reject(id, user, dto.note);
  }
}
