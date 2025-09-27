import { BigNumberish } from 'ethers';

/**
 * Contract struct types based on SlipstreamGaslessProxy ABI
 */

export interface GaslessTransactionRequest {
  fromAddress: string;
  toAddress: string;
  tokenContract: string;
  transferAmount: BigNumberish;
  relayerServiceFee: BigNumberish;
  transactionNonce: BigNumberish;
  expirationDeadline: BigNumberish;
}

export interface ERC2612PermitSignature {
  approvalValue: BigNumberish;
  permitDeadline: BigNumberish;
  signatureV: number;
  signatureR: string;
  signatureS: string;
}

/**
 * Contract function parameter types
 */
export interface ProcessStandardGaslessTransferParams {
  transactionRequest: GaslessTransactionRequest;
  userSignature: string;
}

export interface ProcessPermitBasedGaslessTransferParams {
  transactionRequest: GaslessTransactionRequest;
  userSignature: string;
  permitSignatureData: ERC2612PermitSignature;
}

export interface ProcessBatchStandardTransfersParams {
  transactionRequests: GaslessTransactionRequest[];
  userSignatures: string[];
}

export interface ProcessBatchPermitBasedTransfersParams {
  transactionRequests: GaslessTransactionRequest[];
  userSignatures: string[];
  permitSignatureDataList: ERC2612PermitSignature[];
}

/**
 * Contract event types
 */
export interface GaslessTokenTransferCompletedEvent {
  senderAddress: string;
  recipientAddress: string;
  tokenContractAddress: string;
  transferredAmount: BigNumberish;
  relayerCompensation: BigNumberish;
  executingRelayer: string;
  transactionNonce: BigNumberish;
}

export interface RelayerAuthorizationUpdatedEvent {
  relayerAddress: string;
  authorizationStatus: boolean;
}

export interface TokenSupportStatusUpdatedEvent {
  tokenAddress: string;
  supportStatus: boolean;
}

/**
 * Contract view function return types
 */
export interface ContractState {
  owner: string;
  paused: boolean;
  domainSeparator: string;
}

export interface RelayerInfo {
  isAuthorized: boolean;
  lastActivity: BigNumberish;
}

export interface TokenInfo {
  isSupported: boolean;
  lastActivity: BigNumberish;
}

/**
 * Contract error types
 */
export type ContractError =
  | 'ECDSAInvalidSignature'
  | 'ECDSAInvalidSignatureLength'
  | 'ECDSAInvalidSignatureS'
  | 'EnforcedPause'
  | 'ExpectedPause'
  | 'OwnableInvalidOwner'
  | 'OwnableUnauthorizedAccount'
  | 'ReentrancyGuardReentrantCall';

/**
 * Contract function names
 */
export type ContractFunctionName =
  | 'processStandardGaslessTransfer'
  | 'processPermitBasedGaslessTransfer'
  | 'processBatchStandardTransfers'
  | 'processBatchPermitBasedTransfers'
  | 'getCurrentUserNonce'
  | 'checkERC2612PermitSupport'
  | 'pauseContractOperations'
  | 'resumeContractOperations'
  | 'renounceOwnership'
  | 'transferOwnership'
  | 'addRelayer'
  | 'removeRelayer'
  | 'updateRelayerAuthorization'
  | 'addSupportedToken'
  | 'removeSupportedToken'
  | 'updateTokenSupportStatus'
  | 'owner'
  | 'paused'
  | 'CONTRACT_DOMAIN_SEPARATOR';

/**
 * Contract event names
 */
export type ContractEventName =
  | 'GaslessTokenTransferCompleted'
  | 'OwnershipTransferred'
  | 'Paused'
  | 'RelayerAuthorizationUpdated'
  | 'TokenSupportStatusUpdated'
  | 'Unpaused';
