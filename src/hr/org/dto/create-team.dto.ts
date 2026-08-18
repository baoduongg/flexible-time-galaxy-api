import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  leader_id: number;

  @IsInt()
  department_id: number;
}
