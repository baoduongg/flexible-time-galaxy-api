import { LeaveType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leave_type: LeaveType;

  @IsInt()
  approver_id: number;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) => dto.leave_type === LeaveType.feedback,
  )
  @IsDateString()
  attendance_date?: string;

  @ValidateIf(
    (dto: CreateLeaveRequestDto) => dto.leave_type === LeaveType.feedback,
  )
  @IsString()
  @IsNotEmpty()
  correction_time?: string;
}
