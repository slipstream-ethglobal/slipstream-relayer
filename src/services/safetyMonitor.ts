import { logger } from '../utils/logger';
import { db } from '../database/postgres';
import { redis } from '../database/redis';
import { config } from '../config';
import { PriceService } from './priceService';
import { SafetyLimits } from '../types';

export class SafetyMonitor {
  private static instance: SafetyMonitor;
  private priceService: PriceService;

  private constructor() {
    this.priceService = PriceService.getInstance();
  }

  public static getInstance(): SafetyMonitor {
    if (!SafetyMonitor.instance) {
      SafetyMonitor.instance = new SafetyMonitor();
    }
    return SafetyMonitor.instance;
  }

  /**
   * Check if transaction is within safety limits
   */
  public async checkTransactionLimits(
    chainId: number,
    amount: string,
    tokenSymbol: string,
    priceId: string,
    decimals: number,
    userAddress: string
  ): Promise<{ allowed: boolean; reason?: string; limits: SafetyLimits }> {
    try {
      // Convert transaction amount to USD
      const transactionUsd = await this.priceService.convertToUsd(
        amount,
        decimals,
        tokenSymbol,
        priceId
      );

      // Check single transaction limit
      if (transactionUsd > config.MAX_SINGLE_TRANSACTION_USD) {
        return {
          allowed: false,
          reason: `Transaction amount ($${transactionUsd.toFixed(2)}) exceeds maximum allowed ($${config.MAX_SINGLE_TRANSACTION_USD})`,
          limits: await this.getCurrentLimits(chainId)
        };
      }

      // Check daily volume limit
      const currentDailyVolume = await this.getDailyVolume(chainId);
      const newDailyVolume = currentDailyVolume + transactionUsd;

      if (newDailyVolume > config.MAX_DAILY_VOLUME_USD) {
        return {
          allowed: false,
          reason: `Transaction would exceed daily volume limit. Current: $${currentDailyVolume.toFixed(2)}, Transaction: $${transactionUsd.toFixed(2)}, Limit: $${config.MAX_DAILY_VOLUME_USD}`,
          limits: await this.getCurrentLimits(chainId)
        };
      }

      // Check user-specific limits (per user per day)
      const userDailyLimit = 1000; // $1000 per user per day
      const userDailyVolume = await this.getUserDailyVolume(chainId, userAddress);
      const newUserVolume = userDailyVolume + transactionUsd;

      if (newUserVolume > userDailyLimit) {
        return {
          allowed: false,
          reason: `Transaction would exceed user daily limit. Current: $${userDailyVolume.toFixed(2)}, Transaction: $${transactionUsd.toFixed(2)}, Limit: $${userDailyLimit}`,
          limits: await this.getCurrentLimits(chainId)
        };
      }

      return {
        allowed: true,
        limits: await this.getCurrentLimits(chainId)
      };

    } catch (error) {
      logger.error('Error checking transaction limits', { chainId, amount, tokenSymbol, error });
      return {
        allowed: false,
        reason: 'Unable to verify transaction limits',
        limits: await this.getCurrentLimits(chainId)
      };
    }
  }

  /**
   * Record successful transaction for volume tracking
   */
  public async recordTransaction(
    chainId: number,
    amount: string,
    tokenSymbol: string,
    priceId: string,
    decimals: number,
    userAddress: string
  ): Promise<void> {
    try {
      const transactionUsd = await this.priceService.convertToUsd(
        amount,
        decimals,
        tokenSymbol,
        priceId
      );

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      // Update daily volume in database
      await db('daily_volumes')
        .insert({
          chain_id: chainId,
          date: today,
          volume_usd: transactionUsd,
          transaction_count: 1
        })
        .onConflict(['chain_id', 'date'])
        .merge({
          volume_usd: db.raw('daily_volumes.volume_usd + ?', [transactionUsd]),
          transaction_count: db.raw('daily_volumes.transaction_count + 1'),
          updated_at: new Date()
        });

      // Update user daily volume in Redis (expires at end of day)
      const userVolumeKey = `user_daily_volume:${chainId}:${userAddress}:${today}`;
      const currentUserVolume = await this.getUserDailyVolumeFromCache(userVolumeKey);
      const newUserVolume = currentUserVolume + transactionUsd;
      
      // Set expiry to end of day
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const secondsUntilEndOfDay = Math.floor((endOfDay.getTime() - Date.now()) / 1000);
      
      await redis.setEx(userVolumeKey, secondsUntilEndOfDay, newUserVolume.toString());

      logger.info('Transaction recorded for volume tracking', {
        chainId,
        tokenSymbol,
        transactionUsd,
        userAddress
      });

    } catch (error) {
      logger.error('Error recording transaction', { chainId, amount, tokenSymbol, error });
    }
  }

