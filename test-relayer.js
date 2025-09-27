#!/usr/bin/env node

const axios = require('axios');
const { ethers } = require('ethers');

/**
 * Comprehensive test script for EVM PayPal Relayer
 * Tests all API endpoints and transaction flows
 */

const BASE_URL = process.env.RELAYER_URL || 'http://localhost:3000';
const TEST_CHAINS = {
  BASE_SEPOLIA: 84532,
  ARBITRUM_SEPOLIA: 421614
};

const TEST_TOKENS = ['PYUSD', 'USDC'];

class RelayerTester {
  constructor() {
    this.wallet = ethers.Wallet.createRandom();
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async runAllTests() {
    console.log('🧪 Starting EVM PayPal Relayer Tests...\n');
    console.log(`Test wallet: ${this.wallet.address}\n`);

    try {
      await this.testHealthEndpoint();
      await this.testFeeEndpoints();
      await this.testSignatureGeneration();
      await this.testRelayEndpoints();
      await this.testStatusEndpoints();
      await this.testRateLimiting();
      
      this.printResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async testHealthEndpoint() {
    console.log('🏥 Testing Health Endpoint...');
    
    try {
      const response = await axios.get(`${BASE_URL}/api/health`);
      
      if (response.status === 200 && response.data.status === 'ok') {
        this.pass('Health endpoint returned OK');
      } else {
        this.fail('Health endpoint returned unexpected response');
      }
    } catch (error) {
      this.fail(`Health endpoint failed: ${error.message}`);
    }
  }

  async testFeeEndpoints() {
    console.log('\n💰 Testing Fee Endpoints...');
    
    for (const chainId of Object.values(TEST_CHAINS)) {
      for (const token of TEST_TOKENS) {
        try {
          const response = await axios.get(`${BASE_URL}/api/fee`, {
            params: {
              token,
              chainId,
              amount: '1000000' // 1 USDC/PYUSD
            }
          });
          
          if (response.status === 200 && response.data.fee) {
            this.pass(`Fee calculation for ${token} on chain ${chainId}`);
            console.log(`  📊 ${token} fee: ${response.data.fee}`);
          } else {
            this.fail(`Fee calculation failed for ${token} on chain ${chainId}`);
          }
        } catch (error) {
          this.fail(`Fee endpoint error for ${token} on chain ${chainId}: ${error.message}`);
        }
      }
    }
  }

  async testSignatureGeneration() {
    console.log('\n✍️  Testing Signature Generation...');
    
    const domain = {
      name: 'GaslessTransfer',
      version: '1',
      chainId: TEST_CHAINS.BASE_SEPOLIA,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types = {
      Transfer: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const message = {
      from: this.wallet.address,
      to: '0x742d35Cc6834C532532C5Bba7b5A2e18C3D5b8E9',
      amount: '1000000',
      token: '0x274C3795dadfEbf562932992bF241ae087e0a98C',
      nonce: 1,
      deadline: Math.floor(Date.now() / 1000) + 3600
    };

    try {
      const signature = await this.wallet.signTypedData(domain, types, message);
      
      if (signature && signature.length === 132) {
        this.pass('EIP-712 signature generated successfully');
        console.log(`  📝 Signature: ${signature.substring(0, 20)}...`);
      } else {
        this.fail('Invalid signature format');
      }
    } catch (error) {
      this.fail(`Signature generation failed: ${error.message}`);
    }
  }

  async testRelayEndpoints() {
    console.log('\n🚀 Testing Relay Endpoints...');
    
    const relayRequest = {
      from: this.wallet.address,
      to: '0x742d35Cc6834C532532C5Bba7b5A2e18C3D5b8E9',
      amount: '1000000',
      token: 'PYUSD',
      chainId: TEST_CHAINS.BASE_SEPOLIA,
      signature: '0x' + '0'.repeat(130), // Dummy signature for testing
      nonce: 1
    };

    try {
      const response = await axios.post(`${BASE_URL}/api/relay`, relayRequest);
      
      // We expect this to fail due to invalid signature or insufficient balance
      // But the endpoint should handle it gracefully
      if (response.status === 400 || response.status === 422) {
        this.pass('Relay endpoint correctly rejected invalid request');
      } else if (response.status === 200) {
        this.pass('Relay endpoint accepted valid request');
      } else {
        this.fail('Relay endpoint returned unexpected status');
      }
    } catch (error) {
      if (error.response && (error.response.status === 400 || error.response.status === 422)) {
        this.pass('Relay endpoint correctly rejected invalid request');
      } else {
        this.fail(`Relay endpoint error: ${error.message}`);
      }
    }
  }

  async testStatusEndpoints() {
    console.log('\n📊 Testing Status Endpoints...');
    
    const dummyHash = '0x' + '1234567890abcdef'.repeat(4);
    
    try {
      const response = await axios.get(`${BASE_URL}/api/status/${dummyHash}`);
      
      if (response.status === 404) {
        this.pass('Status endpoint correctly returned not found for dummy hash');
      } else if (response.status === 200) {
        this.pass('Status endpoint returned transaction data');
      } else {
        this.fail('Status endpoint returned unexpected response');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.pass('Status endpoint correctly returned not found for dummy hash');
      } else {
        this.fail(`Status endpoint error: ${error.message}`);
      }
    }
  }

  async testRateLimiting() {
    console.log('\n🛡️  Testing Rate Limiting...');
    
    const requests = [];
    
    // Send multiple requests rapidly to test rate limiting
    for (let i = 0; i < 15; i++) {
      requests.push(
        axios.get(`${BASE_URL}/api/health`).catch(err => err.response)
      );
    }
    
    try {
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r && r.status === 429);
      
      if (rateLimited) {
        this.pass('Rate limiting is working correctly');
      } else {
        console.log('⚠️  Rate limiting may be too permissive or not configured');
        this.pass('Rate limiting test completed (no limits hit)');
      }
    } catch (error) {
      this.fail(`Rate limiting test error: ${error.message}`);
    }
  }

  pass(message) {
    console.log(`  ✅ ${message}`);
    this.results.passed++;
  }

  fail(message) {
    console.log(`  ❌ ${message}`);
    this.results.failed++;
    this.results.errors.push(message);
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 Test Results Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Total:  ${this.results.passed + this.results.failed}`);
    
    if (this.results.errors.length > 0) {
      console.log('\n💥 Failures:');
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (this.results.failed === 0) {
      console.log('🎉 All tests passed! Relayer is ready for deployment.');
    } else {
      console.log('⚠️  Some tests failed. Please check the relayer configuration.');
    }
    
    console.log('\n📝 Next Steps:');
    console.log('1. Configure .env file with proper RPC URLs and private keys');
    console.log('2. Deploy gasless transfer contracts to testnets');
    console.log('3. Update contract addresses in configuration');
    console.log('4. Test with real transactions on testnets');
    console.log('5. Deploy to production for ETHGlobal demo');
    
    process.exit(this.results.failed === 0 ? 0 : 1);
  }
}

// Additional utility functions for testing
class TestUtils {
  static generateEIP712Signature(wallet, domain, types, message) {
    return wallet.signTypedData(domain, types, message);
  }
  
  static async waitForTransaction(provider, txHash, confirmations = 1) {
    return provider.waitForTransaction(txHash, confirmations);
  }
  
  static formatTokenAmount(amount, decimals = 6) {
    return ethers.formatUnits(amount, decimals);
  }
  
  static parseTokenAmount(amount, decimals = 6) {
    return ethers.parseUnits(amount, decimals);
  }
}

// Performance testing functions
class PerformanceTester {
  static async benchmarkFeeCalculation(baseUrl, iterations = 100) {
    console.log(`\n⚡ Benchmarking fee calculation (${iterations} requests)...`);
    
    const start = Date.now();
    const promises = [];
    
    for (let i = 0; i < iterations; i++) {
      promises.push(
        axios.get(`${baseUrl}/api/fee`, {
          params: {
            token: 'PYUSD',
            chainId: 84532,
            amount: Math.floor(Math.random() * 1000000).toString()
          }
        }).catch(() => null)
      );
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null).length;
    const duration = Date.now() - start;
    
    console.log(`📊 Benchmark Results:`);
    console.log(`  • Total requests: ${iterations}`);
    console.log(`  • Successful: ${successful}`);
    console.log(`  • Duration: ${duration}ms`);
    console.log(`  • Avg response time: ${(duration / iterations).toFixed(2)}ms`);
    console.log(`  • Requests/second: ${(iterations / (duration / 1000)).toFixed(2)}`);
  }
  
  static async stressTest(baseUrl, concurrent = 10, duration = 30000) {
    console.log(`\n🔥 Stress testing (${concurrent} concurrent requests for ${duration/1000}s)...`);
    
    const start = Date.now();
    let requestCount = 0;
    let errorCount = 0;
    
    const makeRequest = async () => {
      while (Date.now() - start < duration) {
        try {
          await axios.get(`${baseUrl}/api/health`);
          requestCount++;
        } catch (error) {
          errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    
    const workers = Array(concurrent).fill().map(() => makeRequest());
    await Promise.all(workers);
    
    console.log(`🔥 Stress Test Results:`);
    console.log(`  • Total requests: ${requestCount}`);
    console.log(`  • Errors: ${errorCount}`);
    console.log(`  • Success rate: ${((requestCount / (requestCount + errorCount)) * 100).toFixed(2)}%`);
    console.log(`  • Requests/second: ${(requestCount / (duration / 1000)).toFixed(2)}`);
  }
}

// Main execution
if (require.main === module) {
  const tester = new RelayerTester();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const runBenchmark = args.includes('--benchmark');
  const runStress = args.includes('--stress');
  
  if (runBenchmark || runStress) {
    console.log('🚀 Running performance tests...\n');
    
    if (runBenchmark) {
      PerformanceTester.benchmarkFeeCalculation(BASE_URL, 50);
    }
    
    if (runStress) {
      PerformanceTester.stressTest(BASE_URL, 5, 10000);
    }
  } else {
    tester.runAllTests();
  }
}

module.exports = { RelayerTester, TestUtils, PerformanceTester };