import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkip } from '../../common/utils/paginate.util';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { toNewsResponse } from './news.mapper';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListNewsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const where = query.category ? { category: query.category } : {};

    const [items, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: paginationSkip(page, pageSize),
        take: pageSize,
      }),
      this.prisma.news.count({ where }),
    ]);

    return {
      items: items.map(toNewsResponse),
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }

  async findOne(id: number) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Không tìm thấy tin tức');
    }
    return toNewsResponse(news);
  }

  async create(dto: CreateNewsDto) {
    const created = await this.prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content,
        image: dto.image,
        category: dto.category,
        isNew: dto.is_new ?? true,
      },
    });

    return toNewsResponse(created);
  }

  async update(id: number, dto: UpdateNewsDto) {
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tin tức');
    }

    const updated = await this.prisma.news.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        image: dto.image,
        category: dto.category,
        isNew: dto.is_new,
      },
    });

    return toNewsResponse(updated);
  }

  async remove(id: number) {
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tin tức');
    }

    const deleted = await this.prisma.news.delete({ where: { id } });

    return toNewsResponse(deleted);
  }
}
