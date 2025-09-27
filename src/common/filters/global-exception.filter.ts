/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let details: any;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        details = (exceptionResponse as any).details;
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = this.getErrorMessage(exception);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    // Generate request ID for tracking
    const requestId =
      (request as any).requestId || Math.random().toString(36).substr(2, 9);

    const errorResponse = {
      success: false,
      error: message,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details && { details }),
    };

    // Log the error
    this.logger.error(
      `🚨 [${requestId}] ${request.method} ${request.url} - ${status}`,
      {
        error:
          exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
        requestId,
        method: request.method,
        url: request.url,
        userAgent: request.get('User-Agent'),
        ip: request.ip,
      },
    );

    response.status(status).json(errorResponse);
  }

  private getErrorMessage(error: Error): string {
    // Parse common errors for better user feedback
    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Rate limit exceeded, please try again later';
    }

    if (message.includes('unauthorized')) {
      return 'SDK not authorized for this operation';
    }

    if (message.includes('network') || message.includes('connection')) {
      return 'Network connection error, please try again';
    }

    if (message.includes('chain') && message.includes('not found')) {
      return 'Blockchain network not supported';
    }

    if (message.includes('token') && message.includes('not supported')) {
      return 'Token not supported on this network';
    }

    // Return original message if no specific pattern matches
    return error.message || 'Internal server error';
  }
}
