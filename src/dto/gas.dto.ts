import { IsString, IsNotEmpty } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  nonce: string;

  @IsString()
  @IsNotEmpty()
  deadline: string;
}

export class EstimateGasResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  gasEstimate: string;

  @IsString()
  @IsNotEmpty()
  gasPrice: string;

  @IsString()
  @IsNotEmpty()
  gasCost: string;
}

