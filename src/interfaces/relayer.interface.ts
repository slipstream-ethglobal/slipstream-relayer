import { BigNumberish, ethers } from 'ethers';

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

export interface GasEstimate {
  gasEstimate: string;
  gasPrice: string;
  gasCost: string;
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
  getNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint>;
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
  executeTransfer(
    chainName: string,
    transferParams: TransferParams,
    privateKey: string,
  ): Promise<TransferResult>;
  getProviderForGas(chainName: string): ethers.JsonRpcProvider;
  getContractForGas(chainName: string, privateKey: string): ethers.Contract;
}

export interface IRelayerService {
  calculateFee(chainName: string, amount: bigint, tokenSymbol: string): bigint;
  validateTransferParams(params: any): Promise<boolean>;
  prepareTransferParams(params: any): Promise<TransferParams>;
  verifySignature(
    chainName: string,
    transferParams: TransferParams,
    signature: string,
    expectedSigner: string,
  ): boolean;
  generateMessageForSigning(chainName: string, params: any): string;
  executeGaslessTransfer(params: any): Promise<any>;
  getUserNonce(chainName: string, userAddress: string): Promise<bigint>;
  getSupportedChains(): string[];
  getChainInfo(chainName: string): ChainConfig;
  getSupportedTokens(chainName: string): Record<string, TokenInfo>;
  estimateGasCost(chainName: string, params: any): Promise<GasEstimate>;
}

export interface ILoggerService {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  logTransaction(type: string, data: any): void;
  logError(error: Error, context?: any): void;
  logRequest(req: any, res: any, responseTime: number): void;
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
  estimatedTimeMs?: number;
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
