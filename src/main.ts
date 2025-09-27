import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cors from 'cors';

interface ExpressRequest {
  method: string;
  originalUrl: string;
}

interface ExpressResponse {
  statusCode: number;
  on: (event: string, callback: () => void) => void;
  status: (code: number) => ExpressResponse;
  json: (data: Record<string, unknown>) => void;
}

interface ExpressNextFunction {
  (): void;
}
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security middleware
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = configService.get<string[]>('allowedOrigins');
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Rate limiting
  const generalLimiter = rateLimit({
    windowMs: configService.get('rateLimit.windowMs'),
    max: configService.get('rateLimit.max'),
    message: {
      success: false,
      error: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Transfer rate limiting can be added later if needed
  // const transferLimiter = rateLimit({
  //   windowMs: configService.get('transferRateLimit.windowMs'),
  //   max: configService.get('transferRateLimit.max'),
  //   message: {
  //     success: false,
  //     error: 'Transfer rate limit exceeded, please try again later',
  //   },
  //   standardHeaders: true,
  //   legacyHeaders: false,
  // });

  app.use(generalLimiter);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global throttler guard is configured in app.module.ts

  // Request logging middleware
  app.use(
    (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logger.log(
          `API Request: ${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms`,
        );
      });

      next();
    },
  );

  // Error handling
  app.use((err: Error, req: ExpressRequest, res: ExpressResponse) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  });

  const port = configService.get<number>('port') || 3000;
  await app.listen(port);

  logger.log(`🚀 SlipStream Relayer Service started on port ${port}`);
  logger.log(`🌐 Environment: ${configService.get('nodeEnv')}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
