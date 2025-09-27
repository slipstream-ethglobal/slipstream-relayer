import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';

interface RelayerError extends Error {
  chainName?: string;
  from?: string;
  to?: string;
  tokenSymbol?: string;
  amount?: string;
  signature?: string;
}
import {
  IRelayerService,
  TransferParams,
  GasEstimate,
  GaslessTransactionRequest,
  ERC2612PermitSignature,
  GaslessTransferResult,
  BatchTransferResult,
  GaslessTransferParams,
  BatchTransferParams,
} from '../interfaces/relayer.interface';
import { ChainConfigService } from './chain-config.service';
import { ContractManagerService } from './contract-manager.service';
import { LoggerService } from './logger.service';
import { GasEstimationService } from './gas-estimation.service';

@Injectable()
export class RelayerService implements IRelayerService {
  private readonly logger = new Logger(RelayerService.name);
  private readonly processedTransactions = new Set<string>();

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly contractManagerService: ContractManagerService,
    private readonly loggerService: LoggerService,
    private readonly gasEstimationService: GasEstimationService,
  ) {
    this.logger.log('RelayerService initialized');
  }

  calculateFee(chainName: string, amount: bigint, tokenSymbol: string): bigint {
    try {
      const chainConfig = this.chainConfigService.getChainConfig(chainName);
      const tokenConfig = this.chainConfigService.getTokenConfig(
        chainName,
        tokenSymbol,
      );
      const feeSettings = chainConfig.feeSettings;

      // Calculate percentage-based fee
      const percentageFee =
        (amount * BigInt(feeSettings.baseFeeBps)) / BigInt(10000);

      // Calculate minimum fee in token units
      const minFeeUsd = feeSettings.minFeeUsd;
      const minFeeTokens = ethers.parseUnits(
        minFeeUsd.toString(),
        parseInt(tokenConfig.decimals),
      );

      // Use the higher of percentage fee or minimum fee
      const calculatedFee =
        percentageFee > minFeeTokens ? percentageFee : minFeeTokens;

      // Ensure fee doesn't exceed maximum allowed by contract
      const maxFeeAllowed =
        (amount * BigInt(feeSettings.maxFeeBps)) / BigInt(10000);
      const finalFee =
        calculatedFee > maxFeeAllowed ? maxFeeAllowed : calculatedFee;

      this.loggerService.info('Fee calculated', {
        chainName,
        tokenSymbol,
        amount: amount.toString(),
        percentageFee: percentageFee.toString(),
        minFeeTokens: minFeeTokens.toString(),
        finalFee: finalFee.toString(),
      });

      return finalFee;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        tokenSymbol,
        amount: amount.toString(),
      });
      throw new Error('Failed to calculate fee');
    }
  }

  async validateTransferParams(
    params: GaslessTransferParams,
  ): Promise<boolean> {
    const { chainName, from, to, tokenSymbol, amount, deadline } = params;

    try {
      // Basic validation
      if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
        throw new Error('Invalid address format');
      }

      if (from.toLowerCase() === to.toLowerCase()) {
        throw new Error('Cannot send to same address');
      }

      if (!amount || BigInt(amount) <= 0) {
        throw new Error('Invalid amount');
      }

      if (parseInt(deadline) <= Math.floor(Date.now() / 1000)) {
        throw new Error('Transaction deadline has passed');
      }

      // Check if chain and token are supported
      const chainConfig = this.chainConfigService.getChainConfig(chainName);
      const tokenConfig = this.chainConfigService.getTokenConfig(
        chainName,
        tokenSymbol,
      );

      // Check token balance
      const balance = await this.contractManagerService.getTokenBalance(
        chainName,
        tokenConfig.address,
        from,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      const transferAmount = BigInt(amount);
      const fee = this.calculateFee(chainName, transferAmount, tokenSymbol);
      const totalRequired = transferAmount + fee;

      if (balance < totalRequired) {
        throw new Error(
          `Insufficient balance. Required: ${ethers.formatUnits(totalRequired, parseInt(tokenConfig.decimals))}, Available: ${ethers.formatUnits(balance, parseInt(tokenConfig.decimals))}`,
        );
      }

      // Check token allowance
      const allowance = await this.contractManagerService.checkTokenAllowance(
        chainName,
        tokenConfig.address,
        from,
        chainConfig.contractAddress,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      if (allowance < totalRequired) {
        throw new Error(
          `Insufficient allowance. Required: ${ethers.formatUnits(totalRequired, parseInt(tokenConfig.decimals))}, Approved: ${ethers.formatUnits(allowance, parseInt(tokenConfig.decimals))}`,
        );
      }

      return true;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        from,
        to,
        tokenSymbol,
        amount,
      });
      throw error;
    }
  }

  async prepareGaslessTransactionRequest(
    params: GaslessTransferParams,
  ): Promise<GaslessTransactionRequest> {
    const { chainName, from, to, tokenSymbol, amount, deadline } = params;

    try {
      // Get token configuration
      const tokenConfig = this.chainConfigService.getTokenConfig(
        chainName,
        tokenSymbol,
      );

      // Get current nonce
      const nonce = await this.contractManagerService.getCurrentUserNonce(
        chainName,
        from,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      // Calculate fee
      const transferAmount = BigInt(amount);
      const fee = this.calculateFee(chainName, transferAmount, tokenSymbol);

      // Create gasless transaction request matching new contract structure
      const transactionRequest: GaslessTransactionRequest = {
        fromAddress: from,
        toAddress: to,
        tokenContract: tokenConfig.address,
        transferAmount: transferAmount,
        relayerServiceFee: fee,
        transactionNonce: nonce,
        expirationDeadline: BigInt(deadline),
      };

      this.loggerService.info('Gasless transaction request prepared:', {
        chainName,
        fromAddress: transactionRequest.fromAddress,
        toAddress: transactionRequest.toAddress,
        tokenContract: transactionRequest.tokenContract,
        transferAmount: transactionRequest.transferAmount.toString(),
        relayerServiceFee: transactionRequest.relayerServiceFee.toString(),
        transactionNonce: transactionRequest.transactionNonce.toString(),
        expirationDeadline: transactionRequest.expirationDeadline.toString(),
      });

      return transactionRequest;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        from,
        to,
        tokenSymbol,
        amount,
      });
      throw error;
    }
  }

  async prepareTransferParams(
    params: GaslessTransferParams,
  ): Promise<TransferParams> {
    const { chainName, from, to, tokenSymbol, amount, signature, deadline } =
      params;

    try {
      // Get token configuration
      const tokenConfig = this.chainConfigService.getTokenConfig(
        chainName,
        tokenSymbol,
      );

      // Get current nonce
      const nonce = await this.contractManagerService.getNonce(
        chainName,
        from,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      // Calculate fee
      const transferAmount = BigInt(amount);
      const fee = this.calculateFee(chainName, transferAmount, tokenSymbol);

      // Create transfer parameters matching contract structure
      const transferParams: TransferParams = {
        from: from,
        to: to,
        token: tokenConfig.address,
        amount: transferAmount,
        fee: fee,
        nonce: nonce,
        deadline: BigInt(deadline),
        signature: signature,
      };

      this.loggerService.info('Transfer parameters prepared:', {
        chainName,
        from,
        to,
        token: tokenConfig.address,
        amount: transferParams.amount.toString(),
        fee: transferParams.fee.toString(),
        nonce: transferParams.nonce.toString(),
        deadline: transferParams.deadline.toString(),
      });

      return transferParams;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        from,
        to,
        tokenSymbol,
        amount,
      });
      throw error;
    }
  }

  verifySignature(
    chainName: string,
    transferParams: TransferParams,
    signature: string,
    expectedSigner: string,
  ): boolean {
    try {
      const chainConfig = this.chainConfigService.getChainConfig(chainName);

      // Generate message hash exactly as contract does
      const { messageHash } = this.contractManagerService.generateMessageHash(
        chainConfig.contractAddress,
        transferParams.from,
        transferParams.to,
        transferParams.token,
        transferParams.amount,
        transferParams.fee,
        transferParams.nonce,
        transferParams.deadline,
      );

      // Verify signature
      const isValid = this.contractManagerService.verifySignature(
        messageHash,
        signature,
        expectedSigner,
      );

      this.loggerService.info('Signature verification result:', {
        isValid,
        expectedSigner,
        messageHash,
      });

      return isValid;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        expectedSigner,
      });
      return false;
    }
  }

  async generateMessageForSigning(
    chainName: string,
    params: GaslessTransferParams,
  ): Promise<string> {
    try {
      const chainConfig = this.chainConfigService.getChainConfig(chainName);
      const tokenConfig = this.chainConfigService.getTokenConfig(
        chainName,
        params.tokenSymbol,
      );

      const transferAmount = BigInt(params.amount);
      const fee = this.calculateFee(
        chainName,
        transferAmount,
        params.tokenSymbol,
      );

      // Get current nonce for the user
      const nonce = await this.contractManagerService.getCurrentUserNonce(
        chainName,
        params.from,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      const { messageHash } = this.contractManagerService.generateMessageHash(
        chainConfig.contractAddress,
        params.from,
        params.to,
        tokenConfig.address,
        transferAmount,
        fee,
        nonce,
        BigInt(params.deadline),
      );

      return messageHash;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });
      throw error;
    }
  }

  async executeGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult> {
    const startTime = Date.now();
    const transactionId = `${params.chainName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      this.loggerService.logTransaction('INITIATED', {
        transactionId,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });

      // Validate parameters
      await this.validateTransferParams(params);

      // Prepare transfer parameters
      const transferParams = await this.prepareTransferParams(params);

      // Verify signature
      const isValidSignature = this.verifySignature(
        params.chainName,
        transferParams,
        params.signature,
        params.from,
      );

      if (!isValidSignature) {
        throw new Error('Invalid signature provided');
      }

      // Check for duplicate transaction
      const txKey = `${params.from}-${params.to}-${params.amount}-${transferParams.nonce}`;
      if (this.processedTransactions.has(txKey)) {
        throw new Error('Transaction already processed');
      }

      // Execute the transfer
      const result = await this.contractManagerService.executeTransfer(
        params.chainName,
        transferParams,
        process.env.RELAYER_PRIVATE_KEY!,
      );

      // Mark as processed
      this.processedTransactions.add(txKey);

      const executionTime = Date.now() - startTime;

      this.loggerService.logTransaction('SUCCESS', {
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        executionTime,
        fee: transferParams.fee.toString(),
      });

      return {
        success: true,
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        explorerUrl: result.explorerUrl,
        fee: transferParams.fee.toString(),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const relayerError = error as RelayerError;

      this.loggerService.logTransaction('FAILED', {
        transactionId,
        error: relayerError.message,
        executionTime,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });

      throw error;
    }
  }

  async processStandardGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult> {
    const startTime = Date.now();
    const transactionId = `${params.chainName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      this.loggerService.logTransaction('INITIATED', {
        transactionId,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
        transferType: 'standard-gasless',
      });

      // Validate parameters
      await this.validateTransferParams(params);

      // Prepare gasless transaction request
      const transactionRequest =
        await this.prepareGaslessTransactionRequest(params);

      // Verify signature
      const isValidSignature = this.verifySignature(
        params.chainName,
        {
          from: transactionRequest.fromAddress,
          to: transactionRequest.toAddress,
          token: transactionRequest.tokenContract,
          amount: transactionRequest.transferAmount,
          fee: transactionRequest.relayerServiceFee,
          nonce: transactionRequest.transactionNonce,
          deadline: transactionRequest.expirationDeadline,
          signature: params.signature,
        },
        params.signature,
        params.from,
      );

      if (!isValidSignature) {
        throw new Error('Invalid signature provided');
      }

      // Check for duplicate transaction
      const txKey = `${params.from}-${params.to}-${params.amount}-${transactionRequest.transactionNonce}`;
      if (this.processedTransactions.has(txKey)) {
        throw new Error('Transaction already processed');
      }

      // Execute the gasless transfer
      const result =
        await this.contractManagerService.processStandardGaslessTransfer(
          params.chainName,
          {
            transactionRequest,
            userSignature: params.signature,
          },
          process.env.RELAYER_PRIVATE_KEY!,
        );

      // Mark as processed
      this.processedTransactions.add(txKey);

      const executionTime = Date.now() - startTime;

      this.loggerService.logTransaction('SUCCESS', {
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        explorerUrl: result.explorerUrl,
        fee: transactionRequest.relayerServiceFee.toString(),
        executionTime,
      });

      return {
        success: true,
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        explorerUrl: result.explorerUrl,
        fee: transactionRequest.relayerServiceFee.toString(),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const relayerError = error as RelayerError;

      this.loggerService.logTransaction('FAILED', {
        transactionId,
        error: relayerError.message,
        executionTime,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });

      throw error;
    }
  }

  async processPermitBasedGaslessTransfer(
    params: GaslessTransferParams,
  ): Promise<GaslessTransferResult> {
    const startTime = Date.now();
    const transactionId = `${params.chainName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      this.loggerService.logTransaction('INITIATED', {
        transactionId,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
        transferType: 'permit-based-gasless',
      });

      // Validate parameters
      await this.validateTransferParams(params);

      // Check if token supports ERC2612 permit
      const tokenConfig = this.chainConfigService.getTokenConfig(
        params.chainName,
        params.tokenSymbol,
      );
      const supportsPermit =
        await this.contractManagerService.checkERC2612PermitSupport(
          params.chainName,
          tokenConfig.address,
          process.env.RELAYER_PRIVATE_KEY!,
        );

      if (!supportsPermit) {
        throw new Error('Token does not support ERC2612 permit functionality');
      }

      // Prepare gasless transaction request
      const transactionRequest =
        await this.prepareGaslessTransactionRequest(params);

      // Verify signature
      const isValidSignature = this.verifySignature(
        params.chainName,
        {
          from: transactionRequest.fromAddress,
          to: transactionRequest.toAddress,
          token: transactionRequest.tokenContract,
          amount: transactionRequest.transferAmount,
          fee: transactionRequest.relayerServiceFee,
          nonce: transactionRequest.transactionNonce,
          deadline: transactionRequest.expirationDeadline,
          signature: params.signature,
        },
        params.signature,
        params.from,
      );

      if (!isValidSignature) {
        throw new Error('Invalid signature provided');
      }

      // Check for duplicate transaction
      const txKey = `${params.from}-${params.to}-${params.amount}-${transactionRequest.transactionNonce}`;
      if (this.processedTransactions.has(txKey)) {
        throw new Error('Transaction already processed');
      }

      // Prepare permit signature
      const permitSignature: ERC2612PermitSignature = {
        approvalValue: transactionRequest.transferAmount,
        permitDeadline: transactionRequest.expirationDeadline,
        signatureV: params.permitSignatureV || 0,
        signatureR: params.permitSignatureR || '0x',
        signatureS: params.permitSignatureS || '0x',
      };

      // Execute the permit-based gasless transfer
      const result =
        await this.contractManagerService.processPermitBasedGaslessTransfer(
          params.chainName,
          {
            transactionRequest,
            userSignature: params.signature,
            permitSignatureData: permitSignature,
          },
          process.env.RELAYER_PRIVATE_KEY!,
        );

      // Mark as processed
      this.processedTransactions.add(txKey);

      const executionTime = Date.now() - startTime;

      this.loggerService.logTransaction('SUCCESS', {
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        explorerUrl: result.explorerUrl,
        fee: transactionRequest.relayerServiceFee.toString(),
        executionTime,
      });

      return {
        success: true,
        transactionId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        explorerUrl: result.explorerUrl,
        fee: transactionRequest.relayerServiceFee.toString(),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const relayerError = error as RelayerError;

      this.loggerService.logTransaction('FAILED', {
        transactionId,
        error: relayerError.message,
        executionTime,
        chainName: params.chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });

      throw error;
    }
  }

  async getUserNonce(chainName: string, userAddress: string): Promise<bigint> {
    try {
      const nonce = await this.contractManagerService.getNonce(
        chainName,
        userAddress,
        process.env.RELAYER_PRIVATE_KEY!,
      );
      return nonce;
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, { chainName, userAddress });
      throw error;
    }
  }

  async checkERC2612PermitSupport(
    chainName: string,
    tokenAddress: string,
  ): Promise<boolean> {
    try {
      return await this.contractManagerService.checkERC2612PermitSupport(
        chainName,
        tokenAddress,
        process.env.RELAYER_PRIVATE_KEY!,
      );
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, { chainName, tokenAddress });
      return false;
    }
  }

  getSupportedChains(): string[] {
    return this.chainConfigService.getSupportedChains();
  }

  getChainInfo(chainName: string) {
    return this.chainConfigService.getChainConfig(chainName);
  }

  getSupportedTokens(chainName: string) {
    const chainConfig = this.chainConfigService.getChainConfig(chainName);
    return chainConfig.tokens;
  }

  async estimateGasCost(
    chainName: string,
    params: GaslessTransferParams,
  ): Promise<GasEstimate> {
    try {
      const transferParams = await this.prepareTransferParams(params);
      const gasEstimation = await this.gasEstimationService.estimateTransferGas(
        chainName,
        transferParams,
      );

      // Return in the expected format for backward compatibility
      return {
        gasEstimate: gasEstimation.gasEstimate,
        gasPrice: gasEstimation.gasPrice,
        gasCost: gasEstimation.gasCost,
        gasLimit: gasEstimation.gasLimit,
        gasPriceWei: gasEstimation.gasPriceWei,
        gasCostWei: gasEstimation.gasCostWei,
        gasCostEth: gasEstimation.gasCostEth,
        estimatedTimeMs: gasEstimation.estimatedTimeMs,
      };
    } catch (error) {
      const relayerError = error as RelayerError;
      this.loggerService.logError(relayerError, {
        chainName,
        from: params.from,
        to: params.to,
        tokenSymbol: params.tokenSymbol,
        amount: params.amount,
      });
      throw error;
    }
  }

  // Batch transfer methods
  processBatchStandardTransfers(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: BatchTransferParams,
  ): Promise<BatchTransferResult> {
    // Implementation for batch standard transfers
    throw new Error('Batch standard transfers not implemented yet');
  }

  processBatchPermitBasedTransfers(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: BatchTransferParams,
  ): Promise<BatchTransferResult> {
    // Implementation for batch permit-based transfers
    throw new Error('Batch permit-based transfers not implemented yet');
  }
}
