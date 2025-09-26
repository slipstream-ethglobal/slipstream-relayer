import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IContractManagerService,
  TransferParams,
  TransferResult,
  GasEstimate,
  MessageHashResult,
} from '../interfaces/relayer.interface';
import { ChainConfigService } from './chain-config.service';
import { MinimalSecureTransferABI, ERC20ABI } from '../contracts/abis';

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
        MinimalSecureTransferABI,
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

  async getNonce(
    chainName: string,
    userAddress: string,
    privateKey: string,
  ): Promise<bigint> {
    try {
      const contract = this.getContract(chainName, privateKey);
      const nonce = await contract.getNonce(userAddress);
      return nonce;
    } catch (error) {
      this.logger.error(
        `Error getting nonce for ${userAddress} on ${chainName}:`,
        error,
      );
      throw error;
    }
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

  // Expose provider for gas estimation service
  getProviderForGas(chainName: string): ethers.JsonRpcProvider {
    return this.getProvider(chainName);
  }

  // Expose contract for gas estimation service
  getContractForGas(chainName: string, privateKey: string): ethers.Contract {
    return this.getContract(chainName, privateKey);
  }
}