  /**
   * Get current daily volume for a chain
   */
  public async getDailyVolume(chainId: number): Promise<number> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const result = await db('daily_volumes')
        .select('volume_usd')
        .where({ chain_id: chainId, date: today })
        .first();

      return result ? parseFloat(result.volume_usd) : 0;

    } catch (error) {
      logger.error('Error getting daily volume', { chainId, error });
      return 0;
    }
  }

  /**
   * Get user daily volume
   */
  public async getUserDailyVolume(chainId: number, userAddress: string): Promise<number> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userVolumeKey = `user_daily_volume:${chainId}:${userAddress}:${today}`;
      return await this.getUserDailyVolumeFromCache(userVolumeKey);
    } catch (error) {
      logger.error('Error getting user daily volume', { chainId, userAddress, error });
      return 0;
    }
  }

  /**
   * Get user daily volume from Redis cache
   */
  private async getUserDailyVolumeFromCache(key: string): Promise<number> {
    try {
      const cached = await redis.get(key);
      return cached ? parseFloat(cached) : 0;
    } catch (error) {
      logger.error('Error getting cached user volume', { key, error });
      return 0;
    }
  }

  /**
   * Get current safety limits
   */
  public async getCurrentLimits(chainId: number): Promise<SafetyLimits> {
    const currentDailyVolumeUsd = await this.getDailyVolume(chainId);
    
    return {
      maxDailyVolumeUsd: config.MAX_DAILY_VOLUME_USD,
      maxSingleTransactionUsd: config.MAX_SINGLE_TRANSACTION_USD,
      currentDailyVolumeUsd
    };
  }

  /**
   * Reset daily volumes (called by cron job)
   */
  public async resetDailyVolumes(): Promise<void> {
    try {
      logger.info('Resetting daily volumes (automated cleanup)');
      
      // Keep last 30 days of volume data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

      await db('daily_volumes')
        .where('date', '<', cutoffDate)
        .del();

      logger.info('Daily volume cleanup completed');

    } catch (error) {
      logger.error('Error resetting daily volumes', { error });
    }
  }

  /**
   * Get volume statistics
   */
  public async getVolumeStats(chainId: number, days: number = 7): Promise<{
    totalVolume: number;
    totalTransactions: number;
    dailyAverageVolume: number;
    dailyAverageTransactions: number;
  }> {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      const startDate = daysAgo.toISOString().split('T')[0];

      const result = await db('daily_volumes')
        .select(
          db.raw('SUM(volume_usd) as total_volume'),
          db.raw('SUM(transaction_count) as total_transactions'),
          db.raw('AVG(volume_usd) as avg_volume'),
          db.raw('AVG(transaction_count) as avg_transactions')
        )
        .where('chain_id', chainId)
        .where('date', '>=', startDate);

      const stats = result[0];
      
      return {
        totalVolume: parseFloat(stats.total_volume || '0'),
        totalTransactions: parseInt(stats.total_transactions || '0'),
        dailyAverageVolume: parseFloat(stats.avg_volume || '0'),
        dailyAverageTransactions: parseFloat(stats.avg_transactions || '0')
      };

    } catch (error) {
      logger.error('Error getting volume stats', { chainId, days, error });
      return {
        totalVolume: 0,
        totalTransactions: 0,
        dailyAverageVolume: 0,
        dailyAverageTransactions: 0
      };
    }
  }
}