import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LeaveStatus, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { startOfToday } from './attendance-status.util';

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
  });
}

describe('AttendanceService', () => {
  let service: AttendanceService;
  const prisma = {
    attendance: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    leaveRequest: { findMany: jest.fn() },
    publicHoliday: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AttendanceService);
  });

  describe('checkin', () => {
    it("creates today's row on first check-in", async () => {
      prisma.attendance.create.mockResolvedValue({
        checkinTime: new Date(),
        checkoutTime: null,
      });

      await service.checkin(1);

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 1, date: startOfToday() }),
        }),
      );
    });

    it('rejects a second check-in on the same day, even under a race', async () => {
      // No pre-check read: create() itself hits the DB's unique(userId, date)
      // constraint, closing the TOCTOU window a read-then-write check would leave open.
      prisma.attendance.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.checkin(1)).rejects.toThrow(BadRequestException);
    });

    it('rethrows unrelated database errors', async () => {
      prisma.attendance.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.checkin(1)).rejects.toThrow('connection lost');
    });
  });

  describe('checkout', () => {
    it('rejects checkout before checkin', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);
      await expect(service.checkout(1)).rejects.toThrow(BadRequestException);
    });

    it('rejects a second checkout on the same day', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        checkinTime: new Date(),
        checkoutTime: new Date(),
      });
      await expect(service.checkout(1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHistory', () => {
    it('marks non-annual approved leave (e.g. maternity) as "P", not "Ro"', async () => {
      // A past month so buildAttendanceHistory covers the whole month regardless of "today".
      const year = 2020;
      const month = 3; // March 2020: Mon 2020-03-02 is a weekday
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany
        .mockResolvedValueOnce([
          {
            leaveType: LeaveType.maternity,
            status: LeaveStatus.approved,
            startDate: new Date('2020-03-02'),
            endDate: new Date('2020-03-02'),
          },
        ])
        .mockResolvedValueOnce([]); // feedbackRequests
      prisma.publicHoliday.findMany.mockResolvedValue([]);

      const history = await service.getHistory(1, year, month);

      // getHistory's approvedLeaves query must not filter by leaveType (any approved
      // leave type counts as "on leave", matching dashboard.service.ts's admin() query).
      expect(prisma.leaveRequest.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.not.objectContaining({ leaveType: expect.anything() }),
        }),
      );

      const day = history.find((d) => d.date === '2020-03-02');
      expect(day?.status_code).toBe('P');
    });

    it('marks a public holiday as "L"', async () => {
      const year = 2020;
      const month = 3; // Mon 2020-03-02 is a weekday
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany
        .mockResolvedValueOnce([]) // approvedLeaves
        .mockResolvedValueOnce([]); // feedbackRequests
      prisma.publicHoliday.findMany.mockResolvedValue([
        { date: new Date('2020-03-02'), name: 'Test Holiday' },
      ]);

      const history = await service.getHistory(1, year, month);

      expect(prisma.publicHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            date: {
              gte: new Date(Date.UTC(2020, 2, 1)),
              lte: new Date(Date.UTC(2020, 2, 31)),
            },
          },
        }),
      );
      const day = history.find((d) => d.date === '2020-03-02');
      expect(day?.status_code).toBe('L');
    });
  });

  describe('applyCorrection', () => {
    it('upserts checkinTime for the given date from a GMT+7 HH:mm string', async () => {
      prisma.attendance.upsert.mockResolvedValue({});
      const date = new Date('2026-08-17');

      await service.applyCorrection(1, date, '08:15');

      expect(prisma.attendance.upsert).toHaveBeenCalledWith({
        where: { userId_date: { userId: 1, date } },
        create: {
          userId: 1,
          date,
          checkinTime: new Date('2026-08-17T01:15:00.000Z'),
        },
        update: { checkinTime: new Date('2026-08-17T01:15:00.000Z') },
      });
    });

    it('does nothing for a malformed correction time', async () => {
      const date = new Date('2026-08-17');

      await service.applyCorrection(1, date, 'not-a-time');

      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });
  });
});
