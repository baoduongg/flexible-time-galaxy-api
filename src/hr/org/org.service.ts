import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(dto: CreateTeamDto) {
    await this.assertOrgRole(dto.leader_id, OrgRole.LEADER, 'Trưởng nhóm');
    await this.assertDepartmentExists(dto.department_id);

    return this.prisma.team.create({
      data: { name: dto.name, leaderId: dto.leader_id, departmentId: dto.department_id },
    });
  }

  listTeams() {
    return this.prisma.team.findMany({ orderBy: { id: 'asc' } });
  }

  async updateTeam(id: number, dto: UpdateTeamDto) {
    const existing = await this.prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy team');
    }
    if (dto.leader_id !== undefined) {
      await this.assertOrgRole(dto.leader_id, OrgRole.LEADER, 'Trưởng nhóm');
    }
    if (dto.department_id !== undefined) {
      await this.assertDepartmentExists(dto.department_id);
    }

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.leader_id !== undefined ? { leaderId: dto.leader_id } : {}),
        ...(dto.department_id !== undefined ? { departmentId: dto.department_id } : {}),
      },
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    await this.assertOrgRole(dto.manager_id, OrgRole.MANAGER, 'Trưởng phòng');

    return this.prisma.department.create({
      data: { name: dto.name, managerId: dto.manager_id },
    });
  }

  listDepartments() {
    return this.prisma.department.findMany({
      orderBy: { id: 'asc' },
      include: { teams: true },
    });
  }

  async updateDepartment(id: number, dto: UpdateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy phòng ban');
    }
    if (dto.manager_id !== undefined) {
      await this.assertOrgRole(dto.manager_id, OrgRole.MANAGER, 'Trưởng phòng');
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.manager_id !== undefined ? { managerId: dto.manager_id } : {}),
      },
    });
  }

  private async assertOrgRole(userId: number, expected: OrgRole, label: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException(`Không tìm thấy user id=${userId}`);
    }
    if (user.orgRole !== expected) {
      throw new BadRequestException(
        `User id=${userId} chưa có orgRole=${expected} (${label})`,
      );
    }
  }

  private async assertDepartmentExists(id: number) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) {
      throw new BadRequestException(`Không tìm thấy phòng ban id=${id}`);
    }
  }
}
