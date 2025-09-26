import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { GasEstimate, TransferParams } from '../interfaces/relayer.interface';
import { ChainConfigService } from './chain-config.service';
import { ContractManagerService } from './contract-manager.service';
import { LoggerService } from './logger.service';

export interface GasEstimationOptions {
  gasMultiplier?: number; // Buffer multiplier (default: 1.2 for 20% buffer)
  maxGasPrice?: bigint; // Maximum gas price to use
  fallbackGasPrice?: bigint; // Fallback gas price if network call fails
}

export interface GasEstimationResult extends GasEstimate {
  gasLimit: string; // Gas limit with buffer applied
  gasPriceWei: string; // Gas price in wei
  gasCostWei: string; // Total cost in wei
  gasCostEth: string; // Total cost in ETH
  estimatedTimeMs?: number; // Time taken for estimation
}

@Injectable()
export class GasEstimationService {
  private readonly logger = new Logger(GasEstimationService.name);
  private readonly gasPriceCache = new Map<
    string,
    { price: bigint; timestamp: number }
  >();
  private readonly CACHE_DURATION_MS = 30000; // 30 seconds cache

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly contractManagerService: ContractManagerService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Estimates gas cost for a transfer operation
   */
  async estimateTransferGas(
    chainName: string,
    transferParams: TransferParams,
    options: GasEstimationOptions = {},
  ): Promise<GasEstimationResult> {
    const startTime = Date.now();

    try {
      this.loggerService.info('Starting gas estimation', {
        chainName,
        from: String(transferParams.from),
        to: String(transferParams.to),
        token: String(transferParams.token),
        amount: String(transferParams.amount),
      });

      // Get gas estimate from contract
      const gasEstimate = await this.getGasEstimate(chainName, transferParams);

      // Get current gas price
      const gasPrice = await this.getGasPrice(chainName, options);

      // Apply gas multiplier for buffer
      const gasMultiplier = options.gasMultiplier || 1.2;
      const gasLimit = BigInt(Math.ceil(Number(gasEstimate) * gasMultiplier));

      // Calculate costs
      const gasCost = gasEstimate * gasPrice;
      const gasCostWithBuffer = gasLimit * gasPrice;

      // Convert to ETH for display
      const gasCostEth = ethers.formatEther(gasCostWithBuffer);

      const result: GasEstimationResult = {
        gasEstimate: gasEstimate.toString(),
        gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
        gasCost: gasCost.toString(),
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPrice.toString(),
        gasCostWei: gasCostWithBuffer.toString(),
        gasCostEth,
        estimatedTimeMs: Date.now() - startTime,
      };

      this.loggerService.info('Gas estimation completed', {
        chainName,
        gasEstimate: result.gasEstimate,
        gasPrice: result.gasPrice,
        gasCost: result.gasCost,
        gasLimit: result.gasLimit,
        estimatedTimeMs: result.estimatedTimeMs,
      });

      return result;
    } catch (error) {
      this.loggerService.logError(error as Error, {
        chainName,
        transferParams: {
          from: String(transferParams.from),
          to: String(transferParams.to),
          token: String(transferParams.token),
          amount: String(transferParams.amount),
        },
      });
      throw error;
    }
  }

  /**
   * Gets gas estimate for a specific transfer operation
   */
  private async getGasEstimate(
    chainName: string,
    transferParams: TransferParams,
  ): Promise<bigint> {
    try {
      const contract = this.contractManagerService.getContractForGas(
        chainName,
        process.env.RELAYER_PRIVATE_KEY!,
      );
      const gasEstimate =
        await contract.executeTransfer.estimateGas(transferParams);

      this.logger.debug(
        `Gas estimate for ${chainName}: ${gasEstimate.toString()}`,
      );
      return gasEstimate;
    } catch (error) {
      this.logger.error(`Error estimating gas for ${chainName}:`, error);
      throw new Error(`Failed to estimate gas: ${(error as Error).message}`);
    }
  }

