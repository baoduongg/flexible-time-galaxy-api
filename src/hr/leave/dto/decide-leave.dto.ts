import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideLeaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
