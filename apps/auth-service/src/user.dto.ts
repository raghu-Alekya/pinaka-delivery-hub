import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import { UserRole } from './user.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @Transform(normalizeEmail) @IsEmail() @MaxLength(255) email!: string;
  @Transform(trim) @IsPhoneNumber() @MaxLength(30) phoneNumber!: string;
  @IsEnum(UserRole) role!: UserRole;
  @IsOptional() @IsBoolean() notificationEnabled?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email?: string;
  @IsOptional()
  @Transform(trim)
  @IsPhoneNumber()
  @MaxLength(30)
  phoneNumber?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() notificationEnabled?: boolean;
}
