import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    team: { findUnique: jest.fn() },
    department: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  describe('remove', () => {
    it('throws BadRequestException when the user leads a team, without calling delete', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.team.findUnique.mockResolvedValue({ name: 'Backend' });
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user manages a department, without calling delete', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.team.findUnique.mockResolvedValue(null);
      prisma.department.findUnique.mockResolvedValue({ name: 'Engineering' });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes normally when the user leads no team and manages no department', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.team.findUnique.mockResolvedValue(null);
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.user.delete.mockResolvedValue({ id: 1 });

      const result = await service.remove(1);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ id: 1 });
    });
  });
});
