import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { getChainConfig } from '../config/chainConfig';

export class GasService {
  private static instance: GasService;
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();

  private constructor() {}

  public static getInstance(): GasService {
    if (!GasService.instance) {
      GasService.instance = new GasService();
    }
    return GasService.instance;
  }

  /**
   * Get provider for a specific chain
   */
  public getProvider(chainId: number): ethers.JsonRpcProvider {
    if (!this.providers.has(chainId)) {
      const chainConfig = getChainConfig(chainId);
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providers.set(chainId, provider);
    }
    return this.providers.get(chainId)!;
  }

  /**
   * Estimate gas for a transaction
   */
  public async estimateGas(
    chainId: number,
    contractAddress: string,
    data: string,
    from: string
  ): Promise<bigint> {
    try {
      const provider = this.getProvider(chainId);
      const chainConfig = getChainConfig(chainId);
      
      const gasEstimate = await provider.estimateGas({
        to: contractAddress,
        data,
        from
      });

      // Add 20% buffer to gas estimate
      const bufferedGas = (gasEstimate * 120n) / 100n;
      
      // Cap at max gas limit
      const maxGas = BigInt(chainConfig.gasSettings.gasLimit);
      const finalGas = bufferedGas > maxGas ? maxGas : bufferedGas;

      logger.info('Gas estimated', { 
        chainId, 
        estimated: gasEstimate.toString(), 
        buffered: bufferedGas.toString(),
        final: finalGas.toString() 
      });

      return finalGas;

    } catch (error) {
      logger.error('Error estimating gas', { chainId, contractAddress, error });
      // Return default gas limit as fallback
      const chainConfig = getChainConfig(chainId);
      return BigInt(chainConfig.gasSettings.gasLimit);
    }
  }

  /**
   * Get current gas prices
   */
  public async getGasPrices(chainId: number): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    try {
      const provider = this.getProvider(chainId);
      const chainConfig = getChainConfig(chainId);
      
      // Try to get EIP-1559 fee data
      try {
        const feeData = await provider.getFeeData();
        
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          // Add 10% buffer to current fees
          const bufferedMaxFee = (feeData.maxFeePerGas * 110n) / 100n;
          const bufferedPriorityFee = (feeData.maxPriorityFeePerGas * 110n) / 100n;
          
          return {
            maxFeePerGas: bufferedMaxFee,
            maxPriorityFeePerGas: bufferedPriorityFee
          };
        }
      } catch (eip1559Error) {
        logger.warn('EIP-1559 fee data not available, using fallback', { chainId });
      }

      // Fallback to configured values
      return {
        maxFeePerGas: BigInt(chainConfig.gasSettings.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(chainConfig.gasSettings.maxPriorityFeePerGas)
      };

    } catch (error) {
      logger.error('Error getting gas prices', { chainId, error });
      
      // Fallback to configured values
      const chainConfig = getChainConfig(chainId);
      return {
        maxFeePerGas: BigInt(chainConfig.gasSettings.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(chainConfig.gasSettings.maxPriorityFeePerGas)
      };
    }
  }

  /**
   * Calculate transaction cost in ETH
   */
  public async calculateTransactionCost(
    chainId: number,
    gasUsed: bigint,
    maxFeePerGas?: bigint
  ): Promise<bigint> {
    try {
      let feePerGas = maxFeePerGas;
      
      if (!feePerGas) {
        const gasPrices = await this.getGasPrices(chainId);
        feePerGas = gasPrices.maxFeePerGas;
      }

      return gasUsed * feePerGas;
    } catch (error) {
      logger.error('Error calculating transaction cost', { chainId, gasUsed, error });
      return 0n;
    }
  }

  /**
   * Check if gas price is reasonable
   */
  public async isGasPriceReasonable(chainId: number, maxFeePerGas: bigint): Promise<boolean> {
    try {
      const currentPrices = await this.getGasPrices(chainId);
      // Allow up to 50% higher than current market price
      const maxAllowed = (currentPrices.maxFeePerGas * 150n) / 100n;
      return maxFeePerGas <= maxAllowed;
    } catch (error) {
      logger.error('Error checking gas price reasonableness', { chainId, maxFeePerGas, error });
      return true; // Default to true if we can't check
    }
  }

  /**
   * Get network status
   */
  public async getNetworkStatus(chainId: number): Promise<{
    isHealthy: boolean;
    latestBlock: number;
    gasPrice: string;
  }> {
    try {
      const provider = this.getProvider(chainId);
      const [latestBlock, gasPrices] = await Promise.all([
        provider.getBlockNumber(),
        this.getGasPrices(chainId)
      ]);

      return {
        isHealthy: true,
        latestBlock,
        gasPrice: gasPrices.maxFeePerGas.toString()
      };
    } catch (error) {
      logger.error('Error getting network status', { chainId, error });
      return {
        isHealthy: false,
        latestBlock: 0,
        gasPrice: '0'
      };
    }
  }
}