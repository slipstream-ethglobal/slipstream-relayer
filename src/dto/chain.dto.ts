import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TokenInfoDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  decimals: number;
}

export class FeeSettingsDto {
  @IsString()
  @IsNotEmpty()
  baseFeeBps: string;

  @IsString()
  @IsNotEmpty()
  maxFeeBps: string;

  @IsString()
  @IsNotEmpty()
  minFeeUsd: string;
}

export class ChainInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  chainId: number;

  @IsString()
  @IsNotEmpty()
  rpcUrl: string;

  @IsString()
  @IsNotEmpty()
  explorerUrl: string;

  @IsString()
  @IsNotEmpty()
  contractAddress: string;

  @ValidateNested()
  @Type(() => FeeSettingsDto)
  feeSettings: FeeSettingsDto;

  @ValidateNested()
  @Type(() => TokenInfoDto)
  tokens: Record<string, TokenInfoDto>;
}

export class GetChainsResponseDto {
  @IsBoolean()
  success: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChainInfoDto)
  chains: ChainInfoDto[];
}

export class GetTokensResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  @IsNotEmpty()
  chainName: string;

  @ValidateNested()
  @Type(() => TokenInfoDto)
  tokens: Record<string, TokenInfoDto>;
}
