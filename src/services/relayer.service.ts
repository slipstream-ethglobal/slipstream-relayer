import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IRelayerService,
  TransferParams,
  GasEstimate,
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
        tokenConfig.decimals,
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
      this.loggerService.logError(error as Error, {
        chainName,
        tokenSymbol,
        amount: amount.toString(),
      });
      throw new Error('Failed to calculate fee');
    }
  }

  async validateTransferParams(params: any): Promise<boolean> {
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

      if (deadline <= Math.floor(Date.now() / 1000)) {
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
          `Insufficient balance. Required: ${ethers.formatUnits(totalRequired, tokenConfig.decimals)}, Available: ${ethers.formatUnits(balance, tokenConfig.decimals)}`,
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
          `Insufficient allowance. Required: ${ethers.formatUnits(totalRequired, tokenConfig.decimals)}, Approved: ${ethers.formatUnits(allowance, tokenConfig.decimals)}`,
        );
      }

      return true;
    } catch (error) {
      this.loggerService.logError(error as Error, {
        chainName,
        from,
        to,
        tokenSymbol,
        amount,
      });
      throw error;
    }
  }

  async prepareTransferParams(params: any): Promise<TransferParams> {
    const { chainName, from, to, tokenSymbol, amount, signature, deadline } =
      params;

    try {
      // Get chain and token configuration
      const chainConfig = this.chainConfigService.getChainConfig(chainName);
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
      this.loggerService.logError(error as Error, {
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
      this.loggerService.logError(error as Error, {
        chainName,
        expectedSigner,
      });
      return false;
    }
  }

  generateMessageForSigning(chainName: string, params: any): string {
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

      const { messageHash } = this.contractManagerService.generateMessageHash(
        chainConfig.contractAddress,
        params.from,
        params.to,
        tokenConfig.address,
        transferAmount,
        fee,
        BigInt(params.nonce),
        BigInt(params.deadline),
      );

      return messageHash;
    } catch (error) {
      this.loggerService.logError(error as Error, { chainName, params });
      throw error;
    }
  }

  async executeGaslessTransfer(params: any): Promise<any> {
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

      this.loggerService.logTransaction('FAILED', {
        transactionId,
        error: (error as Error).message,
        executionTime,
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
      this.loggerService.logError(error as Error, { chainName, userAddress });
      throw error;
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

  async estimateGasCost(chainName: string, params: any): Promise<GasEstimate> {
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
      };
    } catch (error) {
      this.loggerService.logError(error as Error, { chainName, params });
      throw error;
    }
  }
}
