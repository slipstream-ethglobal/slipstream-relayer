import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { logger } from '../utils/logger';

// General rate limiter
export const rateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
    });
  }
});

// Strict rate limiter for relay endpoints
export const relayRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    error: 'Too many relay requests, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by IP and user address if available
    const userAddress = req.body?.from || '';
    return `${req.ip}:${userAddress}`;
  },
  handler: (req, res) => {
    logger.warn('Relay rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userAddress: req.body?.from,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: 'Too many relay requests, please try again later.',
      retryAfter: 60
    });
  }
});

// Rate limiter for fee estimation (more lenient)
export const feeRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: {
    error: 'Too many fee estimation requests, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});