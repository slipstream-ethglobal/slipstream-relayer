import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { config } from '../config';
import { 
  GaslessTransactionRequest,
  ERC2612PermitSignature,
  RelayRequest, 
  BatchRelayRequest,
  RelayResponse, 
  FeeEstimateRequest, 
  FeeEstimateResponse,
  TransactionStatus,
  EIP712Domain,
  GASLESS_TRANSFER_TYPES,
  GaslessTransferData
} from '../types';
import { getChainConfig, getTokenConfig } from '../config/chainConfig';
import { pythPriceService } from './pythPriceService';
import SlipstreamGaslessProxyABI from '../contracts/SlipstreamGaslessProxy.abi.json';

// ERC20 ABI for token interactions
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

export class RelayerService {
  private static instance: RelayerService;
  private wallet: ethers.Wallet;
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();
  private contracts: Map<number, ethers.Contract> = new Map();
  private processedTransactions: Set<string> = new Set();

  private constructor() {
    if (!config.RELAYER_PRIVATE_KEY) {
      throw new Error('RELAYER_PRIVATE_KEY is required');
    }
    
    this.wallet = new ethers.Wallet(config.RELAYER_PRIVATE_KEY);
    this.initializeProvidersAndContracts();
    
    logger.info('RelayerService initialized', { 
      relayerAddress: this.wallet.address 
    });
  }

  public static getInstance(): RelayerService {
    if (!RelayerService.instance) {
      RelayerService.instance = new RelayerService();
    }
    return RelayerService.instance;
  }

  /**
   * Initialize providers and contracts for all supported chains
   */
  private initializeProvidersAndContracts(): void {
    const chains = [5920, 84532, 421614]; // Kadena, Base, Arbitrum
    
    for (const chainId of chains) {
      try {
        const chainConfig = getChainConfig(chainId);
        if (chainConfig && chainConfig.gaslessContract) {
          // Initialize provider
          const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
          this.providers.set(chainId, provider);
          
          // Initialize contract with connected wallet
          const connectedWallet = this.wallet.connect(provider);
          const contract = new ethers.Contract(
            chainConfig.gaslessContract,
            SlipstreamGaslessProxyABI,
            connectedWallet
          );
          this.contracts.set(chainId, contract);
          
          logger.info(`Initialized provider and contract for ${chainConfig.name}`, {
            chainId,
            contractAddress: chainConfig.gaslessContract
          });
        }
      } catch (error) {
        logger.error(`Failed to initialize chain ${chainId}`, { error });
      }
    }
  }

