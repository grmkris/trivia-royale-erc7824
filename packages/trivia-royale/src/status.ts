/**
 * Status Report Script
 *
 * Shows current status of all wallets:
 * - ETH balances
 * - Channel status (TODO)
 * - ClearNode connectivity (TODO)
 */

import { formatEther } from 'viem';
import { loadWallets, createPublicRpcClient } from './utils/wallets';

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Status Report\n');

  const wallets = loadWallets();
  const publicClient = createPublicRpcClient();

  // Check balances
  console.log('┌──────────┬────────────────────────────────────────────┬──────────┐');
  console.log('│ Wallet   │ Address                                    │ ETH      │');
  console.log('├──────────┼────────────────────────────────────────────┼──────────┤');

  for (const wallet of wallets) {
    const balance = await publicClient.getBalance({ address: wallet.address });
    const ethBalance = formatEther(balance).padStart(8);

    console.log(`│ ${wallet.name.padEnd(8)} │ ${wallet.address} │ ${ethBalance} │`);
  }

  console.log('└──────────┴────────────────────────────────────────────┴──────────┘\n');

  // TODO: Add channel status
  // TODO: Add ClearNode connectivity test
}

main().catch(console.error);
