import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { OrgService } from './org.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('admin/org')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OrgAdminController {
  constructor(private readonly orgService: OrgService) {}

  @Post('teams')
  createTeam(@Body() dto: CreateTeamDto) {
    return this.orgService.createTeam(dto);
  }

  @Get('teams')
  listTeams() {
    return this.orgService.listTeams();
  }

  @Patch('teams/:id')
  updateTeam(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.orgService.updateTeam(id, dto);
  }

  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.orgService.createDepartment(dto);
  }

  @Get('departments')
  listDepartments() {
    return this.orgService.listDepartments();
  }

  @Patch('departments/:id')
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.orgService.updateDepartment(id, dto);
  }
}
