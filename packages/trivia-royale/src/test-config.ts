/**
 * Test ClearNode Configuration
 *
 * This script calls the get_config RPC method to retrieve ClearNode's
 * broker address and network configuration, then compares it with our
 * local SEPOLIA_CONFIG.
 */

import { parseAnyRPCResponse, RPCMethod } from '@erc7824/nitrolite';
import { SEPOLIA_CONFIG } from './utils/contracts';

async function testGetConfig() {
  console.log('🔍 Testing ClearNode Configuration\n');

  // Connect to ClearNode
  const ws = new WebSocket(SEPOLIA_CONFIG.clearNodeUrl);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      console.log('✅ Connected to ClearNode\n');
      resolve();
    };
    ws.onerror = (error) => {
      console.error('❌ Connection error:', error);
      reject(error);
    };
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  // Send get_config request (no auth required - it's a public method)
  const request = {
    req: [Date.now(), 'get_config', {}, Date.now()],
    sig: [],
  };

  console.log('📤 Sending get_config request...\n');
  ws.send(JSON.stringify(request));

  // Wait for response
  await new Promise<void>((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const response = parseAnyRPCResponse(event.data);
        console.log('📨 Received response:', JSON.stringify(response, null, 2));

        if (response.method === RPCMethod.GetConfig) {
          ws.removeEventListener('message', handleMessage);

          // Note: SDK parses field names to camelCase
          const { brokerAddress, networks } = response.params;

          console.log('\n📊 ClearNode Configuration:');
          console.log(`   Broker Address: ${brokerAddress}`);
          console.log(`   Networks: ${networks.length}\n`);

          // Find Sepolia network (using camelCase chainId)
          const sepoliaNetwork = networks.find((n: any) => n.chainId === SEPOLIA_CONFIG.chainId);

          console.log('🔍 Comparing with our SEPOLIA_CONFIG:\n');

          console.log('   Broker Address:');
          console.log(`     Ours:      ${SEPOLIA_CONFIG.contracts.brokerAddress}`);
          console.log(`     ClearNode: ${brokerAddress}`);
          console.log(`     Match: ${SEPOLIA_CONFIG.contracts.brokerAddress.toLowerCase() === brokerAddress?.toLowerCase() ? '✅' : '❌'}\n`);

          if (sepoliaNetwork) {
            console.log('   Sepolia Network (chain_id: 11155111):');
            console.log(`     Custody Contract:`);
            console.log(`       Ours:      ${SEPOLIA_CONFIG.contracts.custody}`);
            console.log(`       ClearNode: ${sepoliaNetwork.custodyAddress}`);
            console.log(`       Match: ${SEPOLIA_CONFIG.contracts.custody.toLowerCase() === sepoliaNetwork.custodyAddress?.toLowerCase() ? '✅' : '❌'}\n`);

            console.log(`     Adjudicator Contract:`);
            console.log(`       Ours:      ${SEPOLIA_CONFIG.contracts.adjudicator}`);
            console.log(`       ClearNode: ${sepoliaNetwork.adjudicatorAddress}`);
            console.log(`       Match: ${SEPOLIA_CONFIG.contracts.adjudicator.toLowerCase() === sepoliaNetwork.adjudicatorAddress?.toLowerCase() ? '✅' : '❌'}\n`);
          } else {
            console.log('   ❌ Sepolia network (chain_id: 11155111) NOT FOUND in ClearNode config!');
            console.log('   Available networks:');
            networks.forEach((n: any) => {
              console.log(`     - Chain ID: ${n.chainId}`);
            });
          }

          ws.close();
          resolve();
        } else if (response.method === RPCMethod.Error) {
          console.error('❌ ClearNode error:', response.params);
          ws.removeEventListener('message', handleMessage);
          ws.close();
          reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
        }
      } catch (error) {
        console.error('❌ Error parsing response:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      ws.close();
      reject(new Error('Response timeout'));
    }, 10000);
  });
}

// Run the test
testGetConfig()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
