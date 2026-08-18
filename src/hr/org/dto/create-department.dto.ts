import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  manager_id: number;
}
