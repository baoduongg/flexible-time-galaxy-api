import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LeaveType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  const prisma = {
    user: { findUnique: jest.fn() },
    leaveRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    leaveBalance: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [LeaveService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LeaveService);
  });

  describe('create', () => {
    it('rejects when approver_id is not a valid approver', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7, isApprover: false });

      await expect(
        service.create(1, {
          leave_type: LeaveType.annual,
          approver_id: 7,
          start_date: '2026-08-17',
          end_date: '2026-08-17',
          reason: 'test',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('computes duration_days as weekday count and persists via Prisma', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7, isApprover: true });
      prisma.leaveRequest.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          ...data,
          user: { username: 'member', firstName: null, lastName: null },
          approver: { username: 'admin', firstName: null, lastName: null },
          decidedBy: null,
          createdAt: new Date('2026-08-18T00:00:00Z'),
          updatedAt: new Date('2026-08-18T00:00:00Z'),
        }),
      );

      // Mon 2026-08-17 .. Fri 2026-08-21 = 5 weekdays
      const result = await service.create(1, {
        leave_type: LeaveType.annual,
        approver_id: 7,
        start_date: '2026-08-17',
        end_date: '2026-08-21',
        reason: 'test',
      });

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationDays: 5 }),
        }),
      );
      expect(result.duration_days).toBe(5);
      expect(result.status).toBe('pending');
    });
  });

  describe('listMine', () => {
    it('paginates and scopes to the current user', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      const result = await service.listMine(1, { page: 2, page_size: 10 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 }, skip: 10, take: 10 }),
      );
      expect(result.meta).toEqual({ total: 0, page: 2, page_size: 10 });
    });
  });

  describe('listApproval', () => {
    it('scopes non-admins to their own approverId and returns pending_count', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3);

      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };
      const result = await service.listApproval(approver, {
        page: 1,
        page_size: 20,
      });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { approverId: 7 } }),
      );
      expect(result.pending_count).toBe(3);
    });

    it('lets admins see every approver scope', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      const admin: JwtPayload = { sub: 1, username: 'admin', role: Role.ADMIN };
      await service.listApproval(admin, { page: 1, page_size: 20 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
