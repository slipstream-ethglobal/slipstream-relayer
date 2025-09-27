import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsArray } from 'class-validator';

export class EstimateGasDto {
  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsNumber()
  nonce: number;

  @IsString()
  @IsNotEmpty()
  deadline: string;
}

export class EstimateGasResponseDto {
  @IsBoolean()
  success: boolean;

  @IsNumber()
  gasEstimate: number;

  @IsNumber()
  gasPrice: number;

  @IsNumber()
  gasCost: number;
}

export class GasPriceResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsNumber()
  gasPrice: number;

  @IsNumber()
  gasPriceWei: number;
}

export class PermitSupportResponseDto {
  @IsBoolean()
  success: boolean;

  @IsBoolean()
  supportsPermit: boolean;
}

export class GasCacheStatsResponseDto {
  @IsBoolean()
  success: boolean;

  @IsNumber()
  size: number;

  @IsArray()
  entries: Array<{
    chain: string;
    price: number;
    age: number;
  }>;
}

