import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsService } from './news.service';

describe('NewsService', () => {
  let service: NewsService;
  const prisma = {
    news: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

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

  describe('create', () => {
    it('creates a news item, defaulting is_new to true', async () => {
      prisma.news.create.mockResolvedValue({
        id: 1,
        title: 'Thông báo',
        content: 'Nội dung',
        image: null,
        category: 'Thông báo',
        isNew: true,
        publishedAt: new Date('2026-08-18T00:00:00Z'),
      });

      const result = await service.create({
        title: 'Thông báo',
        content: 'Nội dung',
        category: 'Thông báo',
      });

      expect(prisma.news.create).toHaveBeenCalledWith({
        data: {
          title: 'Thông báo',
          content: 'Nội dung',
          image: undefined,
          category: 'Thông báo',
          isNew: true,
        },
      });
      expect(result.is_new).toBe(true);
    });

    it('respects an explicit is_new: false', async () => {
      prisma.news.create.mockResolvedValue({
        id: 1,
        title: 't',
        content: 'c',
        image: null,
        category: null,
        isNew: false,
        publishedAt: new Date(),
      });

      await service.create({ title: 't', content: 'c', is_new: false });

      expect(prisma.news.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isNew: false }) }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a missing id', async () => {
      prisma.news.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.news.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      prisma.news.findUnique.mockResolvedValue({ id: 1, title: 'old' });
      prisma.news.update.mockResolvedValue({
        id: 1,
        title: 'new title',
        content: 'c',
        image: null,
        category: null,
        isNew: true,
        publishedAt: new Date(),
      });

      const result = await service.update(1, { title: 'new title' });

      expect(prisma.news.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: 'new title' },
      });
      expect(result.title).toBe('new title');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a missing id', async () => {
      prisma.news.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(prisma.news.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing news item', async () => {
      prisma.news.findUnique.mockResolvedValue({ id: 1 });
      prisma.news.delete.mockResolvedValue({
        id: 1,
        title: 't',
        content: 'c',
        image: null,
        category: null,
        isNew: true,
        publishedAt: new Date(),
      });

      const result = await service.remove(1);

      expect(prisma.news.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.id).toBe(1);
    });
  });
});
