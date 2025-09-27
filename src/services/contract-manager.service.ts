import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IContractManagerService,
  TransferParams,
  TransferResult,
  GasEstimate,
  MessageHashResult,
  GaslessTransactionRequest,
  ERC2612PermitSignature,
  BatchTransferResult,
} from '../interfaces/relayer.interface';
import {
  ProcessStandardGaslessTransferParams,
  ProcessPermitBasedGaslessTransferParams,
  ProcessBatchStandardTransfersParams,
  ProcessBatchPermitBasedTransfersParams,
  ContractState,
  RelayerInfo,
  TokenInfo as ContractTokenInfo,
} from '../contracts/types';
import { ChainConfigService } from './chain-config.service';
import { SlipstreamGaslessProxyABI, ERC20ABI } from '../contracts/abis';

@Injectable()
export class ContractManagerService implements IContractManagerService {
  private readonly logger = new Logger(ContractManagerService.name);
  private readonly providers = new Map<string, ethers.JsonRpcProvider>();
  private readonly contracts = new Map<string, ethers.Contract>();
  private readonly wallets = new Map<string, ethers.Wallet>();

  constructor(private readonly chainConfigService: ChainConfigService) {}

  private getProvider(chainName: string): ethers.JsonRpcProvider {
    if (!this.providers.has(chainName)) {
      const config = this.chainConfigService.getChainConfig(chainName);
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.providers.set(chainName, provider);
    }
    return this.providers.get(chainName)!;
  }

  private getWallet(chainName: string, privateKey: string): ethers.Wallet {
    const walletKey = `${chainName}-${privateKey.slice(0, 10)}`;
    if (!this.wallets.has(walletKey)) {
      const provider = this.getProvider(chainName);
      const wallet = new ethers.Wallet(privateKey, provider);
      this.wallets.set(walletKey, wallet);
    }
    return this.wallets.get(walletKey)!;
  }

  private getContract(chainName: string, privateKey: string): ethers.Contract {
    const contractKey = `${chainName}-contract`;
    if (!this.contracts.has(contractKey)) {
      const config = this.chainConfigService.getChainConfig(chainName);
      const wallet = this.getWallet(chainName, privateKey);
      const contract = new ethers.Contract(
        config.contractAddress,
        SlipstreamGaslessProxyABI,
        wallet,
      );
      this.contracts.set(contractKey, contract);
    }
    return this.contracts.get(contractKey)!;
  }

  private getTokenContract(
    chainName: string,
    tokenAddress: string,
    privateKey: string,
  ): ethers.Contract {
    const tokenKey = `${chainName}-${tokenAddress}`;
    if (!this.contracts.has(tokenKey)) {
      const wallet = this.getWallet(chainName, privateKey);
      const contract = new ethers.Contract(tokenAddress, ERC20ABI, wallet);
      this.contracts.set(tokenKey, contract);
    }
    return this.contracts.get(tokenKey)!;
  }

