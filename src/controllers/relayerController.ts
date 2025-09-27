import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { RelayerService } from '../services/relayerService';
import { validateRelayRequest, validateFeeEstimateRequest, isValidTransactionHash } from '../utils/validation';
import { getChainConfig, getTokenConfig } from '../config/chainConfig';
import { CHAIN_CONFIGS } from '../config/chainConfig';
import { RelayRequest, FeeEstimateRequest } from '../types';

export class RelayerController {
  private relayerService: RelayerService;

  constructor() {
    this.relayerService = RelayerService.getInstance();
  }

  /**
   * Health check endpoint
   * GET /ping
   */
  public ping = async (req: Request, res: Response): Promise<void> => {
    try {
      const timestamp = new Date();
      const uptime = process.uptime();
      
      res.json({
        message: 'SlipstreamGaslessProxy Relayer is running!',
        timestamp,
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        version: '1.0.0',
        supportedChains: Object.values(CHAIN_CONFIGS).map(chain => ({
          id: chain.id,
          name: chain.name,
          tokens: Object.keys(chain.tokens)
        }))
      });
    } catch (error) {
      logger.error('Error in ping endpoint', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * Relay transaction endpoint 
   * POST /api/v1/relayer/relay
   */
  public relayTransaction = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      logger.info('Relay request received', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: {
          chainId: req.body.chainId,
          fromAddress: req.body.request?.fromAddress,
          toAddress: req.body.request?.toAddress,
          tokenContract: req.body.request?.tokenContract,
          transferAmount: req.body.request?.transferAmount
        }
      });

      // Validate request
      const { error, value } = validateRelayRequest(req.body);
      if (error || !value) {
        logger.warn('Invalid relay request', { error: error?.details, ip: req.ip });
        res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: error?.details
        });
        return;
      }

      const relayRequest: RelayRequest = value;

      // Determine if this is a permit-based transfer
      let result;
      if (relayRequest.permit) {
        result = await this.relayerService.relayPermitTransfer(relayRequest);
      } else {
        result = await this.relayerService.relayStandardTransfer(relayRequest);
      }
      
