import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    user: { count: jest.fn() },
    attendance: { count: jest.fn(), findMany: jest.fn() },
    leaveRequest: { count: jest.fn(), findMany: jest.fn() },
  };
  const leaveService = { getBalance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeaveService, useValue: leaveService },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('assembles admin team statistics', async () => {
    prisma.user.count.mockResolvedValueOnce(25).mockResolvedValueOnce(25); // total, then again inside countUnapprovedAbsences
    prisma.attendance.count.mockResolvedValue(20);
    prisma.leaveRequest.count.mockResolvedValue(4);
    prisma.leaveRequest.findMany
      .mockResolvedValueOnce([
        {
          userId: 3,
          leaveType: 'unpaid',
          user: {
            id: 3,
            username: 'lvc',
            firstName: 'Văn C',
            lastName: 'Lê',
            role: Role.MEMBER,
          },
        },
      ]) // onLeaveToday
      .mockResolvedValueOnce([]); // pendingLeaveRequests (top 3)
    prisma.attendance.findMany.mockResolvedValue([]); // checked-in userIds for countUnapprovedAbsences

    const result = await service.admin();

    expect(result.team_statistics.total_employees).toBe(25);
    expect(result.team_statistics.present).toBe(20);
    expect(result.team_statistics.pending_approvals).toBe(4);
    expect(result.absent_today).toEqual([
      {
        id: 3,
        name: 'Văn C Lê',
        role_label: 'Nhân viên',
        leave_type_label: 'Không lương',
        avatar_initial: 'V',
      },
    ]);
  });
});
