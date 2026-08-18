import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkip } from '../../common/utils/paginate.util';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
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
}
