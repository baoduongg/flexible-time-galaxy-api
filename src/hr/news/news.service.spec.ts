import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsService } from './news.service';

describe('NewsService', () => {
  let service: NewsService;
  const prisma = { news: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [NewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NewsService);
  });

  describe('findAll', () => {
    it('filters by category and paginates', async () => {
      prisma.news.findMany.mockResolvedValue([]);
      prisma.news.count.mockResolvedValue(0);

      const result = await service.findAll({ category: 'Thông báo', page: 1, page_size: 20 });

      expect(prisma.news.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: 'Thông báo' } }),
      );
      expect(result.meta).toEqual({ total: 0, page: 1, page_size: 20 });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing id', async () => {
      prisma.news.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
