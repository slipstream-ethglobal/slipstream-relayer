import { IsString, IsNotEmpty, Matches } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  fee: string;

  @IsString()
  @IsNotEmpty()
  total: string;

  @IsString()
  @IsNotEmpty()
  feePercentage: string;

  @IsString()
  @IsNotEmpty()
  tokenDecimals: string;
}
