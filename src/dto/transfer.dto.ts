import {
  IsString,
  IsNotEmpty,
  Matches,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class GetNonceDto {
  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid user address format' })
  userAddress: string;
}

export class GetNonceResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  userAddress: string;

  @IsNumber()
  nonce: number;
}

export class RelayTransferDto {
  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid from address format' })
  from: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid to address format' })
  to: string;

  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'Amount must be a valid integer string' })
  amount: string;

  @IsString()
  @IsNotEmpty()
  deadline: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{130}$/, { message: 'Invalid signature format' })
  signature: string;
}

export class RelayTransferResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsNumber()
  blockNumber: number;

  @IsNumber()
  gasUsed: number;

  @IsString()
  @IsNotEmpty()
  explorerUrl: string;

  @IsNumber()
  fee: number;

  @IsNumber()
  executionTime: number;
}
