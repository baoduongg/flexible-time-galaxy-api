import { Module } from '@nestjs/common';
import { NewsAppController } from './news.app.controller';
import { NewsAdminController } from './news.admin.controller';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsAppController, NewsAdminController],
  providers: [NewsService],
})
export class NewsModule {}
