import { BigNumberish, ethers } from 'ethers';
import {
  GaslessTransactionRequest as ContractGaslessTransactionRequest,
  ERC2612PermitSignature as ContractERC2612PermitSignature,
  ProcessStandardGaslessTransferParams,
  ProcessPermitBasedGaslessTransferParams,
  ProcessBatchStandardTransfersParams,
  ProcessBatchPermitBasedTransfersParams,
  GaslessTokenTransferCompletedEvent,
  ContractState,
  RelayerInfo,
  TokenInfo as ContractTokenInfo,
} from '../contracts/types';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: string;
}

export interface FeeSettings {
  baseFeeBps: string;
  maxFeeBps: string;
  minFeeUsd: string;
}

export interface ChainConfig {
  name: string;
  chainId: string;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress: string;
  feeSettings: FeeSettings;
  tokens: Record<string, TokenInfo>;
}

// Re-export contract types for convenience
export type GaslessTransactionRequest = ContractGaslessTransactionRequest;
export type ERC2612PermitSignature = ContractERC2612PermitSignature;

// Legacy interface for backward compatibility
export interface TransferParams {
  from: string;
  to: string;
  token: string;
  amount: BigNumberish;
  fee: BigNumberish;
  nonce: BigNumberish;
  deadline: BigNumberish;
  signature: string;
}

export interface TransferResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  explorerUrl: string;
}

export interface GaslessTransferResult extends TransferResult {
  transactionId: string;
  executionTime: number;
  fee: string;
}

export interface BatchTransferResult {
  success: boolean;
  transactionIds: string[];
  txHashes: string[];
  blockNumbers: number[];
  totalGasUsed: string;
  totalFees: string;
  executionTime: number;
  failedTransactions: Array<{
    index: number;
    error: string;
  }>;
}

export interface GasEstimate {
  gasEstimate: string;
  gasPrice: string;
  gasCost: string;
  gasLimit: string;
  gasPriceWei: string;
  gasCostWei: string;
  gasCostEth: string;
  estimatedTimeMs: number;
}

export interface MessageHashResult {
  messageHash: string;
  ethSignedMessageHash: string;
}

export interface IChainConfigService {
  getChainConfig(chainName: string): ChainConfig;
  getSupportedChains(): string[];
  getTokenConfig(chainName: string, tokenSymbol: string): TokenInfo;
}

export interface IContractManagerService {
  // Legacy methods for backward compatibility
  getNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint>;
  executeTransfer(
    chainName: string,
    transferParams: TransferParams,
    privateKey: string,
  ): Promise<TransferResult>;

  // New gasless transfer methods
  getCurrentUserNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint>;

  processStandardGaslessTransfer(
    chainName: string,
    params: ProcessStandardGaslessTransferParams,
    privateKey: string,
  ): Promise<TransferResult>;

  processPermitBasedGaslessTransfer(
    chainName: string,
    params: ProcessPermitBasedGaslessTransferParams,
    privateKey: string,
  ): Promise<TransferResult>;

  // Batch transfer methods
  processBatchStandardTransfers(
    chainName: string,
    params: ProcessBatchStandardTransfersParams,
    privateKey: string,
  ): Promise<BatchTransferResult>;

  processBatchPermitBasedTransfers(
    chainName: string,
    params: ProcessBatchPermitBasedTransfersParams,
    privateKey: string,
  ): Promise<BatchTransferResult>;

