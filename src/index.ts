import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { config } from './config';
import { logger } from './utils/logger';
import { rateLimiter } from './middleware/rateLimiter';
import { initRedis } from './database/redis';
import { db } from './database/postgres';
import relayerRoutes from './routes/relayer';
import { SafetyMonitor } from './services/safetyMonitor';

const app = express();

// Initialize services
let safetyMonitor: SafetyMonitor;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: config.NODE_ENV === 'production' 
    ? ['http://localhost:3001', 'https://slipstream-proxy.onrender.com'] // frontend domains
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting
app.use(rateLimiter);

// Health check endpoint (before rate limiting)
app.get('/ping', (req, res) => {
  res.json({ 
    message: 'EVM PayPal Relayer is running!', 
    timestamp: new Date(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/v1/relayer', relayerRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: 'The requested endpoint does not exist'
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { 
    error: error.message, 
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: config.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Startup function
async function startServer() {
  try {
    logger.info('Starting EVM PayPal Relayer...', {
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      logLevel: config.LOG_LEVEL
    });

    // Test database connection
    // try {
    //   await db.raw('SELECT 1');
    //   logger.info('Database connection established');
    // } catch (dbError) {
    //   logger.error('Database connection failed', { error: dbError });
    //   throw dbError;
    // }

    // // Initialize Redis
    // try {
    //   await initRedis();
    //   logger.info('Redis connection established');
    // } catch (redisError) {
    //   logger.error('Redis connection failed', { error: redisError });
    //   throw redisError;
    // }

    // Initialize services
    safetyMonitor = SafetyMonitor.getInstance();

    // Setup cron jobs
    setupCronJobs();

    // Start server
    app.listen(config.PORT, () => {
      logger.info('🚀 EVM PayPal Relayer started successfully', {
        port: config.PORT,
        environment: config.NODE_ENV,
        relayerAddress: process.env.RELAYER_PRIVATE_KEY ? '✓ Configured' : '✗ Missing'
      });

      logger.info('📡 API Endpoints available:', {
        health: `http://localhost:${config.PORT}/ping`,
        relay: `http://localhost:${config.PORT}/api/v1/relayer/relay`,
        feeEstimate: `http://localhost:${config.PORT}/api/v1/relayer/fee/:chainId/:tokenSymbol/:amount`,
        transactionStatus: `http://localhost:${config.PORT}/api/v1/relayer/status/:transactionHash`,
        relayerInfo: `http://localhost:${config.PORT}/api/v1/relayer/info`,
        safetyLimits: `http://localhost:${config.PORT}/api/v1/relayer/limits/:chainId`,
        networkStatus: `http://localhost:${config.PORT}/api/v1/relayer/network/:chainId`,
        allRoutes: `http://localhost:${config.PORT}/api/v1/relayer/routes`
      });

      logger.info('💰 PayPal Track Configuration:', {
        supportedChains: ['Base Sepolia (84532)', 'Arbitrum Sepolia (421614)'],
        supportedTokens: ['PYUSD', 'USDC'],
        maxSingleTx: `$${config.MAX_SINGLE_TRANSACTION_USD}`,
        maxDailyVolume: `$${config.MAX_DAILY_VOLUME_USD}`
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Setup cron jobs
function setupCronJobs() {
  // Daily cleanup job (runs at 2 AM)
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Running daily cleanup job');
      await safetyMonitor.resetDailyVolumes();
    } catch (error) {
      logger.error('Error in daily cleanup job', { error });
    }
  });

  logger.info('Cron jobs scheduled');
}

// Start the server
startServer().catch((error) => {
  logger.error('Fatal error during startup', { error });
  process.exit(1);
});