import axios from 'axios';
import { logger } from '../utils/logger';
import { redis } from '../database/redis';
import { config } from '../config';
import { PriceData } from '../types';

interface PythPriceResponse {
  parsed: Array<{
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  }>;
}

export class PriceService {
  private static instance: PriceService;
  private priceCache: Map<string, PriceData> = new Map();
  private readonly cacheTTL = 30; // 30 seconds cache

  private constructor() {}

  public static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /**
   * Get price for a token using Pyth Network
   */
  public async getPrice(tokenSymbol: string, priceId: string): Promise<number> {
    const cacheKey = `price:${tokenSymbol}`;
    
    try {
      // Try cache first
      const cachedPrice = await this.getCachedPrice(cacheKey);
      if (cachedPrice && this.isCacheValid(cachedPrice)) {
        return cachedPrice.priceUsd;
      }

      // Fetch from Pyth Network
      const price = await this.fetchFromPyth(priceId);
      const priceData: PriceData = {
        tokenSymbol,
        priceUsd: price,
        timestamp: Date.now()
      };

      // Cache the price
      await this.setCachedPrice(cacheKey, priceData);
      this.priceCache.set(tokenSymbol, priceData);

      logger.info('Price fetched successfully', { tokenSymbol, price });
      return price;

    } catch (error) {
      logger.error('Error fetching price', { tokenSymbol, error });
      
      // Fallback to last known price if available
      const lastKnownPrice = this.priceCache.get(tokenSymbol);
      if (lastKnownPrice) {
        logger.warn('Using fallback price', { tokenSymbol, price: lastKnownPrice.priceUsd });
        return lastKnownPrice.priceUsd;
      }

      // Default fallback prices for PYUSD and USDC (approximately 1 USD)
      const fallbackPrices: { [key: string]: number } = {
        'PYUSD': 1.0,
        'USDC': 1.0
      };

      const fallbackPrice = fallbackPrices[tokenSymbol] || 1.0;
      logger.warn('Using default fallback price', { tokenSymbol, price: fallbackPrice });
      return fallbackPrice;
    }
  }

  /**
   * Fetch price from Pyth Network
   */
  private async fetchFromPyth(priceId: string): Promise<number> {
    const url = `${config.PYTH_PRICE_ENDPOINT}?ids[]=${priceId}`;
    
    const response = await axios.get<PythPriceResponse>(url, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'EVM-PayPal-Relayer/1.0'
      }
    });

    if (!response.data.parsed || response.data.parsed.length === 0) {
      throw new Error('No price data received from Pyth');
    }

    const priceData = response.data.parsed[0];
    const price = parseFloat(priceData.price.price);
    const expo = priceData.price.expo;
    
    // Convert price based on exponent
    const adjustedPrice = price * Math.pow(10, expo);
    
    if (adjustedPrice <= 0) {
      throw new Error('Invalid price received from Pyth');
    }

    return adjustedPrice;
  }

  /**
   * Get cached price from Redis
   */
  private async getCachedPrice(cacheKey: string): Promise<PriceData | null> {
    try {
      const cached = await redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Error getting cached price', { cacheKey, error });
      return null;
    }
  }

  /**
   * Set cached price in Redis
   */
  private async setCachedPrice(cacheKey: string, priceData: PriceData): Promise<void> {
    try {
      await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(priceData));
    } catch (error) {
      logger.error('Error setting cached price', { cacheKey, error });
    }
  }

  /**
   * Check if cached price is still valid
   */
  private isCacheValid(priceData: PriceData): boolean {
    const now = Date.now();
    const age = now - priceData.timestamp;
    return age < (this.cacheTTL * 1000);
  }

  /**
   * Convert token amount to USD
   */
  public async convertToUsd(amount: string, decimals: number, tokenSymbol: string, priceId: string): Promise<number> {
    const price = await this.getPrice(tokenSymbol, priceId);
    const amountBN = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const tokenAmount = Number(amountBN) / Number(divisor);
    return tokenAmount * price;
  }

  /**
   * Convert USD to token amount
   */
  public async convertFromUsd(usdAmount: number, decimals: number, tokenSymbol: string, priceId: string): Promise<string> {
    const price = await this.getPrice(tokenSymbol, priceId);
    const tokenAmount = usdAmount / price;
    const amountBN = BigInt(Math.floor(tokenAmount * (10 ** decimals)));
    return amountBN.toString();
  }
}