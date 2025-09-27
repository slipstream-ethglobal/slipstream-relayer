import { createClient } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

const redis = createClient({
  url: config.REDIS_URL
});

redis.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redis.on('connect', () => {
  logger.info('Redis Client Connected');
});

redis.on('ready', () => {
  logger.info('Redis Client Ready');
});

export const initRedis = async () => {
  try {
    await redis.connect();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis', error);
    throw error;
  }
};

export { redis };
export default redis;