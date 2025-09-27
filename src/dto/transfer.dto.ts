import { IsString, IsNotEmpty, Matches, IsNumber, Min } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsString()
  @IsNotEmpty()
  userAddress: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
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
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsNumber()
  blockNumber: number;

  @IsString()
  @IsNotEmpty()
  gasUsed: string;

  @IsString()
  @IsNotEmpty()
  explorerUrl: string;

  @IsString()
  @IsNotEmpty()
  fee: string;

  @IsNumber()
  executionTime: number;
}
