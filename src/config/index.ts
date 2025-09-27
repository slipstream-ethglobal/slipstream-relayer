import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),

  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // EVM Network Configuration
  KADENA_TESTNET_RPC_URL: process.env.KADENA_TESTNET_RPC_URL || 'https://evm-testnet.chainweb.com/chainweb/0.0/evm-testnet/chain/20/evm/rpc',
  BASE_TESTNET_RPC_URL: process.env.BASE_TESTNET_RPC_URL || 'https://sepolia.base.org',
  ARBITRUM_TESTNET_RPC_URL: process.env.ARBITRUM_TESTNET_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',

  // Relayer Configuration
  RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY || '',

  // Token Contract Addresses - Kadena
  KADENA_TUSDC_ADDRESS: process.env.KADENA_TUSDC_ADDRESS || '0x7EDfA2193d4c2664C9e0128Ae25Ae5c9eC72D365',

  // Token Contract Addresses - Base
  BASE_USDC_ADDRESS: process.env.BASE_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',

  // Token Contract Addresses - Arbitrum
  ARBITRUM_PYUSD_ADDRESS: process.env.ARBITRUM_PYUSD_ADDRESS || '0x637A1259C6afd7E3AdF63993cA7E58BB438aB1B1',
  ARBITRUM_USDC_ADDRESS: process.env.ARBITRUM_USDC_ADDRESS || '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',

  // SlipstreamGaslessProxy Contract Addresses
  KADENA_GASLESS_CONTRACT: process.env.KADENA_GASLESS_CONTRACT || '',
  BASE_GASLESS_CONTRACT: process.env.BASE_GASLESS_CONTRACT || '',
  ARBITRUM_GASLESS_CONTRACT: process.env.ARBITRUM_GASLESS_CONTRACT || '',

  // Fee Configuration
  FEE_RECIPIENT_ADDRESS: process.env.FEE_RECIPIENT_ADDRESS || '',
  KADENA_FEE_BPS: parseInt(process.env.KADENA_FEE_BPS || '25'),
  BASE_FEE_BPS: parseInt(process.env.BASE_FEE_BPS || '25'),
  ARBITRUM_FEE_BPS: parseInt(process.env.ARBITRUM_FEE_BPS || '25'),
  MINIMUM_FEE_USD: parseFloat(process.env.MINIMUM_FEE_USD || '0.10'),
  MAXIMUM_FEE_BPS: parseInt(process.env.MAXIMUM_FEE_BPS || '500'),

  // Pyth Network Configuration
  PYTH_HERMES_API_URL: process.env.PYTH_HERMES_API_URL || 'https://hermes.pyth.network',
  PYTH_PRICE_SERVICE_ENDPOINT: process.env.PYTH_PRICE_SERVICE_ENDPOINT || 'https://hermes.pyth.network',
  
  // Pyth Price Feed IDs
  USDC_USD_PRICE_FEED_ID: process.env.USDC_USD_PRICE_FEED_ID || '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  PYUSD_USD_PRICE_FEED_ID: process.env.PYUSD_USD_PRICE_FEED_ID || '0x8f218655050a1476b780185e89f19d2b1e1f49e9bd629efad6ac547a946bf6ab',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Safety Monitoring
  MAX_DAILY_VOLUME_USD: parseFloat(process.env.MAX_DAILY_VOLUME_USD || '10000'),
  MAX_SINGLE_TRANSACTION_USD: parseFloat(process.env.MAX_SINGLE_TRANSACTION_USD || '1000')
};

export default config;