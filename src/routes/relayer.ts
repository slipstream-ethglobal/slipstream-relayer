import { Router } from 'express';
import { RelayerController } from '../controllers/relayerController';
import { relayRateLimiter, feeRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const relayerController = new RelayerController();

// Health check (no rate limiting needed)
router.get('/ping', relayerController.ping);

// Relay transaction endpoint (strict rate limiting)
router.post('/relay', relayRateLimiter, relayerController.relayTransaction);

// Fee estimation endpoint (moderate rate limiting)
router.get('/fee/:chainId/:tokenSymbol/:amount', feeRateLimiter, relayerController.getFeeEstimate);

// Transaction status endpoint
router.get('/status/:transactionHash', relayerController.getTransactionStatus);

// Relayer information endpoint
router.get('/info', relayerController.getRelayerInfo);

// Safety limits endpoint
router.get('/limits/:chainId', relayerController.getSafetyLimits);

// Network status endpoint
router.get('/network/:chainId', relayerController.getNetworkStatus);

export default router;