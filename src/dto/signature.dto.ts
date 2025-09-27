import { IsString, IsNotEmpty, Matches, IsNumber, Min } from 'class-validator';

export class PrepareSignatureDto {
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

  @IsNumber()
  @Min(0)
  nonce: number;

  @IsString()
  @IsNotEmpty()
  deadline: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]+$/, { message: 'Invalid signature format' })
  signature: string;
}

export class PrepareSignatureResponseDto {
  @IsString()
  @IsNotEmpty()
  success: string;

  @IsString()
  @IsNotEmpty()
  messageHash: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
