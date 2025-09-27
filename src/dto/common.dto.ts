import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class HealthCheckResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @IsString()
  @IsNotEmpty()
  version: string;
}

export class ErrorResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  error: string;

  @IsOptional()
  @IsString()
  details?: string;
}

export class ValidationErrorDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  error: string;

  @IsString()
  @IsNotEmpty()
  details: string;
}

