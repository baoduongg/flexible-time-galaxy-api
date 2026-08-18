import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaveType, LeaveStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttendanceService } from '../attendance/attendance.service';
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
  const attendanceService = { applyCorrection: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: AttendanceService, useValue: attendanceService },
      ],
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

    it('rejects self-approval when approver_id equals the requester', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, isApprover: true });

      await expect(
        service.create(1, {
          leave_type: LeaveType.annual,
          approver_id: 1,
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

    it('computes duration_days using UTC regardless of server local timezone', async () => {
      const originalTz = process.env.TZ;
      process.env.TZ = 'America/Los_Angeles';
      try {
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

        // Mon 2026-08-17 .. Fri 2026-08-21 = 5 weekdays, even under a negative UTC offset
        const result = await service.create(1, {
          leave_type: LeaveType.annual,
          approver_id: 7,
          start_date: '2026-08-17',
          end_date: '2026-08-21',
          reason: 'test',
        });

        expect(result.duration_days).toBe(5);
      } finally {
        process.env.TZ = originalTz;
      }
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

  describe('getBalance', () => {
    it('computes remaining = total - used(approved annual leave)', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({ totalDays: 12 });
      prisma.leaveRequest.aggregate.mockResolvedValue({
        _sum: { durationDays: 3.5 },
      });

      const result = await service.getBalance(1, 2026);

      expect(result).toEqual({
        year: 2026,
        total: 12,
        used: 3.5,
        remaining: 8.5,
      });

      // Verify leaveBalance lookup uses correct compound key
      expect(prisma.leaveBalance.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_year: { userId: 1, year: 2026 } },
        }),
      );

      // Verify aggregate filters by userId, leaveType, status, and year range
      expect(prisma.leaveRequest.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            leaveType: LeaveType.annual,
            status: LeaveStatus.approved,
            startDate: expect.objectContaining({
              gte: new Date(Date.UTC(2026, 0, 1)),
              lte: new Date(Date.UTC(2026, 11, 31)),
            }),
          }),
          _sum: { durationDays: true },
        }),
      );
    });

    it('defaults total to 12 (DEFAULT_ANNUAL_DAYS) when no LeaveBalance row exists yet', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveRequest.aggregate.mockResolvedValue({
        _sum: { durationDays: null },
      });

      const result = await service.getBalance(1, 2026);

      expect(result).toEqual({ year: 2026, total: 12, used: 0, remaining: 12 });

      // Verify calls were made with correct arguments
      expect(prisma.leaveBalance.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_year: { userId: 1, year: 2026 } },
        }),
      );

      expect(prisma.leaveRequest.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            leaveType: LeaveType.annual,
            status: LeaveStatus.approved,
            startDate: expect.objectContaining({
              gte: new Date(Date.UTC(2026, 0, 1)),
              lte: new Date(Date.UTC(2026, 11, 31)),
            }),
          }),
          _sum: { durationDays: true },
        }),
      );
    });

    it('floors remaining at 0 when used exceeds total', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({ totalDays: 12 });
      prisma.leaveRequest.aggregate.mockResolvedValue({
        _sum: { durationDays: 20 },
      });

      const result = await service.getBalance(1, 2026);

      expect(result).toEqual({ year: 2026, total: 12, used: 20, remaining: 0 });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the id does not exist', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve / reject', () => {
    const pendingLeave = {
      id: 1,
      userId: 1,
      leaveType: LeaveType.annual,
      startDate: new Date('2026-08-17'),
      endDate: new Date('2026-08-17'),
      durationDays: 1,
      attendanceDate: null,
      correctionTime: null,
      status: LeaveStatus.pending,
      approverId: 7,
      reason: 'test',
      decidedAt: null,
      decidedById: null,
      decisionNote: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
      user: { username: 'member', firstName: null, lastName: null },
      approver: { username: 'admin', firstName: null, lastName: null },
      decidedBy: null,
    };

    it('rejects the decision when the actor is neither the approver nor admin', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      const stranger: JwtPayload = {
        sub: 99,
        username: 'stranger',
        role: Role.MEMBER,
      };

      await expect(service.approve(1, stranger)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
    });

    it('requires a note to reject', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };

      await expect(service.reject(1, approver)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approves and stamps decidedAt/decidedById', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...pendingLeave, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };

      const result = await service.approve(1, approver, 'ok');

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: LeaveStatus.approved,
            decidedById: 7,
          }),
        }),
      );
      expect(result.status).toBe('approved');
    });

    it('does not write back to Attendance when approving a non-feedback request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...pendingLeave, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).not.toHaveBeenCalled();
    });

    it('writes the correction back to Attendance when approving a feedback request', async () => {
      const feedbackLeave = {
        ...pendingLeave,
        leaveType: LeaveType.feedback,
        attendanceDate: new Date('2026-08-10'),
        correctionTime: '08:15',
      };
      prisma.leaveRequest.findUnique.mockResolvedValue(feedbackLeave);
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...feedbackLeave, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).toHaveBeenCalledWith(
        1,
        new Date('2026-08-10'),
        '08:15',
      );
    });

    it('does not write back to Attendance when rejecting a feedback request', async () => {
      const feedbackLeave = {
        ...pendingLeave,
        leaveType: LeaveType.feedback,
        attendanceDate: new Date('2026-08-10'),
        correctionTime: '08:15',
      };
      prisma.leaveRequest.findUnique.mockResolvedValue(feedbackLeave);
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...feedbackLeave, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'manager',
        role: Role.MEMBER,
      };

      await service.reject(1, approver, 'không hợp lệ');

      expect(attendanceService.applyCorrection).not.toHaveBeenCalled();
    });
  });
});
