import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ApproversService } from './approvers.service';

describe('ApproversService', () => {
  let service: ApproversService;
  const prisma = { user: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [ApproversService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ApproversService);
  });

  it('maps approvers to {id, name, role_label}', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 7, firstName: 'Thị B', lastName: 'Trần', username: 'tranthib', approverTitle: 'Trưởng nhóm' },
      { id: 8, firstName: null, lastName: null, username: 'hr_1', approverTitle: 'HR' },
    ]);

    const result = await service.findAll();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isApprover: true } }),
    );
    expect(result).toEqual([
      { id: 7, name: 'Thị B Trần', role_label: 'Trưởng nhóm' },
      { id: 8, name: 'hr_1', role_label: 'HR' },
    ]);
  });
});
