import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('rejects page_size above 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page_size: 1000000 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page_size')).toBe(true);
  });

  it('accepts page_size at the 100 boundary', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page_size: 100 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
