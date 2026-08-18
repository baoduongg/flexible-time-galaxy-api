import { OrgRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  password?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @IsOptional()
  @IsEnum(OrgRole)
  org_role?: OrgRole;

  @IsOptional()
  @IsInt()
  team_id?: number;
}