  async getCurrentUserNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const nonce = await contract.getCurrentUserNonce(userAddress);
      return nonce;
    } catch (error) {
      this.logger.error(
        `Error getting current user nonce for ${userAddress} on ${chainName}:`,
        error,
      );
      throw error;
    }
  }

  // Legacy method for backward compatibility
  async getNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint> {
    return this.getCurrentUserNonce(chainName, userAddress, privateKey);
  }

  async getTokenBalance(
    chainName: string,
    tokenAddress: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint> {
    try {
      const tokenContract = this.getTokenContract(
        chainName,
        tokenAddress,
        privateKey,
      );
      const balance = await tokenContract.balanceOf(userAddress);
      return balance;
    } catch (error) {
      this.logger.error(
        `Error getting token balance for ${userAddress}:`,
        error,
      );
      throw error;
    }
  }

  async checkTokenAllowance(
    chainName: string,
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    privateKey: string,
  ): Promise<bigint> {
    try {
      const tokenContract = this.getTokenContract(
        chainName,
        tokenAddress,
        privateKey,
      );
      const allowance = await tokenContract.allowance(
        ownerAddress,
        spenderAddress,
      );
      return allowance;
    } catch (error) {
      this.logger.error(`Error checking token allowance:`, error);
      throw error;
    }
  }

  generateMessageHash(
    contractAddress: string,
    from: string,
    to: string,
    token: string,
    amount: ethers.BigNumberish,
    fee: ethers.BigNumberish,
    nonce: ethers.BigNumberish,
    deadline: ethers.BigNumberish,
  ): MessageHashResult {
    try {
      // Match the contract's message hash generation exactly
      const messageHash = ethers.solidityPackedKeccak256(
        [
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
        ],
        [contractAddress, from, to, token, amount, fee, nonce, deadline],
      );

      // Create the Ethereum signed message hash
      const ethSignedMessageHash = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', messageHash],
      );

      return { messageHash, ethSignedMessageHash };
    } catch (error) {
      this.logger.error('Error generating message hash:', error);
      throw error;
    }
  }

  verifySignature(
    messageHash: string,
    signature: string,
    expectedSigner: string,
  ): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(messageHash),
        signature,
      );
      return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
    } catch (error) {
      this.logger.error('Error verifying signature:', error);
      return false;
    }
  }

  async executeTransfer(
    chainName: string,
    transferParams: TransferParams,
    privateKey: string,
  ): Promise<TransferResult> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const config = this.chainConfigService.getChainConfig(chainName);

      this.logger.log(`Executing transfer on ${chainName}:`, {
        from: transferParams.from,
        to: transferParams.to,
        token: transferParams.token,
        amount: transferParams.amount.toString(),
        fee: transferParams.fee.toString(),
      });

      // Estimate gas first
      const gasEstimate =
        await contract.executeTransfer.estimateGas(transferParams);
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Execute the transaction
      const tx = await contract.executeTransfer(transferParams, {
        gasLimit: gasLimit,
      });

      this.logger.log(`Transaction submitted:`, {
        hash: tx.hash,
        chainId: config.chainId,
        gasLimit: gasLimit.toString(),
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      this.logger.log(`Transaction confirmed:`, {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        status: receipt.status,
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString() || '0',
        explorerUrl: `${config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error) {
      this.logger.error(`Error executing transfer on ${chainName}:`, error);

      // Parse error messages for better user feedback
      let errorMessage = 'Transaction failed';
      if (error.message.includes('insufficient allowance')) {
        errorMessage =
          'Insufficient token allowance. Please approve the contract first.';
      } else if (error.message.includes('insufficient balance')) {
        errorMessage = 'Insufficient token balance';
      } else if (error.message.includes('Invalid signature')) {
        errorMessage = 'Invalid signature provided';
      } else if (error.message.includes('Invalid nonce')) {
        errorMessage = 'Invalid nonce. Please refresh and try again.';
      } else if (error.message.includes('Transaction expired')) {
        errorMessage = 'Transaction expired. Please try again.';
      }

      throw new Error(errorMessage);
    }
  }

  async processStandardGaslessTransfer(
    chainName: string,
    params: ProcessStandardGaslessTransferParams,
    privateKey: string,
  ): Promise<TransferResult> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const config = this.chainConfigService.getChainConfig(chainName);

      this.logger.log(`Processing standard gasless transfer on ${chainName}:`, {
        from: params.transactionRequest.fromAddress,
        to: params.transactionRequest.toAddress,
        token: params.transactionRequest.tokenContract,
        amount: params.transactionRequest.transferAmount.toString(),
        fee: params.transactionRequest.relayerServiceFee.toString(),
      });

      // Estimate gas first
      const gasEstimate =
        await contract.processStandardGaslessTransfer.estimateGas(
          params.transactionRequest,
          params.userSignature,
        );
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Execute the transaction
      const tx = await contract.processStandardGaslessTransfer(
        params.transactionRequest,
        params.userSignature,
        {
          gasLimit: gasLimit,
        },
      );

      this.logger.log(`Transaction submitted:`, {
        hash: tx.hash,
        chainId: config.chainId,
        gasLimit: gasLimit.toString(),
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      this.logger.log(`Transaction confirmed:`, {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        status: receipt.status,
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString() || '0',
        explorerUrl: `${config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error) {
      this.logger.error(
        `Error processing standard gasless transfer on ${chainName}:`,
        error,
      );
      throw error;
    }
  }

  async processPermitBasedGaslessTransfer(
    chainName: string,
    params: ProcessPermitBasedGaslessTransferParams,
    privateKey: string,
  ): Promise<TransferResult> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const config = this.chainConfigService.getChainConfig(chainName);

      this.logger.log(
        `Processing permit-based gasless transfer on ${chainName}:`,
        {
          from: params.transactionRequest.fromAddress,
          to: params.transactionRequest.toAddress,
          token: params.transactionRequest.tokenContract,
          amount: params.transactionRequest.transferAmount.toString(),
          fee: params.transactionRequest.relayerServiceFee.toString(),
        },
      );

      // Estimate gas first
      const gasEstimate =
        await contract.processPermitBasedGaslessTransfer.estimateGas(
          params.transactionRequest,
          params.userSignature,
          params.permitSignatureData,
        );
      const gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer

      // Execute the transaction
      const tx = await contract.processPermitBasedGaslessTransfer(
        params.transactionRequest,
        params.userSignature,
        params.permitSignatureData,
        {
          gasLimit: gasLimit,
        },
      );

      this.logger.log(`Transaction submitted:`, {
        hash: tx.hash,
        chainId: config.chainId,
        gasLimit: gasLimit.toString(),
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      this.logger.log(`Transaction confirmed:`, {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        status: receipt.status,
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString() || '0',
        explorerUrl: `${config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error) {
      this.logger.error(
        `Error processing permit-based gasless transfer on ${chainName}:`,
        error,
      );
      throw error;
    }
  }

  async checkERC2612PermitSupport(
    chainName: string,
    tokenAddress: string,
    privateKey: string,
  ): Promise<boolean> {
    try {
      const contract = this.getContract(chainName, privateKey);
      return await contract.checkERC2612PermitSupport(tokenAddress);
    } catch (error) {
      this.logger.error(
        `Error checking ERC2612 permit support for ${tokenAddress} on ${chainName}:`,
        error,
      );
      return false;
    }
  }

  // Expose provider for gas estimation service
  getProviderForGas(chainName: string): ethers.JsonRpcProvider {
    return this.getProvider(chainName);
  }

  // Expose contract for gas estimation service
  getContractForGas(chainName: string, privateKey: string): ethers.Contract {
    return this.getContract(chainName, privateKey);
  }

  // Batch transfer methods
  async processBatchStandardTransfers(
    chainName: string,
    params: ProcessBatchStandardTransfersParams,
    privateKey: string,
  ): Promise<BatchTransferResult> {
    // Implementation for batch standard transfers
    throw new Error('Batch standard transfers not implemented yet');
  }

  async processBatchPermitBasedTransfers(
    chainName: string,
    params: ProcessBatchPermitBasedTransfersParams,
    privateKey: string,
  ): Promise<BatchTransferResult> {
    // Implementation for batch permit-based transfers
    throw new Error('Batch permit-based transfers not implemented yet');
  }

  // Contract state queries
  async getContractState(
    chainName: string,
    privateKey: string,
  ): Promise<ContractState> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const [owner, paused, domainSeparator] = await Promise.all([
        contract.owner(),
        contract.paused(),
        contract.CONTRACT_DOMAIN_SEPARATOR(),
      ]);

      return {
        owner,
        paused,
        domainSeparator,
      };
    } catch (error) {
      this.logger.error(
        `Error getting contract state for ${chainName}:`,
        error,
      );
      throw error;
    }
  }

  async getRelayerInfo(
    chainName: string,
    relayerAddress: string,
    privateKey: string,
  ): Promise<RelayerInfo> {
    try {
      const contract = this.getContract(chainName, privateKey);
      // Note: These methods might not exist in the current ABI, adjust as needed
      const [isAuthorized, lastActivity] = await Promise.all([
        contract.isRelayerAuthorized(relayerAddress),
        contract.getRelayerLastActivity(relayerAddress),
      ]);

      return {
        isAuthorized,
        lastActivity,
      };
    } catch (error) {
      this.logger.error(
        `Error getting relayer info for ${relayerAddress} on ${chainName}:`,
        error,
      );
      throw error;
    }
  }

  async getTokenInfo(
    chainName: string,
    tokenAddress: string,
    privateKey: string,
  ): Promise<ContractTokenInfo> {
    try {
      const contract = this.getContract(chainName, privateKey);
      // Note: These methods might not exist in the current ABI, adjust as needed
      const [isSupported, lastActivity] = await Promise.all([
        contract.isTokenSupported(tokenAddress),
        contract.getTokenLastActivity(tokenAddress),
      ]);

      return {
        isSupported,
        lastActivity,
      };
    } catch (error) {
      this.logger.error(
        `Error getting token info for ${tokenAddress} on ${chainName}:`,
        error,
      );
      throw error;
    }
  }
}
