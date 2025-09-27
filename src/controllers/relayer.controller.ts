import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpException,
  Logger,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { RelayerService } from '../services/relayer.service';
import { LoggerService } from '../services/logger.service';
import { GasEstimationService } from '../services/gas-estimation.service';
import {
  GetChainsResponseDto,
  GetTokensResponseDto,
  GetNonceDto,
  GetNonceResponseDto,
  GetQuoteDto,
  GetQuoteResponseDto,
  PrepareSignatureDto,
  PrepareSignatureResponseDto,
  RelayTransferDto,
  RelayTransferResponseDto,
  EstimateGasResponseDto,
  GasPriceResponseDto,
  GasCacheStatsResponseDto,
  PermitSupportResponseDto,
  HealthCheckResponseDto,
} from '../dto';

@Controller()
@UseInterceptors(ClassSerializerInterceptor)
export class RelayerController {
  private readonly logger = new Logger(RelayerController.name);

  constructor(
    private readonly relayerService: RelayerService,
    private readonly loggerService: LoggerService,
    private readonly gasEstimationService: GasEstimationService,
  ) {}

  @Get('health')
  getHealth(): HealthCheckResponseDto {
    return {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('chains')
  getChains(): GetChainsResponseDto {
    try {
      const chains = this.relayerService.getSupportedChains();
      const chainsInfo = chains.map((chainName) => {
        const info = this.relayerService.getChainInfo(chainName);
        return {
          name: chainName,
          chainId: parseInt(info.chainId),
          rpcUrl: info.rpcUrl,
          explorerUrl: info.explorerUrl,
          contractAddress: info.contractAddress,
          feeSettings: info.feeSettings,
          tokens: Object.fromEntries(
            Object.entries(info.tokens).map(([symbol, token]) => [
              symbol,
              {
                ...token,
                decimals: parseInt(token.decimals),
              },
            ]),
          ),
        };
      });

      return {
        success: true,
        chains: chainsInfo,
      };
    } catch (error) {
      this.loggerService.logError(error as Error, { endpoint: 'getChains' });
      throw new HttpException(
        {
          success: false,
          error: 'Failed to get supported chains',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('chains/:chainName/tokens')
  getTokens(@Param('chainName') chainName: string): GetTokensResponseDto {
    try {
      const tokens = this.relayerService.getSupportedTokens(chainName);
      const processedTokens = Object.fromEntries(
        Object.entries(tokens).map(([symbol, token]) => [
          symbol,
          {
            ...token,
            decimals: parseInt(token.decimals),
          },
        ]),
      );

      return {
        success: true,
        chainName,
        tokens: processedTokens,
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'getTokens',
        chainName,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('nonce')
  async getNonce(@Query() query: GetNonceDto): Promise<GetNonceResponseDto> {
    try {
      const { chainName, userAddress } = query;
      const nonce = await this.relayerService.getUserNonce(
        chainName,
        userAddress,
      );

      return {
        success: true,
        chainName,
        userAddress,
        nonce: Number(nonce),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'getNonce',
        query,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('quote')
  getQuote(@Body() body: GetQuoteDto): GetQuoteResponseDto {
    try {
      const { chainName, tokenSymbol, amount } = body;

      // Calculate fee
      const fee = this.relayerService.calculateFee(
        chainName,
        BigInt(amount),
        tokenSymbol,
      );
      const chainInfo = this.relayerService.getChainInfo(chainName);
      const tokenInfo = chainInfo.tokens[tokenSymbol];

      return {
        success: true,
        chainName,
        tokenSymbol,
        amount: parseInt(amount),
        fee: Number(fee),
        total: Number(BigInt(amount) + fee),
        feePercentage: parseInt(chainInfo.feeSettings.baseFeeBps) / 100,
        tokenDecimals: parseInt(tokenInfo.decimals),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'getQuote',
        body,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('prepare-signature')
  async prepareSignature(
    @Body() body: PrepareSignatureDto,
  ): Promise<PrepareSignatureResponseDto> {
    try {
      const messageHash = await this.relayerService.generateMessageForSigning(
        body.chainName,
        body,
      );

      return {
        success: true,
        messageHash,
        message:
          'Sign this message hash with your wallet to authorize the transfer',
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'prepareSignature',
        body,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('relay-transfer')
  async relayTransfer(
    @Body() body: RelayTransferDto,
  ): Promise<RelayTransferResponseDto> {
    try {
      const result = await this.relayerService.executeGaslessTransfer(body);

      return {
        ...result,
        success: true,
        gasUsed: parseInt(result.gasUsed),
        fee: parseInt(result.fee),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'relayTransfer',
        body,
      });

      // Determine appropriate status code based on error type
      let statusCode = HttpStatus.BAD_REQUEST;
      const errorMessage = (error as Error).message;

      if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('Too many')
      ) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      } else if (errorMessage.includes('insufficient')) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else if (
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('Invalid signature')
      ) {
        statusCode = HttpStatus.UNAUTHORIZED;
      } else if (
        errorMessage.includes('not found') ||
        errorMessage.includes('not supported')
      ) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (
        errorMessage.includes('network') ||
        errorMessage.includes('connection')
      ) {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      }

      throw new HttpException(
        {
          success: 'false',
          error: errorMessage,
        },
        statusCode,
      );
    }
  }

  @Post('process-standard-gasless-transfer')
  async processStandardGaslessTransfer(
    @Body() body: RelayTransferDto,
  ): Promise<RelayTransferResponseDto> {
    try {
      const result =
        await this.relayerService.processStandardGaslessTransfer(body);

      return {
        ...result,
        success: true,
        gasUsed: parseInt(result.gasUsed),
        fee: parseInt(result.fee),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'processStandardGaslessTransfer',
        body,
      });

      // Determine appropriate status code based on error type
      let statusCode = HttpStatus.BAD_REQUEST;
      const errorMessage = (error as Error).message;

      if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('Too many')
      ) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      } else if (
        errorMessage.includes('not found') ||
        errorMessage.includes('not supported')
      ) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (
        errorMessage.includes('network') ||
        errorMessage.includes('connection')
      ) {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      }

      throw new HttpException(
        {
          success: 'false',
          error: errorMessage,
        },
        statusCode,
      );
    }
  }

  @Post('process-permit-gasless-transfer')
  async processPermitBasedGaslessTransfer(
    @Body() body: RelayTransferDto,
  ): Promise<RelayTransferResponseDto> {
    try {
      const result =
        await this.relayerService.processPermitBasedGaslessTransfer(body);

      return {
        ...result,
        success: true,
        gasUsed: parseInt(result.gasUsed),
        fee: parseInt(result.fee),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'processPermitBasedGaslessTransfer',
        body,
      });

      // Determine appropriate status code based on error type
      let statusCode = HttpStatus.BAD_REQUEST;
      const errorMessage = (error as Error).message;

      if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('Too many')
      ) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      } else if (
        errorMessage.includes('not found') ||
        errorMessage.includes('not supported') ||
        errorMessage.includes('does not support ERC2612')
      ) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (
        errorMessage.includes('network') ||
        errorMessage.includes('connection')
      ) {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      }

      throw new HttpException(
        {
          success: 'false',
          error: errorMessage,
        },
        statusCode,
      );
    }
  }

  @Get('check-permit-support/:chainName/:tokenAddress')
  async checkPermitSupport(
    @Param('chainName') chainName: string,
    @Param('tokenAddress') tokenAddress: string,
  ): Promise<PermitSupportResponseDto> {
    try {
      const supportsPermit =
        await this.relayerService.checkERC2612PermitSupport(
          chainName,
          tokenAddress,
        );

      return {
        success: true,
        supportsPermit,
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'checkPermitSupport',
        chainName,
        tokenAddress,
      });

      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('estimate-gas')
  async estimateGas(
    @Body() body: PrepareSignatureDto,
  ): Promise<EstimateGasResponseDto> {
    try {
      const gasEstimate = await this.relayerService.estimateGasCost(
        body.chainName,
        body,
      );

      return {
        success: true,
        gasEstimate: parseInt(gasEstimate.gasEstimate),
        gasPrice: parseFloat(gasEstimate.gasPrice),
        gasCost: parseInt(gasEstimate.gasCost),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'estimateGas',
        body,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('estimate-gas-advanced')
  async estimateGasAdvanced(@Body() body: PrepareSignatureDto): Promise<any> {
    try {
      const transferParams =
        await this.relayerService.prepareTransferParams(body);
      const gasEstimation = await this.gasEstimationService.estimateTransferGas(
        body.chainName,
        transferParams,
        {
          gasMultiplier: 1.2, // 20% buffer
          maxGasPrice: ethers.parseUnits('100', 'gwei'), // Max 100 gwei
          fallbackGasPrice: ethers.parseUnits('20', 'gwei'), // Fallback 20 gwei
        },
      );

      return {
        success: true,
        ...gasEstimation,
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'estimateGasAdvanced',
        body,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('gas-price/:chainName')
  async getGasPrice(
    @Param('chainName') chainName: string,
  ): Promise<GasPriceResponseDto> {
    try {
      const gasPrice = await this.gasEstimationService.getGasPrice(chainName);

      return {
        success: true,
        chainName,
        gasPrice: parseFloat(ethers.formatUnits(gasPrice, 'gwei')),
        gasPriceWei: Number(gasPrice),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'getGasPrice',
        chainName,
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('gas-cache-stats')
  getGasCacheStats(): GasCacheStatsResponseDto {
    try {
      const stats = this.gasEstimationService.getCacheStats();

      return {
        success: true,
        size: stats.size,
        entries: stats.entries.map((entry) => ({
          chain: entry.chain,
          price: parseFloat(entry.price),
          age: entry.age,
        })),
      };
    } catch (error) {
      this.loggerService.logError(error as Error, {
        endpoint: 'getGasCacheStats',
      });
      throw new HttpException(
        {
          success: false,
          error: (error as Error).message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
