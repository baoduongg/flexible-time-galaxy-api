export type PaginationMeta = { total: number; page: number; page_size: number };

export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): PaginationMeta {
  return { total, page, page_size: pageSize };
}

export function paginationSkip(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
