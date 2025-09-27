// Request types for the new SlipstreamGaslessProxy contract
export interface GaslessTransactionRequest {
  fromAddress: string;
  toAddress: string;
  tokenContract: string;
  transferAmount: string;
  relayerServiceFee: string;
  transactionNonce: string;
  expirationDeadline: string;
}

export interface ERC2612PermitSignature {
  approvalValue: string;
  permitDeadline: string;
  signatureV: number;
  signatureR: string;
  signatureS: string;
}

// API request/response types
export interface RelayRequest {
  chainId: number;
  request: GaslessTransactionRequest;
  permit?: ERC2612PermitSignature;
  signature: string;
}

export interface BatchRelayRequest {
  chainId: number;
  requests: GaslessTransactionRequest[];
  permits?: ERC2612PermitSignature[];
  signatures: string[];
}

export interface RelayResponse {
  success: boolean;
  transactionHash?: string;
  message: string;
  estimatedConfirmationTime?: number;
  gasUsed?: string;
}

export interface FeeEstimateRequest {
  chainId: number;
  tokenSymbol: string;
  amount: string;
}

export interface FeeEstimateResponse {
  success: boolean;
  fee: string;
  feeUsd: string;
  message?: string;
}

export interface TransactionStatus {
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  timestamp: Date;
}

export interface SafetyLimits {
  maxDailyVolumeUsd: number;
  maxSingleTransactionUsd: number;
  currentDailyVolumeUsd: number;
}

export interface PriceData {
  tokenSymbol: string;
  priceUsd: number;
  timestamp: number;
}

// Database Models
export interface Transaction {
  id?: number;
  hash: string;
  chainId: number;
  from: string;
  to: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  relayerFee: string;
  feeUsd: string;
  nonce: string;
  deadline: number;
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyVolume {
  id?: number;
  chainId: number;
  date: Date;
  volumeUsd: number;
  transactionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// EIP-712 Domain
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

// EIP-712 Types for gasless transfer
export const GASLESS_TRANSFER_TYPES = {
  Transfer: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'relayerFee', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

export interface GaslessTransferData {
  from: string;
  to: string;
  token: string;
  amount: string;
  relayerFee: string;
  nonce: string;
  deadline: number;
}