  /**
   * Gets current gas price with caching and fallback options
   */
  async getGasPrice(
    chainName: string,
    options: GasEstimationOptions = {},
  ): Promise<bigint> {
    const cacheKey = chainName;
    const now = Date.now();

    // Check cache first
    const cached = this.gasPriceCache.get(cacheKey);
    if (cached && now - cached.timestamp < this.CACHE_DURATION_MS) {
      this.logger.debug(
        `Using cached gas price for ${chainName}: ${ethers.formatUnits(
          cached.price,
          'gwei',
        )} gwei`,
      );
      return this.applyGasPriceLimits(cached.price, options);
    }

    try {
      // Fetch from network
      const provider = this.contractManagerService.getProviderForGas(chainName);
      const feeData = await provider.getFeeData();

      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

      if (!gasPrice) {
        throw new Error('No gas price data available from network');
      }

      // Cache the result
      this.gasPriceCache.set(cacheKey, { price: gasPrice, timestamp: now });

      this.logger.debug(
        `Fetched gas price for ${chainName}: ${ethers.formatUnits(
          gasPrice,
          'gwei',
        )} gwei`,
      );

      return this.applyGasPriceLimits(gasPrice, options);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch gas price for ${chainName}, using fallback:`,
        (error as Error).message,
      );

      // Use fallback gas price
      const fallbackPrice =
        options.fallbackGasPrice || ethers.parseUnits('20', 'gwei');
      return this.applyGasPriceLimits(fallbackPrice, options);
    }
  }

  /**
   * Applies gas price limits and constraints
   */
  private applyGasPriceLimits(
    gasPrice: bigint,
    options: GasEstimationOptions,
  ): bigint {
    // Apply maximum gas price limit
    if (options.maxGasPrice && gasPrice > options.maxGasPrice) {
      this.logger.warn(
        `Gas price ${ethers.formatUnits(
          gasPrice,
          'gwei',
        )} gwei exceeds maximum ${ethers.formatUnits(
          options.maxGasPrice,
          'gwei',
        )} gwei, using maximum`,
      );
      return options.maxGasPrice;
    }

    return gasPrice;
  }

  /**
   * Estimates gas for multiple operations and returns the most expensive
   */
  async estimateBatchGas(
    chainName: string,
    transferParamsList: TransferParams[],
    options: GasEstimationOptions = {},
  ): Promise<GasEstimationResult> {
    const startTime = Date.now();

    try {
      this.loggerService.info('Starting batch gas estimation', {
        chainName,
        operationCount: transferParamsList.length,
      });

      // Estimate gas for each operation
      const estimates = await Promise.all(
        transferParamsList.map((params) =>
          this.getGasEstimate(chainName, params),
        ),
      );

      // Find the maximum gas estimate
      const maxGasEstimate = estimates.reduce((max, current) =>
        current > max ? current : max,
      );

      // Get gas price once for all operations
      const gasPrice = await this.getGasPrice(chainName, options);

      // Apply multiplier
      const gasMultiplier = options.gasMultiplier || 1.2;
      const gasLimit = BigInt(
        Math.ceil(Number(maxGasEstimate) * gasMultiplier),
      );

      // Calculate costs
      const gasCost = maxGasEstimate * gasPrice;
      const gasCostWithBuffer = gasLimit * gasPrice;
      const gasCostEth = ethers.formatEther(gasCostWithBuffer);

      const result: GasEstimationResult = {
        gasEstimate: maxGasEstimate.toString(),
        gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
        gasCost: gasCost.toString(),
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPrice.toString(),
        gasCostWei: gasCostWithBuffer.toString(),
        gasCostEth,
        estimatedTimeMs: Date.now() - startTime,
      };

      this.loggerService.info('Batch gas estimation completed', {
        chainName,
        operationCount: transferParamsList.length,
        maxGasEstimate: result.gasEstimate,
        gasPrice: result.gasPrice,
        gasCost: result.gasCost,
      });

      return result;
    } catch (error) {
      this.loggerService.logError(error as Error, {
        chainName,
        operationCount: transferParamsList.length,
      });
      throw error;
    }
  }

  /**
   * Gets historical gas price data (if available)
   */
  getGasPriceHistory(
    chainName: string,
    _hours = 24,
  ): Array<{ timestamp: number; gasPrice: string }> {
    // This would typically integrate with a gas price oracle or historical data service
    // For now, return empty array as placeholder
    this.logger.warn(`Gas price history not implemented for ${chainName}`);
    return [];
  }

  /**
   * Clears gas price cache
   */
  clearCache(): void {
    this.gasPriceCache.clear();
    this.logger.debug('Gas price cache cleared');
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ chain: string; price: string; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.gasPriceCache.entries()).map(
      ([chain, data]) => ({
        chain,
        price: ethers.formatUnits(data.price, 'gwei'),
        age: now - data.timestamp,
      }),
    );

    return {
      size: this.gasPriceCache.size,
      entries,
    };
  }
}
