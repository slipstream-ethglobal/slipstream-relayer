import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class HealthCheckResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

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
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  error: string;

  @IsOptional()
  @IsString()
  details?: string;
}

export class ValidationErrorDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  error: string;

  @IsString()
  @IsNotEmpty()
  details: string;
}
