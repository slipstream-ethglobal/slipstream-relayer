import { config } from './index';

export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  priceId?: string; // Pyth price feed ID
}

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  gaslessContract: string;
  tokens: {
    [tokenSymbol: string]: TokenConfig;
  };
  feeSettings: {
    baseFeeBps: number; // 25 = 0.25%
    minFeeUsd: number;
    maxFeeBps: number; // 500 = 5%
  };
  gasSettings: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    gasLimit: number;
  };
  pythPriceService: {
    endpoint: string;
    updateInterval: number; // seconds
  };
}

// Kadena Testnet Configuration
export const KADENA_TESTNET_CONFIG: ChainConfig = {
  id: 5920,
  name: 'Kadena Testnet',
  rpcUrl: config.KADENA_TESTNET_RPC_URL,
  explorerUrl: 'https://chain-20.evm-testnet-blockscout.chainweb.com',
  nativeCurrency: {
    name: 'Kadena',
    symbol: 'KDA',
    decimals: 18
  },
  gaslessContract: config.KADENA_GASLESS_CONTRACT,
  tokens: {
    TUSDC: {
      address: config.KADENA_TUSDC_ADDRESS,
      decimals: 6,
      symbol: 'TUSDC',
      name: 'Test USDC',
      priceId: config.USDC_USD_PRICE_FEED_ID
    }
  },
  feeSettings: {
    baseFeeBps: config.KADENA_FEE_BPS,
    minFeeUsd: config.MINIMUM_FEE_USD,
    maxFeeBps: config.MAXIMUM_FEE_BPS
  },
  gasSettings: {
    maxFeePerGas: '2000000000', // 2 gwei
    maxPriorityFeePerGas: '1500000000', // 1.5 gwei
    gasLimit: 300000
  },
  pythPriceService: {
    endpoint: config.PYTH_HERMES_API_URL,
    updateInterval: 30
  }
};

// Base Sepolia Testnet Configuration  
export const BASE_SEPOLIA_CONFIG: ChainConfig = {
  id: 84532,
  name: 'Base Sepolia',
  rpcUrl: config.BASE_TESTNET_RPC_URL,
  explorerUrl: 'https://sepolia.basescan.org',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  gaslessContract: config.BASE_GASLESS_CONTRACT,
  tokens: {
    USDC: {
      address: config.BASE_USDC_ADDRESS,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin',
      priceId: config.USDC_USD_PRICE_FEED_ID
    }
  },
  feeSettings: {
    baseFeeBps: config.BASE_FEE_BPS,
    minFeeUsd: config.MINIMUM_FEE_USD,
    maxFeeBps: config.MAXIMUM_FEE_BPS
  },
  gasSettings: {
    maxFeePerGas: '2000000000', // 2 gwei
    maxPriorityFeePerGas: '1000000000', // 1 gwei  
    gasLimit: 200000
  },
  pythPriceService: {
    endpoint: config.PYTH_HERMES_API_URL,
    updateInterval: 30
  }
};

// Arbitrum Sepolia Testnet Configuration
export const ARBITRUM_SEPOLIA_CONFIG: ChainConfig = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  rpcUrl: config.ARBITRUM_TESTNET_RPC_URL,
  explorerUrl: 'https://sepolia.arbiscan.io',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  gaslessContract: config.ARBITRUM_GASLESS_CONTRACT,
  tokens: {
    PYUSD: {
      address: config.ARBITRUM_PYUSD_ADDRESS,
      decimals: 6,
      symbol: 'PYUSD',
      name: 'PayPal USD',
      priceId: config.PYUSD_USD_PRICE_FEED_ID
    },
    USDC: {
      address: config.ARBITRUM_USDC_ADDRESS,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin',
      priceId: config.USDC_USD_PRICE_FEED_ID
    }
  },
  feeSettings: {
    baseFeeBps: config.ARBITRUM_FEE_BPS,
    minFeeUsd: config.MINIMUM_FEE_USD,
    maxFeeBps: config.MAXIMUM_FEE_BPS
  },
  gasSettings: {
    maxFeePerGas: '100000000', // 0.1 gwei (Arbitrum is cheaper)
    maxPriorityFeePerGas: '10000000', // 0.01 gwei
    gasLimit: 500000
  },
  pythPriceService: {
    endpoint: config.PYTH_HERMES_API_URL,
    updateInterval: 30
  }
};

// Chain configurations mapping
export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
  [KADENA_TESTNET_CONFIG.id]: KADENA_TESTNET_CONFIG,
  [BASE_SEPOLIA_CONFIG.id]: BASE_SEPOLIA_CONFIG,
  [ARBITRUM_SEPOLIA_CONFIG.id]: ARBITRUM_SEPOLIA_CONFIG
};

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIGS).map(id => parseInt(id));

// Helper function to get chain config by ID
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

// Helper function to get token config
export function getTokenConfig(chainId: number, tokenSymbol: string): TokenConfig | undefined {
  const chainConfig = getChainConfig(chainId);
  return chainConfig?.tokens[tokenSymbol];
}
