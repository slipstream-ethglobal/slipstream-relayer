import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  IChainConfigService,
  ChainConfig,
  TokenInfo,
} from '../interfaces/relayer.interface';

@Injectable()
export class ChainConfigService implements IChainConfigService {
  private readonly logger = new Logger(ChainConfigService.name);
  private readonly chains: Record<string, ChainConfig>;

  constructor() {
    try {
      const configPath = join(__dirname, '../config/chains.json');
      let configContent = readFileSync(configPath, 'utf8');

      // Replace environment variable placeholders with actual values
      configContent = this.replaceEnvVariables(configContent);

      this.chains = JSON.parse(configContent);
      this.logger.log('Chain configuration loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load chain configuration:', error);
      throw new Error('Failed to initialize chain configuration');
    }
  }

  private replaceEnvVariables(content: string): string {
    // Replace ${VAR_NAME} patterns with environment variables
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined || value === '') {
        this.logger.warn(
          `Environment variable ${varName} is not set, using empty string`,
        );
        return '';
      }
      return value;
    });
  }

  getChainConfig(chainName: string): ChainConfig {
    const config = this.chains[chainName];
    if (!config) {
      throw new Error(`Chain configuration not found for: ${chainName}`);
    }

    // Validate that required fields are not empty
    if (!config.contractAddress || config.contractAddress === '') {
      throw new Error(
        `Contract address not configured for chain: ${chainName}. Please set the appropriate environment variable.`,
      );
    }

    return config;
  }

  getSupportedChains(): string[] {
    return Object.keys(this.chains);
  }

  getTokenConfig(chainName: string, tokenSymbol: string): TokenInfo {
    const chainConfig = this.getChainConfig(chainName);
    const token = chainConfig.tokens[tokenSymbol];
    if (!token) {
      throw new Error(`Token ${tokenSymbol} not supported on ${chainName}`);
    }
    return token;
  }
}