      const processingTime = Date.now() - startTime;
      logger.info('Relay request processed', {
        success: result.success,
        transactionHash: result.transactionHash,
        processingTime,
        fromAddress: relayRequest.request.fromAddress
      });

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error in relay endpoint', { 
        error, 
        ip: req.ip,
        processingTime 
      });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * Get fee estimate endpoint
   * GET /api/v1/relayer/fee/:chainId/:tokenSymbol/:amount
   */
  public getFeeEstimate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { chainId, tokenSymbol, amount } = req.params;
      
      const feeRequest: FeeEstimateRequest = {
        chainId: parseInt(chainId),
        tokenSymbol: tokenSymbol.toUpperCase(),
        amount
      };

      // Validate request
      const { error, value } = validateFeeEstimateRequest(feeRequest);
      if (error || !value) {
        logger.warn('Invalid fee estimate request', { error: error?.details, ip: req.ip });
        res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: error?.details
        });
        return;
      }

      // Calculate fee
      const result = await this.relayerService.calculateFee(value);
      
      logger.info('Fee estimate calculated', {
        chainId: value.chainId,
        tokenSymbol: value.tokenSymbol,
        amount: value.amount,
        fee: result.fee,
        feeUsd: result.feeUsd
      });

      res.json(result);

    } catch (error: any) {
      logger.error('Error in fee estimate endpoint', { 
        error: error.message, 
        params: req.params,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to calculate fee estimate'
      });
    }
  };

  /**
   * Get transaction status endpoint
   * GET /api/v1/relayer/status/:transactionHash?chainId=X
   */
  public getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionHash } = req.params;
      const { chainId } = req.query;

      if (!isValidTransactionHash(transactionHash)) {
        res.status(400).json({
          success: false,
          error: 'Invalid transaction hash format'
        });
        return;
      }

      if (!chainId || isNaN(Number(chainId))) {
        res.status(400).json({
          success: false,
          error: 'Valid chainId query parameter is required'
        });
        return;
      }

      const status = await this.relayerService.getTransactionStatus(transactionHash, Number(chainId));
      
      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
        return;
      }

      res.json({
        success: true,
        ...status
      });

    } catch (error: any) {
      logger.error('Error in transaction status endpoint', { 
        error: error.message,
        transactionHash: req.params.transactionHash,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get transaction status'
      });
    }
  };

  /**
   * Get relayer info endpoint
   * GET /api/v1/relayer/info
   */
  public getRelayerInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const supportedChains = Object.values(CHAIN_CONFIGS);
      const relayerAddress = this.relayerService.getRelayerAddress();
      
      // Get balances for all supported chains
      const balancePromises = supportedChains.map(async (chain) => {
        try {
          const balance = await this.relayerService.getRelayerBalance(chain.id);
          return {
            chainId: chain.id,
            chainName: chain.name,
            balance: balance,
            currency: chain.nativeCurrency.symbol
          };
        } catch (error) {
          logger.error('Error getting balance for chain', { chainId: chain.id, error });
          return {
            chainId: chain.id,
            chainName: chain.name,
            balance: '0',
            currency: chain.nativeCurrency.symbol
          };
        }
      });

      const balances = await Promise.all(balancePromises);

      res.json({
        success: true,
        relayerAddress,
        supportedChains: supportedChains.map(chain => ({
          id: chain.id,
          name: chain.name,
          explorerUrl: chain.explorerUrl,
          tokens: Object.entries(chain.tokens).map(([tokenSymbol, tokenConfig]) => ({
            symbol: tokenSymbol,
            address: tokenConfig.address,
            decimals: tokenConfig.decimals,
            name: tokenConfig.name
          }))
        })),
        balances
      });

    } catch (error: any) {
      logger.error('Error in relayer info endpoint', { error: error.message, ip: req.ip });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get relayer info'
      });
    }
  };

  /**
   * Get safety limits endpoint
   * GET /api/v1/relayer/limits/:chainId
   */
  public getSafetyLimits = async (req: Request, res: Response): Promise<void> => {
    try {
      const { chainId } = req.params;
      
      if (!chainId || isNaN(Number(chainId))) {
        res.status(400).json({
          success: false,
          error: 'Valid chainId is required'
        });
        return;
      }

      // For now, return the static configuration from chain config
      const chainConfig = getChainConfig(Number(chainId));
      if (!chainConfig) {
        res.status(404).json({
          success: false,
          error: 'Chain not supported'
        });
        return;
      }

      res.json({
        success: true,
        chainId: Number(chainId),
        chainName: chainConfig.name,
        feeSettings: chainConfig.feeSettings,
        message: 'Safety monitoring temporarily disabled'
      });

    } catch (error: any) {
      logger.error('Error in safety limits endpoint', { error: error.message, ip: req.ip });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * Get network status endpoint
   * GET /api/v1/relayer/status/:chainId
   */
  public getNetworkStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { chainId } = req.params;
      
      if (!chainId || isNaN(Number(chainId))) {
        res.status(400).json({
          success: false,
          error: 'Valid chainId is required'
        });
        return;
      }

      const chainConfig = getChainConfig(Number(chainId));
      if (!chainConfig) {
        res.status(404).json({
          success: false,
          error: 'Chain not supported'
        });
        return;
      }

      const balance = await this.relayerService.getRelayerBalance(Number(chainId));
      
      res.json({
        success: true,
        chainId: Number(chainId),
        chainName: chainConfig.name,
        relayerBalance: balance,
        relayerAddress: this.relayerService.getRelayerAddress(),
        gaslessContract: chainConfig.gaslessContract,
        status: 'operational'
      });

    } catch (error: any) {
      logger.error('Error in network status endpoint', { error: error.message, ip: req.ip });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}