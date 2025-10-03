/**
 * ClearNode Connection Test
 *
 * Tests WebSocket connection to ClearNode without creating channels.
 * This saves gas by validating ClearNode connectivity before on-chain operations.
 */

import { loadWallets } from './utils/wallets';
import { connectToClearNode, authenticateClearNode } from './yellow-integration';
import { SEPOLIA_CONFIG } from './utils/contracts';

async function main() {
  console.log('\n🧪 CLEARNODE CONNECTION TEST\n');

  // Load wallets
  const wallets = loadWallets();
  const alice = wallets.alice;

  console.log(`Testing URL: ${SEPOLIA_CONFIG.clearNodeUrl}`);
  console.log(`Wallet: ${alice.name} (${alice.address})\n`);

  try {
    // Step 1: Connect to ClearNode
    console.log('1. Connecting to ClearNode WebSocket...');
    const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
    console.log('   ✅ WebSocket connected\n');

    // Step 2: Authenticate
    console.log('2. Authenticating with wallet signature...');
    await authenticateClearNode(ws, alice.client);
    console.log('   ✅ Authentication successful\n');

    // Success!
    console.log('🎉 ClearNode test PASSED!\n');
    console.log('You can now run: bun run play\n');

    // Cleanup
    ws.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ClearNode test FAILED\n');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('\nPossible causes:');
    console.error('- ClearNode server is offline');
    console.error('- URL is incorrect');
    console.error('- Network/firewall blocking WebSocket\n');
    process.exit(1);
  }
}

main();
