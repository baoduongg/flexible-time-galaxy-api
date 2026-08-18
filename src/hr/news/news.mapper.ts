import { News } from '@prisma/client';

export function toNewsResponse(news: News) {
  return {
    id: news.id,
    title: news.title,
    content: news.content,
    image: news.image,
    is_new: news.isNew,
    category: news.category,
    published_at: news.publishedAt.toISOString(),
  };
}
