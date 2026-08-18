import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { startOfToday } from './attendance-status.util';

describe('AttendanceService', () => {
  let service: AttendanceService;
  const prisma = {
    attendance: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    leaveRequest: { findMany: jest.fn() },
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
    it('rejects a second check-in on the same day', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        checkinTime: new Date(),
      });
      await expect(service.checkin(1)).rejects.toThrow(BadRequestException);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it("upserts today's row on first check-in", async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.upsert.mockResolvedValue({
        checkinTime: new Date(),
        checkoutTime: null,
      });

      await service.checkin(1);

      expect(prisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_date: { userId: 1, date: startOfToday() } },
        }),
      );
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
  });
});