  /**
   * Get contract for specific chain
   */
  private getContract(chainId: number): ethers.Contract {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Contract not initialized for chain ${chainId}`);
    }
    return contract;
  }

  /**
   * Get provider for specific chain
   */
  private getProvider(chainId: number): ethers.JsonRpcProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`Provider not initialized for chain ${chainId}`);
    }
    return provider;
  }

  /**
   * Calculate fee for a transfer
   */
  public async calculateFee(request: FeeEstimateRequest): Promise<FeeEstimateResponse> {
    try {
      const { chainId, tokenSymbol, amount } = request;
      
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) {
        return {
          success: false,
          fee: '0',
          feeUsd: '0',
          message: `Unsupported chain: ${chainId}`
        };
      }

      const tokenConfig = getTokenConfig(chainId, tokenSymbol);
      if (!tokenConfig) {
        return {
          success: false,
          fee: '0',
          feeUsd: '0',
          message: `Unsupported token: ${tokenSymbol} on chain ${chainId}`
        };
      }
      
      const amountBN = BigInt(amount);
      
      // Calculate percentage-based fee
      const percentageFee = (amountBN * BigInt(chainConfig.feeSettings.baseFeeBps)) / BigInt(10000);
      
      // Calculate minimum fee in token units
      const minFeeUsd = chainConfig.feeSettings.minFeeUsd;
      let minFeeTokens = '0';
      
      if (tokenConfig.priceId) {
        try {
          minFeeTokens = await pythPriceService.convertFromUsd(
            minFeeUsd,
            tokenConfig.decimals,
            tokenConfig.symbol,
            tokenConfig.priceId
          );
        } catch (error) {
          logger.warn('Failed to get price data, using percentage fee', { tokenSymbol, error });
        }
      }
      
      const minFeeTokensBN = BigInt(minFeeTokens);
      
      // Use the higher of percentage fee or minimum fee
      const calculatedFee = percentageFee > minFeeTokensBN ? percentageFee : minFeeTokensBN;
      
      // Ensure fee doesn't exceed maximum allowed
      const maxFeeAllowed = (amountBN * BigInt(chainConfig.feeSettings.maxFeeBps)) / BigInt(10000);
      const finalFee = calculatedFee > maxFeeAllowed ? maxFeeAllowed : calculatedFee;

      // Convert fee to USD for display
      let feeUsd = '0';
      if (tokenConfig.priceId) {
        try {
          feeUsd = await pythPriceService.convertToUsd(
            finalFee.toString(),
            tokenConfig.decimals,
            tokenConfig.symbol,
            tokenConfig.priceId
          );
        } catch (error) {
          logger.warn('Failed to convert fee to USD', { tokenSymbol, error });
        }
      }

      logger.info('Fee calculated', {
        chainId,
        tokenSymbol,
        amount,
        percentageFee: percentageFee.toString(),
        minFeeTokens,
        finalFee: finalFee.toString(),
        feeUsd
      });

      return {
        success: true,
        fee: finalFee.toString(),
        feeUsd
      };

    } catch (error) {
      logger.error('Error calculating fee', { request, error });
      return {
        success: false,
        fee: '0',
        feeUsd: '0',
        message: 'Error calculating fee'
      };
    }
  }

  /**
   * Verify EIP-712 signature for new contract
   */
  private async verifySignature(request: RelayRequest): Promise<boolean> {
    try {
      const chainConfig = getChainConfig(request.chainId);
      if (!chainConfig) return false;
      
      // Create EIP-712 domain for SlipstreamGaslessProxy
      const domain: EIP712Domain = {
        name: 'SlipstreamGaslessProxy',
        version: '1',
        chainId: request.chainId,
        verifyingContract: chainConfig.gaslessContract
      };

      // Create transfer data matching the new contract structure
      const transferData: GaslessTransferData = {
        from: request.request.fromAddress,
        to: request.request.toAddress,
        token: request.request.tokenContract,
        amount: request.request.transferAmount,
        relayerFee: request.request.relayerServiceFee,
        nonce: request.request.transactionNonce,
        deadline: parseInt(request.request.expirationDeadline)
      };

      // Verify signature using the new type structure
      const recoveredAddress = ethers.verifyTypedData(
        domain,
        GASLESS_TRANSFER_TYPES,
        transferData,
        request.signature
      );

      const isValid = recoveredAddress.toLowerCase() === request.request.fromAddress.toLowerCase();
      
      logger.info('Signature verification', {
        from: request.request.fromAddress,
        recovered: recoveredAddress,
        isValid
      });

      return isValid;

    } catch (error) {
      logger.error('Error verifying signature', { request: request.request.fromAddress, error });
      return false;
    }
  }

  /**
   * Check if transaction has already been processed
   */
  private async checkReplayProtection(request: RelayRequest): Promise<boolean> {
    try {
      // Check in-memory cache first
      const txKey = `${request.chainId}:${request.request.fromAddress}:${request.request.transactionNonce}`;
      if (this.processedTransactions.has(txKey)) {
        return false;
      }

      // Check on-chain nonce
      const contract = this.getContract(request.chainId);
      const currentNonce = await contract.getCurrentUserNonce(request.request.fromAddress);
      const expectedNonce = BigInt(request.request.transactionNonce);
      
      return currentNonce === expectedNonce;

    } catch (error) {
      logger.error('Error checking replay protection', { request: request.request.fromAddress, error });
      return false;
    }
  }

  /**
   * Execute standard gasless transfer (requires pre-approved allowance)
   */
  public async relayStandardTransfer(request: RelayRequest): Promise<RelayResponse> {
    const startTime = Date.now();
    
    try {
      const { chainId } = request;
      const { fromAddress, toAddress, tokenContract, transferAmount, relayerServiceFee, transactionNonce, expirationDeadline } = request.request;
      
      logger.info('Processing standard gasless transfer', {
        chainId,
        fromAddress,
        toAddress,
        tokenContract,
        transferAmount,
        relayerServiceFee,
        transactionNonce
      });

      // Get configurations
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) {
        return {
          success: false,
          message: `Unsupported chain: ${chainId}`
        };
      }

      // Verify signature
      if (!await this.verifySignature(request)) {
        return {
          success: false,
          message: 'Invalid signature'
        };
      }

      // Check replay protection
      if (!await this.checkReplayProtection(request)) {
        return {
          success: false,
          message: 'Transaction already processed or invalid nonce'
        };
      }

      // Check deadline
      const now = Math.floor(Date.now() / 1000);
      const deadline = parseInt(expirationDeadline);
      if (deadline <= now) {
        return {
          success: false,
          message: 'Transaction deadline expired'
        };
      }

      // Execute the transaction using new contract method
      const contract = this.getContract(chainId);
      
      // Estimate gas
      const gasEstimate = await contract.processStandardGaslessTransfer.estimateGas(
        {
          fromAddress,
          toAddress,
          tokenContract,
          transferAmount,
          relayerServiceFee,
          transactionNonce,
          expirationDeadline
        },
        request.signature
      );

      // Execute transaction
      const tx = await contract.processStandardGaslessTransfer(
        {
          fromAddress,
          toAddress,
          tokenContract,
          transferAmount,
          relayerServiceFee,
          transactionNonce,
          expirationDeadline
        },
        request.signature,
        {
          gasLimit: gasEstimate
        }
      );

      // Mark as processed to prevent replay
      const txKey = `${chainId}:${fromAddress}:${transactionNonce}`;
      this.processedTransactions.add(txKey);

      logger.info('Standard gasless transfer submitted successfully', {
        hash: tx.hash,
        chainId,
        fromAddress,
        toAddress,
        transferAmount,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        transactionHash: tx.hash,
        message: 'Transaction submitted successfully',
        estimatedConfirmationTime: 30
      };

    } catch (error: any) {
      logger.error('Error processing standard gasless transfer', { 
        request: { chainId: request.chainId, fromAddress: request.request.fromAddress },
        error: error.message,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        message: error.message || 'Failed to process transaction'
      };
    }
  }

  /**
   * Execute permit-based gasless transfer (completely gasless for user)
   */
  public async relayPermitTransfer(request: RelayRequest): Promise<RelayResponse> {
    const startTime = Date.now();
    
    try {
      const { chainId } = request;
      const { fromAddress, toAddress, tokenContract, transferAmount, relayerServiceFee, transactionNonce, expirationDeadline } = request.request;
      
      if (!request.permit) {
        return {
          success: false,
          message: 'Permit data required for permit-based transfer'
        };
      }

      logger.info('Processing permit-based gasless transfer', {
        chainId,
        fromAddress,
        toAddress,
        tokenContract,
        transferAmount,
        relayerServiceFee,
        transactionNonce
      });

      // Get configurations
      const chainConfig = getChainConfig(chainId);
      if (!chainConfig) {
        return {
          success: false,
          message: `Unsupported chain: ${chainId}`
        };
      }

      // Verify signature
      if (!await this.verifySignature(request)) {
        return {
          success: false,
          message: 'Invalid signature'
        };
      }

      // Check replay protection
      if (!await this.checkReplayProtection(request)) {
        return {
          success: false,
          message: 'Transaction already processed or invalid nonce'
        };
      }

      // Check deadline
      const now = Math.floor(Date.now() / 1000);
      const deadline = parseInt(expirationDeadline);
      if (deadline <= now) {
        return {
          success: false,
          message: 'Transaction deadline expired'
        };
      }

      // Execute the transaction using new contract method
      const contract = this.getContract(chainId);
      
      // Prepare permit signature data
      const permitData = {
        approvalValue: request.permit.approvalValue,
        permitDeadline: request.permit.permitDeadline,
        signatureV: request.permit.signatureV,
        signatureR: request.permit.signatureR,
        signatureS: request.permit.signatureS
      };

      // Estimate gas
      const gasEstimate = await contract.processPermitBasedGaslessTransfer.estimateGas(
        {
          fromAddress,
          toAddress,
          tokenContract,
          transferAmount,
          relayerServiceFee,
          transactionNonce,
          expirationDeadline
        },
        request.signature,
        permitData
      );

      // Execute transaction
      const tx = await contract.processPermitBasedGaslessTransfer(
        {
          fromAddress,
          toAddress,
          tokenContract,
          transferAmount,
          relayerServiceFee,
          transactionNonce,
          expirationDeadline
        },
        request.signature,
        permitData,
        {
          gasLimit: gasEstimate
        }
      );

      // Mark as processed to prevent replay
      const txKey = `${chainId}:${fromAddress}:${transactionNonce}`;
      this.processedTransactions.add(txKey);

      logger.info('Permit-based gasless transfer submitted successfully', {
        hash: tx.hash,
        chainId,
        fromAddress,
        toAddress,
        transferAmount,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        transactionHash: tx.hash,
        message: 'Transaction submitted successfully',
        estimatedConfirmationTime: 30
      };

    } catch (error: any) {
      logger.error('Error processing permit-based gasless transfer', { 
        request: { chainId: request.chainId, fromAddress: request.request.fromAddress },
        error: error.message,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        message: error.message || 'Failed to process transaction'
      };
    }
  }

  /**
   * Execute batch standard transfers
   */
  public async relayBatchStandardTransfers(batchRequest: BatchRelayRequest): Promise<RelayResponse> {
    try {
      if (batchRequest.requests.length !== batchRequest.signatures.length) {
        return {
          success: false,
          message: 'Requests and signatures length mismatch'
        };
      }

      if (batchRequest.requests.length > 10) {
        return {
          success: false,
          message: 'Too many transfers in batch (max 10)'
        };
      }

      const contract = this.getContract(batchRequest.chainId);

      // Execute batch transfer
      const tx = await contract.processBatchStandardTransfers(
        batchRequest.requests,
        batchRequest.signatures
      );

      logger.info('Batch standard transfers submitted successfully', {
        hash: tx.hash,
        chainId: batchRequest.chainId,
        batchSize: batchRequest.requests.length
      });

      return {
        success: true,
        transactionHash: tx.hash,
        message: 'Batch transaction submitted successfully',
        estimatedConfirmationTime: 30
      };

    } catch (error: any) {
      logger.error('Error processing batch standard transfers', { 
        chainId: batchRequest.chainId,
        error: error.message
      });

      return {
        success: false,
        message: error.message || 'Failed to process batch transaction'
      };
    }
  }

  /**
   * Execute batch permit-based transfers
   */
  public async relayBatchPermitTransfers(batchRequest: BatchRelayRequest): Promise<RelayResponse> {
    try {
      if (!batchRequest.permits || 
          batchRequest.requests.length !== batchRequest.signatures.length ||
          batchRequest.requests.length !== batchRequest.permits.length) {
        return {
          success: false,
          message: 'Requests, signatures, and permits length mismatch'
        };
      }

      if (batchRequest.requests.length > 10) {
        return {
          success: false,
          message: 'Too many transfers in batch (max 10)'
        };
      }

      const contract = this.getContract(batchRequest.chainId);

      // Execute batch permit transfer
      const tx = await contract.processBatchPermitBasedTransfers(
        batchRequest.requests,
        batchRequest.signatures,
        batchRequest.permits
      );

      logger.info('Batch permit transfers submitted successfully', {
        hash: tx.hash,
        chainId: batchRequest.chainId,
        batchSize: batchRequest.requests.length
      });

      return {
        success: true,
        transactionHash: tx.hash,
        message: 'Batch transaction submitted successfully',
        estimatedConfirmationTime: 30
      };

    } catch (error: any) {
      logger.error('Error processing batch permit transfers', { 
        chainId: batchRequest.chainId,
        error: error.message
      });

      return {
        success: false,
        message: error.message || 'Failed to process batch transaction'
      };
    }
  }

  /**
   * Get transaction status
   */
  public async getTransactionStatus(transactionHash: string, chainId: number): Promise<TransactionStatus | null> {
    try {
      const provider = this.getProvider(chainId);
      const receipt = await provider.getTransactionReceipt(transactionHash);
      
      if (!receipt) {
        return {
          transactionHash,
          status: 'pending',
          confirmations: 0,
          timestamp: new Date()
        };
      }

      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      return {
        transactionHash: receipt.hash,
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        confirmations,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice?.toString() || '0',
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Error getting transaction status', { transactionHash, chainId, error });
      return null;
    }
  }

  /**
   * Get current nonce for user on specific chain
   */
  public async getUserNonce(userAddress: string, chainId: number): Promise<string> {
    try {
      const contract = this.getContract(chainId);
      const nonce = await contract.getCurrentUserNonce(userAddress);
      return nonce.toString();
    } catch (error) {
      logger.error('Error getting user nonce', { userAddress, chainId, error });
      return '0';
    }
  }

  /**
   * Get relayer balance on specific chain
   */
  public async getRelayerBalance(chainId: number): Promise<string> {
    try {
      const provider = this.getProvider(chainId);
      const balance = await provider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Error getting relayer balance', { chainId, error });
      return '0';
    }
  }

  /**
   * Get relayer address
   */
  public getRelayerAddress(): string {
    return this.wallet.address;
  }

  /**
   * Check if token supports ERC2612 permit
   */
  public async checkPermitSupport(tokenAddress: string, chainId: number): Promise<boolean> {
    try {
      const contract = this.getContract(chainId);
      return await contract.checkERC2612PermitSupport(tokenAddress);
    } catch (error) {
      logger.error('Error checking permit support', { tokenAddress, chainId, error });
      return false;
    }
  }
}