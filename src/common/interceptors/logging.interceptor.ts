/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    // Add request ID to request object for tracking

    (request as any).requestId = requestId;

    // Log incoming request
    this.logger.log(`📥 [${requestId}] ${request.method} ${request.path}`, {
      method: request.method,
      path: request.path,
      query: Object.keys(request.query).length > 0 ? request.query : undefined,
      userAgent: request.get('User-Agent'),
      ip: request.ip || request.connection?.remoteAddress,
      timestamp: new Date().toISOString(),
      requestId,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          const statusCode = response.statusCode;
          const logLevel =
            statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'log';

          this.logger[logLevel](
            `📤 [${requestId}] ${request.method} ${request.path} - ${statusCode}`,
            {
              method: request.method,
              path: request.path,
              statusCode,
              responseTime: `${responseTime}ms`,
              requestId,
              dataSize: data ? JSON.stringify(data).length : 0,
            },
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `❌ [${requestId}] ${request.method} ${request.path} - ERROR`,
            {
              method: request.method,
              path: request.path,
              error: error.message,
              responseTime: `${responseTime}ms`,
              requestId,
            },
          );
        },
      }),
    );
  }
}
