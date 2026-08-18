import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApproversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const approvers = await this.prisma.user.findMany({
      where: { isApprover: true },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        approverTitle: true,
      },
      orderBy: { id: 'asc' },
    });

    return approvers.map((approver) => ({
      id: approver.id,
      name:
        [approver.firstName, approver.lastName].filter(Boolean).join(' ') ||
        approver.username,
      role_label: approver.approverTitle ?? '',
    }));
  }
}
