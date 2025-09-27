import axios, { AxiosResponse } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

interface PythPriceData {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

interface PythPriceResponse {
  binary: {
    encoding: string;
    data: string[];
  };
  parsed?: PythPriceData[];
}

export class PythPriceService {
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION_MS = 30000; // 30 seconds
  private readonly BASE_URL = config.PYTH_HERMES_API_URL;

  /**
   * Get the latest price for a token
   */
  async getPrice(priceId: string): Promise<number | null> {
    try {
      // Check cache first
      const cached = this.priceCache.get(priceId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached.price;
      }

      // Fetch from Pyth Network
      const response: AxiosResponse<PythPriceResponse> = await axios.get(
        `${this.BASE_URL}/v2/updates/price/latest`,
        {
          params: {
            ids: [priceId],
            encoding: 'hex',
            parsed: true
          },
          timeout: 5000
        }
      );

      if (!response.data.parsed || response.data.parsed.length === 0) {
        logger.warn(`No price data found for price ID: ${priceId}`);
        return null;
      }

      const priceData = response.data.parsed[0];
      const price = parseFloat(priceData.price.price) * Math.pow(10, priceData.price.expo);

      // Cache the price
      this.priceCache.set(priceId, {
        price,
        timestamp: Date.now()
      });

      logger.debug(`Retrieved price for ${priceId}: $${price}`);
      return price;

    } catch (error) {
      logger.error(`Failed to fetch price for ${priceId}:`, error);
      return null;
    }
  }

  /**
   * Get prices for multiple tokens
   */
  async getPrices(priceIds: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    try {
      const response: AxiosResponse<PythPriceResponse> = await axios.get(
        `${this.BASE_URL}/v2/updates/price/latest`,
        {
          params: {
            ids: priceIds,
            encoding: 'hex',
            parsed: true
          },
          timeout: 10000
        }
      );

      if (response.data.parsed) {
        for (const priceData of response.data.parsed) {
          const price = parseFloat(priceData.price.price) * Math.pow(10, priceData.price.expo);
          prices.set(priceData.id, price);
          
          // Cache the price
          this.priceCache.set(priceData.id, {
            price,
            timestamp: Date.now()
          });
        }
      }

      logger.debug(`Retrieved ${prices.size} prices from Pyth`);
      return prices;

    } catch (error) {
      logger.error('Failed to fetch multiple prices:', error);
      return prices;
    }
  }

  /**
   * Get price update data for on-chain verification
   */
  async getPriceUpdateData(priceIds: string[]): Promise<string[]> {
    try {
      const response: AxiosResponse<PythPriceResponse> = await axios.get(
        `${this.BASE_URL}/v2/updates/price/latest`,
        {
          params: {
            ids: priceIds,
            encoding: 'hex'
          },
          timeout: 10000
        }
      );

      return response.data.binary?.data || [];

    } catch (error) {
      logger.error('Failed to fetch price update data:', error);
      return [];
    }
  }

  /**
   * Calculate USD value for a token amount
   */
  async calculateUsdValue(
    tokenAmount: bigint,
    tokenDecimals: number,
    priceId: string
  ): Promise<number | null> {
    const price = await this.getPrice(priceId);
    if (!price) return null;

    const tokenAmountNumber = parseFloat(tokenAmount.toString()) / Math.pow(10, tokenDecimals);
    return tokenAmountNumber * price;
  }

  /**
   * Convert USD amount to token amount
   */
  async convertFromUsd(
    usdAmount: number,
    tokenDecimals: number,
    tokenSymbol: string,
    priceId: string
  ): Promise<string> {
    const price = await this.getPrice(priceId);
    if (!price || price === 0) {
      logger.warn(`No price available for ${tokenSymbol}, returning 0`);
      return '0';
    }

    const tokenAmount = usdAmount / price;
    const tokenAmountWei = Math.floor(tokenAmount * Math.pow(10, tokenDecimals));
    return tokenAmountWei.toString();
  }

  /**
   * Convert token amount to USD
   */
  async convertToUsd(
    tokenAmount: string,
    tokenDecimals: number,
    tokenSymbol: string,
    priceId: string
  ): Promise<string> {
    const price = await this.getPrice(priceId);
    if (!price) {
      logger.warn(`No price available for ${tokenSymbol}, returning 0`);
      return '0';
    }

    const tokenAmountNumber = parseFloat(tokenAmount) / Math.pow(10, tokenDecimals);
    const usdValue = tokenAmountNumber * price;
    return usdValue.toFixed(4);
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [priceId, cached] of this.priceCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_DURATION_MS) {
        this.priceCache.delete(priceId);
      }
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.priceCache.size,
      entries: Array.from(this.priceCache.keys())
    };
  }
}

// Singleton instance
export const pythPriceService = new PythPriceService();