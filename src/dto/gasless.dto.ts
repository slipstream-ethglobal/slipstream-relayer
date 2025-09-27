import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GaslessTransferDto {
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
  amount: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]+$/, { message: 'Invalid signature format' })
  signature: string;

  @IsString()
  @IsNotEmpty()
  deadline: string;

  // Optional permit signature fields
  @IsOptional()
  @IsNumber()
  permitSignatureV?: number;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid permit signature R format',
  })
  permitSignatureR?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid permit signature S format',
  })
  permitSignatureS?: string;
}

export class BatchTransferItemDto {
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
  amount: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]+$/, { message: 'Invalid signature format' })
  signature: string;

  @IsString()
  @IsNotEmpty()
  deadline: string;

  // Optional permit signature fields
  @IsOptional()
  @IsNumber()
  permitSignatureV?: number;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid permit signature R format',
  })
  permitSignatureR?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid permit signature S format',
  })
  permitSignatureS?: string;
}

export class BatchTransferDto {
  @IsString()
  @IsNotEmpty()
  chainName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTransferItemDto)
  transfers: BatchTransferItemDto[];
}

export class GaslessTransferResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsString()
  @IsNotEmpty()
  blockNumber: string;

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

export class BatchTransferResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsArray()
  @IsString({ each: true })
  transactionIds: string[];

  @IsArray()
  @IsString({ each: true })
  txHashes: string[];

  @IsArray()
  @IsString({ each: true })
  blockNumbers: string[];

  @IsString()
  @IsNotEmpty()
  totalGasUsed: string;

  @IsString()
  @IsNotEmpty()
  totalFees: string;

  @IsNumber()
  executionTime: number;

  @IsArray()
  failedTransactions: Array<{
    index: number;
    error: string;
  }>;
}

export class PermitSupportResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsBoolean()
  supportsPermit: boolean;
}

export class ContractStateResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  owner: string;

  @IsBoolean()
  paused: boolean;

  @IsString()
  @IsNotEmpty()
  domainSeparator: string;
}

export class RelayerInfoResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  relayerAddress: string;

  @IsBoolean()
  isAuthorized: boolean;

  @IsString()
  @IsNotEmpty()
  lastActivity: string;
}

export class TokenInfoResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @IsBoolean()
  isSupported: boolean;

  @IsString()
  @IsNotEmpty()
  lastActivity: string;
}
