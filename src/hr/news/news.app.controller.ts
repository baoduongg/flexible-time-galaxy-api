import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { NewsService } from './news.service';

@Controller('app/news')
export class NewsAppController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  findAll(@Query() query: ListNewsQueryDto) {
    return this.newsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.findOne(id);
  }
}
