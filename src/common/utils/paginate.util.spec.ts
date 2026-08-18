import { buildPaginationMeta, paginationSkip } from './paginate.util';

describe('paginate.util', () => {
  it('builds meta from total/page/pageSize', () => {
    expect(buildPaginationMeta(45, 2, 20)).toEqual({
      total: 45,
      page: 2,
      page_size: 20,
    });
  });

  it('computes skip offset', () => {
    expect(paginationSkip(1, 20)).toBe(0);
    expect(paginationSkip(3, 20)).toBe(40);
  });
});
