import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  leader_id?: number;

  @IsOptional()
  @IsInt()
  department_id?: number;
}
