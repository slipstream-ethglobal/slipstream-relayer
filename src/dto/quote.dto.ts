import { IsString, IsNotEmpty, Matches, IsNumber, IsBoolean } from 'class-validator';

export class GetQuoteDto {
  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'Amount must be a valid integer string' })
  amount: string;
}

export class GetQuoteResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  fee: number;

  @IsNumber()
  total: number;

  @IsNumber()
  feePercentage: number;

  @IsNumber()
  tokenDecimals: number;
}

