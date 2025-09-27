import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ILoggerService } from '../interfaces/relayer.interface';

@Injectable()
export class LoggerService implements NestLoggerService, ILoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.prettyPrint(),
    );

    // Create logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'slipstream-relayer' },
      transports: [
        // Write all logs with level 'error' and below to error.log
        new winston.transports.File({
          filename: join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        // Write all logs with level 'info' and below to combined.log
        new winston.transports.File({
          filename: join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        // Write all transaction logs to transactions.log
        new winston.transports.File({
          filename: join(logsDir, 'transactions.log'),
          level: 'info',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        }),
      ],
    });

    // If we're not in production, log to the console as well
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              let logMessage = `${timestamp} [${level}]: ${message}`;
              if (Object.keys(meta).length > 0) {
                logMessage += ` ${JSON.stringify(meta, null, 2)}`;
              }
              return logMessage;
            }),
          ),
        }),
      );
    }
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  logTransaction(type: string, data: any): void {
    this.logger.info(`TRANSACTION_${type.toUpperCase()}`, {
      type,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  logError(error: Error, context: any = {}): void {
    this.logger.error('Error occurred', {
      error: error.message,
      stack: error.stack,
      context,
    });
  }

  logRequest(req: any, res: any, responseTime: number): void {
    this.logger.info('API Request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
    });
  }
}