  // Token and contract utilities
  getTokenBalance(
    chainName: string,
    tokenAddress: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint>;

  checkTokenAllowance(
    chainName: string,
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    privateKey: string,
  ): Promise<bigint>;

  checkERC2612PermitSupport(
    chainName: string,
    tokenAddress: string,
    privateKey: string,
  ): Promise<boolean>;

  // Contract state queries
  getContractState(
    chainName: string,
    privateKey: string,
  ): Promise<ContractState>;
  getRelayerInfo(
    chainName: string,
    relayerAddress: string,
    privateKey: string,
  ): Promise<RelayerInfo>;
  getTokenInfo(
    chainName: string,
    tokenAddress: string,
    privateKey: string,
  ): Promise<ContractTokenInfo>;

  // Signature utilities
  generateMessageHash(
    contractAddress: string,
    from: string,
    to: string,
    token: string,
    amount: BigNumberish,
    fee: BigNumberish,
    nonce: BigNumberish,
    deadline: BigNumberish,
  ): MessageHashResult;

  verifySignature(
    messageHash: string,
    signature: string,
    expectedSigner: string,
  ): boolean;

  // Provider and contract access
  getProviderForGas(chainName: string): ethers.JsonRpcProvider;
  getContractForGas(chainName: string, privateKey: string): ethers.Contract;
}

export interface GaslessTransferParams {
  chainName: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: string;
  signature: string;
  deadline: string;
  permitSignatureV?: number;
  permitSignatureR?: string;
  permitSignatureS?: string;
}

export interface BatchTransferParams {
  chainName: string;
  transfers: Array<{
    from: string;
    to: string;
    tokenSymbol: string;
    amount: string;
    signature: string;
    deadline: string;
    permitSignatureV?: number;
    permitSignatureR?: string;
    permitSignatureS?: string;
  }>;
}

export interface IRelayerService {
  // Fee calculation
  calculateFee(chainName: string, amount: bigint, tokenSymbol: string): bigint;

  // Parameter validation and preparation
  validateTransferParams(params: GaslessTransferParams): Promise<boolean>;
  prepareTransferParams(params: GaslessTransferParams): Promise<TransferParams>;
  prepareGaslessTransactionRequest(
    params: GaslessTransferParams,
  ): Promise<GaslessTransactionRequest>;

  // Signature verification and generation
  verifySignature(
    chainName: string,
    transferParams: TransferParams,
    signature: string,
    expectedSigner: string,
  ): boolean;
  generateMessageForSigning(
    chainName: string,
    params: GaslessTransferParams,
  ): Promise<string>;

  // Transfer execution methods
  executeGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult>;
  processStandardGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult>;
  processPermitBasedGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult>;

  // Batch transfer methods
  processBatchStandardTransfers(
    params: BatchTransferParams,
  ): Promise<BatchTransferResult>;
  processBatchPermitBasedTransfers(
    params: BatchTransferParams,
  ): Promise<BatchTransferResult>;

  // Utility methods
  getUserNonce(chainName: string, userAddress: string): Promise<bigint>;
  checkERC2612PermitSupport(
    chainName: string,
    tokenAddress: string,
  ): Promise<boolean>;
  getSupportedChains(): string[];
  getChainInfo(chainName: string): ChainConfig;
  getSupportedTokens(chainName: string): Record<string, TokenInfo>;
  estimateGasCost(
    chainName: string,
    params: GaslessTransferParams,
  ): Promise<GasEstimate>;
}

export interface ErrorContext {
  [key: string]: string | number | boolean | object;
}

export interface ExpressRequest {
  method: string;
  originalUrl: string;
  ip: string;
  get: (header: string) => string;
}

export interface ExpressResponse {
  statusCode: number;
}

export interface ILoggerService {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  logTransaction(type: string, data: Record<string, unknown>): void;
  logError(error: Error, context?: ErrorContext): void;
  logRequest(
    req: ExpressRequest,
    res: ExpressResponse,
    responseTime: number,
  ): void;
}

export interface GasEstimationOptions {
  gasMultiplier?: number;
  maxGasPrice?: bigint;
  fallbackGasPrice?: bigint;
}

export interface GasEstimationResult extends GasEstimate {
  gasLimit: string;
  gasPriceWei: string;
  gasCostWei: string;
  gasCostEth: string;
  estimatedTimeMs: number;
}

export interface IGasEstimationService {
  estimateTransferGas(
    chainName: string,
    transferParams: TransferParams,
    options?: GasEstimationOptions,
  ): Promise<GasEstimationResult>;
  getGasPrice(
    chainName: string,
    options?: GasEstimationOptions,
  ): Promise<bigint>;
  estimateBatchGas(
    chainName: string,
    transferParamsList: TransferParams[],
    options?: GasEstimationOptions,
  ): Promise<GasEstimationResult>;
  getGasPriceHistory(
    chainName: string,
    hours?: number,
  ): Array<{ timestamp: number; gasPrice: string }>;
  clearCache(): void;
  getCacheStats(): {
    size: number;
    entries: Array<{ chain: string; price: string; age: number }>;
  };
}
