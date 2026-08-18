import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  manager_id?: number;
}
