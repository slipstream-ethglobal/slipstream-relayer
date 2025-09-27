import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { ChainConfig, getChainConfig } from '../config/chainConfig';
import { logger } from '../utils/logger';
import SlipstreamGaslessProxyABI from '../contracts/SlipstreamGaslessProxy.abi.json';

export interface GaslessTransactionRequest {
  fromAddress: string;
  toAddress: string;
  tokenContract: string;
  transferAmount: bigint;
  relayerServiceFee: bigint;
  transactionNonce: bigint;
  expirationDeadline: bigint;
}

export interface ERC2612PermitSignature {
  approvalValue: bigint;
  permitDeadline: bigint;
  signatureV: number;
  signatureR: string;
  signatureS: string;
}

export class ContractService {
  private providers: Map<number, JsonRpcProvider> = new Map();
  private contracts: Map<number, Contract> = new Map();
  private wallet: Wallet;

  constructor(privateKey: string) {
    this.wallet = new Wallet(privateKey);
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize providers for all supported chains
    const chains = [5920, 84532, 421614]; // Kadena, Base, Arbitrum
    
    for (const chainId of chains) {
      const chainConfig = getChainConfig(chainId);
      if (chainConfig) {
        const provider = new JsonRpcProvider(chainConfig.rpcUrl);
        this.providers.set(chainId, provider);
        
        const connectedWallet = this.wallet.connect(provider);
        const contract = new Contract(
          chainConfig.gaslessContract,
          SlipstreamGaslessProxyABI,
          connectedWallet
        );
        this.contracts.set(chainId, contract);
        
        logger.info(`Initialized provider and contract for ${chainConfig.name}`);
      }
    }
  }

  /**
   * Process a standard gasless transfer (token already approved)
   */
  async processStandardGaslessTransfer(
    chainId: number,
    request: GaslessTransactionRequest,
    signature: string
  ): Promise<string> {
    const contract = this.contracts.get(chainId);
    const chainConfig = getChainConfig(chainId);
    
    if (!contract || !chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      logger.info(`Processing standard gasless transfer on ${chainConfig.name}`);
      
      const tx = await contract.processStandardGaslessTransfer(
        request,
        signature,
        {
          maxFeePerGas: chainConfig.gasSettings.maxFeePerGas,
          maxPriorityFeePerGas: chainConfig.gasSettings.maxPriorityFeePerGas,
          gasLimit: chainConfig.gasSettings.gasLimit
        }
      );

      logger.info(`Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      
      logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
      return receipt.transactionHash;

    } catch (error) {
      logger.error(`Failed to process standard gasless transfer: ${error}`);
      throw error;
    }
  }

  /**
   * Process a gasless transfer with ERC-2612 permit
   */
  async processPermitBasedGaslessTransfer(
    chainId: number,
    request: GaslessTransactionRequest,
    permit: ERC2612PermitSignature,
    signature: string
  ): Promise<string> {
    const contract = this.contracts.get(chainId);
    const chainConfig = getChainConfig(chainId);
    
    if (!contract || !chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      logger.info(`Processing permit-based gasless transfer on ${chainConfig.name}`);
      
      const tx = await contract.processPermitBasedGaslessTransfer(
        request,
        permit,
        signature,
        {
          maxFeePerGas: chainConfig.gasSettings.maxFeePerGas,
          maxPriorityFeePerGas: chainConfig.gasSettings.maxPriorityFeePerGas,
          gasLimit: chainConfig.gasSettings.gasLimit
        }
      );

      logger.info(`Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      
      logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
      return receipt.transactionHash;

    } catch (error) {
      logger.error(`Failed to process permit-based gasless transfer: ${error}`);
      throw error;
    }
  }

  /**
   * Process batch gasless transfers
   */
  async processBatchPermitBasedTransfers(
    chainId: number,
    requests: GaslessTransactionRequest[],
    permits: ERC2612PermitSignature[],
    signatures: string[]
  ): Promise<string> {
    const contract = this.contracts.get(chainId);
    const chainConfig = getChainConfig(chainId);
    
    if (!contract || !chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      logger.info(`Processing batch permit-based transfers on ${chainConfig.name}`);
      
      const tx = await contract.processBatchPermitBasedTransfers(
        requests,
        permits,
        signatures,
        {
          maxFeePerGas: chainConfig.gasSettings.maxFeePerGas,
          maxPriorityFeePerGas: chainConfig.gasSettings.maxPriorityFeePerGas,
          gasLimit: chainConfig.gasSettings.gasLimit * 2 // Higher gas limit for batch
        }
      );

      logger.info(`Batch transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      
      logger.info(`Batch transaction confirmed: ${receipt.transactionHash}`);
      return receipt.transactionHash;

    } catch (error) {
      logger.error(`Failed to process batch transfers: ${error}`);
      throw error;
    }
  }

  /**
   * Get user's current nonce
   */
  async getCurrentUserNonce(chainId: number, userAddress: string): Promise<bigint> {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const nonce = await contract.getCurrentUserNonce(userAddress);
      return BigInt(nonce.toString());
    } catch (error) {
      logger.error(`Failed to get user nonce: ${error}`);
      throw error;
    }
  }

  /**
   * Check if a transaction has been executed
   */
  async checkTransactionExecutionStatus(chainId: number, transactionHash: string): Promise<boolean> {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const executed = await contract.checkTransactionExecutionStatus(transactionHash);
      return executed;
    } catch (error) {
      logger.error(`Failed to check transaction status: ${error}`);
      throw error;
    }
  }

  /**
   * Check if a token supports ERC-2612 permit
   */
  async checkERC2612PermitSupport(chainId: number, tokenAddress: string): Promise<boolean> {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const supportsPermit = await contract.checkERC2612PermitSupport(tokenAddress);
      return supportsPermit;
    } catch (error) {
      logger.error(`Failed to check permit support: ${error}`);
      return false;
    }
  }

  /**
   * Get contract balance for monitoring
   */
  async getContractBalance(chainId: number): Promise<bigint> {
    const provider = this.providers.get(chainId);
    const chainConfig = getChainConfig(chainId);
    
    if (!provider || !chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const balance = await provider.getBalance(chainConfig.gaslessContract);
      return balance;
    } catch (error) {
      logger.error(`Failed to get contract balance: ${error}`);
      throw error;
    }
  }

  /**
   * Pause contract operations (admin only)
   */
  async pauseContractOperations(chainId: number): Promise<string> {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const tx = await contract.pauseContractOperations();
      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (error) {
      logger.error(`Failed to pause contract: ${error}`);
      throw error;
    }
  }

  /**
   * Resume contract operations (admin only)
   */
  async resumeContractOperations(chainId: number): Promise<string> {
    const contract = this.contracts.get(chainId);
    if (!contract) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      const tx = await contract.resumeContractOperations();
      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (error) {
      logger.error(`Failed to resume contract: ${error}`);
      throw error;
    }
  }

  /**
   * Get relayer address
   */
  getRelayerAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get provider for a specific chain
   */
  getProvider(chainId: number): JsonRpcProvider | undefined {
    return this.providers.get(chainId);
  }
}