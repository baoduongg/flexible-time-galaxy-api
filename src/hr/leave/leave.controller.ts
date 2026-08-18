import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveQueryDto } from './dto/list-leave-query.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { LeaveService } from './leave.service';

@Controller('hr/leave')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.create(user.sub, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: JwtPayload, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listMine(user.sub, query);
  }

  @Get('approval')
  listApproval(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListLeaveQueryDto,
  ) {
    return this.leaveService.listApproval(user, query);
  }

  @Get('balance')
  getBalance(
    @CurrentUser() user: JwtPayload,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.leaveService.getBalance(user.sub, query.year);
  }
}
