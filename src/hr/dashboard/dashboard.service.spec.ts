import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    user: { count: jest.fn() },
    attendance: { count: jest.fn(), findMany: jest.fn() },
    leaveRequest: { count: jest.fn(), findMany: jest.fn() },
    team: { findUnique: jest.fn(), findMany: jest.fn() },
    department: { findUnique: jest.fn() },
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

  it('assembles admin team statistics scoped to the whole company', async () => {
    prisma.user.count
      .mockResolvedValueOnce(25) // totalEmployees
      .mockResolvedValueOnce(3) // totalAdmins
      .mockResolvedValueOnce(22) // totalMembers
      .mockResolvedValueOnce(25); // totalEmployees inside countUnapprovedAbsences
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
            isAdmin: false,
            orgRole: 'MEMBER',
          },
        },
      ]) // onLeaveToday
      .mockResolvedValueOnce([]); // pendingLeaveRequests
    prisma.attendance.findMany.mockResolvedValue([]);

    const result = await service.admin();

    expect(prisma.user.count).toHaveBeenNthCalledWith(1, { where: {} });
    expect(result.team_statistics.total_employees).toBe(25);
    expect(result.team_statistics.total_admins).toBe(3);
    expect(result.team_statistics.total_members).toBe(22);
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

  it("leader() scopes every count to the caller's team", async () => {
    prisma.team.findUnique.mockResolvedValue({ id: 5, leaderId: 7 });
    prisma.user.count.mockResolvedValue(0);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.leaveRequest.count.mockResolvedValue(0);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);

    await service.leader(7);

    expect(prisma.team.findUnique).toHaveBeenCalledWith({
      where: { leaderId: 7 },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { teamId: 5 },
    });
  });

  it('leader() throws NotFoundException when the caller leads no team', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    await expect(service.leader(7)).rejects.toThrow(NotFoundException);
  });

  it("manager() scopes every count to the caller's department (via team.departmentId)", async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 2, managerId: 8 });
    prisma.user.count.mockResolvedValue(0);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.leaveRequest.count.mockResolvedValue(0);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);

    await service.manager(8);

    expect(prisma.department.findUnique).toHaveBeenCalledWith({
      where: { managerId: 8 },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { team: { departmentId: 2 } },
    });
  });

  it('manager() throws NotFoundException when the caller manages no department', async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.manager(8)).rejects.toThrow(NotFoundException);
  });

  it('assembles member dashboard from LeaveService.getBalance + recent requests', async () => {
    leaveService.getBalance.mockResolvedValue({
      year: 2026,
      total: 12,
      used: 3.5,
      remaining: 8.5,
    });
    prisma.leaveRequest.findMany.mockResolvedValue([]);

    const result = await service.member(1);

    expect(leaveService.getBalance).toHaveBeenCalledWith(1);
    expect(result.leave_balance).toEqual({
      total: 12,
      used: 3.5,
      remaining: 8.5,
    });
    expect(result.recent_requests).toEqual([]);
  });
});
