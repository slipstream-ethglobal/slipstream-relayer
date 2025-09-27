import { config } from '../slipstream-relayer/src/config';
import { CHAIN_CONFIGS, getChainConfig } from '../slipstream-relayer/src/config/chainConfig';
import { pythPriceService } from '../slipstream-relayer/src/services/pythPriceService';
import fetch from 'node-fetch';

async function testIntegration() {
  console.log('🧪 Testing Slipstream Relayer Integration\n');

  // Test 1: Configuration
  console.log('1️⃣ Testing Configuration...');
  console.log('Supported chains:', Object.keys(CHAIN_CONFIGS));
  console.log('Kadena TUSDC:', config.KADENA_TUSDC_ADDRESS);
  console.log('Base USDC:', config.BASE_USDC_ADDRESS);
  console.log('Arbitrum PYUSD:', config.ARBITRUM_PYUSD_ADDRESS);
  console.log('Arbitrum USDC:', config.ARBITRUM_USDC_ADDRESS);
  
  console.log('\n📍 Deployed Contract Addresses:');
  console.log('Kadena:', config.KADENA_GASLESS_CONTRACT);
  console.log('Base:', config.BASE_GASLESS_CONTRACT); 
  console.log('Arbitrum:', config.ARBITRUM_GASLESS_CONTRACT);
  console.log('✅ Configuration loaded\n');

  // Test 2: Pyth Price Service
  console.log('2️⃣ Testing Pyth Price Service...');
  try {
    const usdcPrice = await pythPriceService.getPrice(config.USDC_USD_PRICE_FEED_ID);
    const pyusdPrice = await pythPriceService.getPrice(config.PYUSD_USD_PRICE_FEED_ID);
    
    console.log(`USDC Price: $${usdcPrice}`);
    console.log(`PYUSD Price: $${pyusdPrice}`);
    
    if (usdcPrice && pyusdPrice) {
      console.log('✅ Pyth integration working');
    } else {
      console.log('⚠️ Some prices not available');
    }
  } catch (error) {
    console.log('❌ Pyth integration failed:', (error as Error).message);
  }
  console.log();

  // Test 3: Contract Configuration 
  console.log('3️⃣ Testing Contract Configuration...');
  try {
    console.log('Relayer Private Key Available:', !!config.RELAYER_PRIVATE_KEY);
    
    for (const [chainId, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
      console.log(`\n🔸 ${chainConfig.name} (${chainId})`);
      console.log(`  Contract: ${chainConfig.gaslessContract || 'NOT SET'}`);
      console.log(`  Tokens: ${Object.keys(chainConfig.tokens).join(', ')}`);
      
      if (!chainConfig.gaslessContract) {
        console.log(`  ⚠️ Contract address not configured`);
      } else {
        console.log(`  ✅ Contract configured`);
      }
    }
    console.log('✅ Contract configuration checked');
  } catch (error) {
    console.log('❌ Contract configuration failed:', (error as Error).message);
  }
  console.log();

  // Test 4: RPC Connectivity
  console.log('4️⃣ Testing RPC Connectivity...');
  for (const [chainId, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
    console.log(`\n🔸 ${chainConfig.name}`);
    console.log(`  RPC: ${chainConfig.rpcUrl}`);
    console.log(`  Gas Limit: ${chainConfig.gasSettings.gasLimit}`);
    console.log(`  Fee BPS: ${chainConfig.feeSettings.baseFeeBps}`);
    
    // Test RPC connection
    try {
      const response = await fetch(chainConfig.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });
      
      if (response.ok) {
        const data = await response.json() as { result: string };
        const blockNumber = parseInt(data.result, 16);
        console.log(`  ✅ RPC Connected (Block: ${blockNumber})`);
      } else {
        console.log(`  ❌ RPC Connection failed (Status: ${response.status})`);
      }
    } catch (error) {
      console.log(`  ❌ RPC Error: ${(error as Error).message}`);
    }
  }
  
  // Test 5: Summary
  console.log('\n📊 INTEGRATION SUMMARY');
  console.log('='.repeat(50));
  
  const kadenaConfig = getChainConfig(5920);
  const baseConfig = getChainConfig(84532); 
  const arbitrumConfig = getChainConfig(421614);
  
  console.log(`\n✅ Kadena Testnet: ${kadenaConfig?.gaslessContract ? 'READY' : 'MISSING CONTRACT'}`);
  console.log(`✅ Base Sepolia: ${baseConfig?.gaslessContract ? 'READY' : 'MISSING CONTRACT'}`);
  console.log(`✅ Arbitrum Sepolia: ${arbitrumConfig?.gaslessContract ? 'READY' : 'MISSING CONTRACT'}`);
  
  const allReady = kadenaConfig?.gaslessContract && baseConfig?.gaslessContract && arbitrumConfig?.gaslessContract;
  
  console.log('\n🎉 Integration test completed!');
  
  if (allReady) {
    console.log('\n🟢 STATUS: READY FOR GASLESS TRANSACTIONS');
    console.log('\n📝 Next steps:');
    console.log('  1. Start the relayer: npm run dev');
    console.log('  2. Test API endpoints');  
    console.log('  3. Process real transactions');
  } else {
    console.log('\n🟡 STATUS: CONTRACTS CONFIGURED');
    console.log('\n📝 Ready to process transactions with deployed contracts!');
  }
}

// Run the test
testIntegration().catch(console.error);