import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaveType, LeaveStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    leaveRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    leaveBalance: { findUnique: jest.fn() },
    leaveApprovalStep: { update: jest.fn() },
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
    it('throws when the requester has no team leader assigned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        orgRole: 'MEMBER',
        team: null,
        ledTeam: null,
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create(1, {
          leave_type: LeaveType.annual,
          start_date: '2026-08-17',
          end_date: '2026-08-17',
          reason: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('resolves the chain and persists LeaveApprovalStep rows via Prisma nested create', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        orgRole: 'MEMBER',
        team: { leaderId: 7, department: { managerId: 8 } },
        ledTeam: null,
      });
      prisma.user.findFirst.mockResolvedValue({ id: 9 });
      prisma.leaveRequest.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          ...data,
          user: { username: 'member', firstName: null, lastName: null },
          decidedBy: null,
          approvalSteps: [],
          createdAt: new Date('2026-08-18T00:00:00Z'),
          updatedAt: new Date('2026-08-18T00:00:00Z'),
        }),
      );

      // Mon 2026-08-17 .. Fri 2026-08-21 = 5 weekdays -> LEADER + MANAGER
      const result = await service.create(1, {
        leave_type: LeaveType.annual,
        start_date: '2026-08-17',
        end_date: '2026-08-21',
        reason: 'test',
      });

      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durationDays: 5,
            approvalSteps: {
              create: [
                { level: 'LEADER', order: 0, approverId: 7 },
                { level: 'MANAGER', order: 1, approverId: 8 },
              ],
            },
          }),
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
    it('scopes non-admins to requests with a pending step assigned to them', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3);

      const approver: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };
      const result = await service.listApproval(approver, {
        page: 1,
        page_size: 20,
      });

      const expectedScope = {
        approvalSteps: { some: { approverId: 7, status: 'pending' } },
      };
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedScope }),
      );
      expect(result.pending_count).toBe(3);
    });

    it('lets isAdmin actors see every request', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      const admin: JwtPayload = {
        sub: 1,
        username: 'admin',
        isAdmin: true,
        orgRole: 'MEMBER',
      };
      await service.listApproval(admin, { page: 1, page_size: 20 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('listAllAdmin', () => {
    it('queries with search and status filters and paginates properly', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      const result = await service.listAllAdmin({
        page: 1,
        page_size: 10,
        status: LeaveStatus.pending,
        search: 'john',
      });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: LeaveStatus.pending,
            OR: expect.arrayContaining([
              {
                user: { firstName: { contains: 'john', mode: 'insensitive' } },
              },
              { reason: { contains: 'john', mode: 'insensitive' } },
            ]),
          }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result.items).toEqual([]);
      expect(result.meta.page).toBe(1);
    });

    it('filters by approver_id against any approval step (not just pending)', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.count.mockResolvedValue(0);

      await service.listAllAdmin({ page: 1, page_size: 10, approver_id: 7 });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approvalSteps: { some: { approverId: 7 } },
          }),
        }),
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
    function pendingLeave(
      steps: Array<{
        id: number;
        order: number;
        approverId: number | null;
        status: string;
      }>,
    ) {
      return {
        id: 1,
        userId: 1,
        leaveType: LeaveType.annual,
        startDate: new Date('2026-08-17'),
        endDate: new Date('2026-08-17'),
        durationDays: 1,
        attendanceDate: null,
        correctionTime: null,
        status: LeaveStatus.pending,
        reason: 'test',
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        approvalSteps: steps,
        // ponytail: toLeaveRequestResponse() requires leave.user; brief's fixture omitted it, added minimally.
        user: { username: 'member', firstName: null, lastName: null },
        decidedBy: null,
      };
    }

    const twoStepLeave = pendingLeave([
      { id: 1, order: 0, approverId: 7, status: 'pending' },
      { id: 2, order: 1, approverId: 8, status: 'pending' },
    ]);

    it('rejects the decision when the actor is neither the current step approver nor admin', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      const stranger: JwtPayload = {
        sub: 99,
        username: 'stranger',
        isAdmin: false,
        orgRole: 'MEMBER',
      };

      await expect(service.approve(1, stranger)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.leaveApprovalStep.update).not.toHaveBeenCalled();
    });

    it('requires a note to reject', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      const approver: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };

      await expect(service.reject(1, approver)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approving the first of two steps advances to the next step without finalizing the request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const leaderApprover: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };

      const result = await service.approve(1, leaderApprover, 'ok');

      expect(prisma.leaveApprovalStep.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'approved', note: 'ok', decidedAt: expect.any(Date) },
      });
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: {} }),
      );
      expect(result.status).toBe('pending');
    });

    it('approving the last step finalizes the request as approved', async () => {
      const lastStepPending = pendingLeave([
        { id: 1, order: 0, approverId: 7, status: 'approved' },
        { id: 2, order: 1, approverId: 8, status: 'pending' },
      ]);
      prisma.leaveRequest.findUnique.mockResolvedValue(lastStepPending);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...lastStepPending, ...data }),
      );
      const managerApprover: JwtPayload = {
        sub: 8,
        username: 'manager',
        isAdmin: false,
        orgRole: 'MANAGER',
      };

      const result = await service.approve(2, managerApprover, 'ok');

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: LeaveStatus.approved,
            decidedAt: expect.any(Date),
            decidedById: 8,
            decisionNote: 'ok',
          },
        }),
      );
      expect(result.status).toBe('approved');
    });

    it('rejecting at any step finalizes the request as rejected', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const leaderApprover: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };

      const result = await service.reject(1, leaderApprover, 'không hợp lệ');

      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: LeaveStatus.rejected,
            decidedAt: expect.any(Date),
            decidedById: 7,
            decisionNote: 'không hợp lệ',
          },
        }),
      );
      expect(result.status).toBe('rejected');
    });

    it('an isAdmin actor can decide a step even when not its approverId', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(twoStepLeave);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...twoStepLeave, ...data }),
      );
      const admin: JwtPayload = {
        sub: 1,
        username: 'admin',
        isAdmin: true,
        orgRole: 'MEMBER',
      };

      await expect(service.approve(1, admin, 'ok')).resolves.toBeDefined();
      expect(prisma.leaveApprovalStep.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'approved', note: 'ok', decidedAt: expect.any(Date) },
      });
    });

    it('does not write back to Attendance when approving a non-feedback request', async () => {
      const singleStep = pendingLeave([
        { id: 1, order: 0, approverId: 7, status: 'pending' },
      ]);
      prisma.leaveRequest.findUnique.mockResolvedValue(singleStep);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...singleStep, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).not.toHaveBeenCalled();
    });

    it('writes the correction back to Attendance when the last step approves a feedback request', async () => {
      const singleStep = {
        ...pendingLeave([
          { id: 1, order: 0, approverId: 7, status: 'pending' },
        ]),
        leaveType: LeaveType.feedback,
        attendanceDate: new Date('2026-08-10'),
        correctionTime: '08:15',
      };
      prisma.leaveRequest.findUnique.mockResolvedValue(singleStep);
      prisma.leaveApprovalStep.update.mockResolvedValue({});
      prisma.leaveRequest.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...singleStep, ...data }),
      );
      const approver: JwtPayload = {
        sub: 7,
        username: 'leader',
        isAdmin: false,
        orgRole: 'LEADER',
      };

      await service.approve(1, approver, 'ok');

      expect(attendanceService.applyCorrection).toHaveBeenCalledWith(
        1,
        new Date('2026-08-10'),
        '08:15',
      );
    });
  });
});
