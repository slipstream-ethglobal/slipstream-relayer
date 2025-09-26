export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['*'],

  // Rate limiting configuration
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
  },

  // Transfer rate limiting
  transferRateLimit: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // Limit each IP to 10 transfers per windowMs
  },
});
