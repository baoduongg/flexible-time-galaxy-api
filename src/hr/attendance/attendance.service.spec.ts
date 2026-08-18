import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
});
