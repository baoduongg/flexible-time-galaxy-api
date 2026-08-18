import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgService } from './org.service';

describe('OrgService', () => {
  let service: OrgService;
  const prisma = {
    user: { findUnique: jest.fn() },
    team: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    department: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [OrgService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(OrgService);
  });

  describe('createTeam', () => {
    it('rejects when leader_id user does not have orgRole=LEADER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        orgRole: OrgRole.MEMBER,
      });

      await expect(
        service.createTeam({ name: 'Team A', leader_id: 5, department_id: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects when department_id does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        orgRole: OrgRole.LEADER,
      });
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.createTeam({ name: 'Team A', leader_id: 5, department_id: 99 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('creates the team when leader and department are valid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        orgRole: OrgRole.LEADER,
      });
      prisma.department.findUnique.mockResolvedValue({ id: 1 });
      prisma.team.create.mockResolvedValue({
        id: 1,
        name: 'Team A',
        leaderId: 5,
        departmentId: 1,
      });

      const result = await service.createTeam({
        name: 'Team A',
        leader_id: 5,
        department_id: 1,
      });

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: { name: 'Team A', leaderId: 5, departmentId: 1 },
      });
      expect(result).toEqual({
        id: 1,
        name: 'Team A',
        leaderId: 5,
        departmentId: 1,
      });
    });
  });

  describe('createDepartment', () => {
    it('rejects when manager_id user does not have orgRole=MANAGER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 9,
        orgRole: OrgRole.LEADER,
      });

      await expect(
        service.createDepartment({ name: 'Dept A', manager_id: 9 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.department.create).not.toHaveBeenCalled();
    });

    it('creates the department when manager is valid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 9,
        orgRole: OrgRole.MANAGER,
      });
      prisma.department.create.mockResolvedValue({
        id: 1,
        name: 'Dept A',
        managerId: 9,
      });

      const result = await service.createDepartment({
        name: 'Dept A',
        manager_id: 9,
      });

      expect(prisma.department.create).toHaveBeenCalledWith({
        data: { name: 'Dept A', managerId: 9 },
      });
      expect(result).toEqual({ id: 1, name: 'Dept A', managerId: 9 });
    });
  });

  describe('updateTeam', () => {
    it('throws NotFoundException when the team does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeam(404, { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
