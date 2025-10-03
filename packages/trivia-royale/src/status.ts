/**
 * Status Report Script
 *
 * Shows current status of all wallets:
 * - ETH balances (on-chain wallet balance)
 * - Custody balances (deposited in custody contract)
 * - Channel information (open channels, balances, participants)
 *
 * Usage:
 *   bun run status           # Show all wallets
 *   bun run status alice     # Show only Alice
 *   bun run status server    # Show only Server
 */

import { formatEther } from 'viem';
import { loadWallets, createPublicRpcClient, type Wallet } from './utils/wallets';
import { NitroliteClient, ChannelStatus } from '@erc7824/nitrolite';
import { SEPOLIA_CONFIG } from './utils/contracts';

/**
 * Format ETH with more decimals for precision
 */
function formatEthBalance(wei: bigint): string {
  return formatEther(wei).padStart(14);
}

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Status Report\n');

  const wallets = loadWallets();
  const publicClient = createPublicRpcClient();

  // Parse filter argument (e.g., "alice", "bob1", "server")
  const filterName = process.argv[2]?.toLowerCase();

  let walletsToShow: Wallet[];
  if (filterName) {
    walletsToShow = wallets.all.filter(w => w.name.toLowerCase().includes(filterName));
    if (walletsToShow.length === 0) {
      console.log(`❌ No wallet found matching "${filterName}"`);
      console.log(`Available wallets: ${wallets.all.map(w => w.name).join(', ')}`);
      process.exit(1);
    }
    console.log(`Filtering: ${walletsToShow.map(w => w.name).join(', ')}\n`);
  } else {
    walletsToShow = wallets.all;
  }

  // Wallet balances
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                              WALLET BALANCES                                  ');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('┌──────────┬────────────────────────────────────────────┬────────────────┐');
  console.log('│ Wallet   │ Address                                    │ ETH            │');
  console.log('├──────────┼────────────────────────────────────────────┼────────────────┤');

  for (const wallet of walletsToShow) {
    const balance = await publicClient.getBalance({ address: wallet.address });
    const ethBalance = formatEthBalance(balance);

    console.log(`│ ${wallet.name.padEnd(8)} │ ${wallet.address} │ ${ethBalance} │`);
  }

  console.log('└──────────┴────────────────────────────────────────────┴────────────────┘\n');

  // Channel status for each wallet
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      CUSTODY & CHANNELS                           ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const wallet of walletsToShow) {
    try {
      // Create read-only NitroliteClient
      const client = new NitroliteClient({
        publicClient,
        walletClient: wallet.client,
        stateSigner: null as any, // Not needed for read operations
        challengeDuration: 3600n,
        addresses: {
          custody: SEPOLIA_CONFIG.contracts.custody,
          adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
          guestAddress: wallet.address, // Dummy, not used for reads
        },
        chainId: SEPOLIA_CONFIG.chainId,
      });

      // Get custody balance
      const custodyBalance = await client.getAccountBalance(SEPOLIA_CONFIG.contracts.tokenAddress);

      // Get open channels
      const channelIds = await client.getOpenChannels();

      console.log(`┌─ ${wallet.name} (${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)})`);
      console.log(`│  💰 Custody Balance: ${formatEthBalance(custodyBalance)} ETH`);
      console.log(`│  📊 Open Channels: ${channelIds.length}`);

      if (channelIds.length > 0) {
        console.log('│');
        for (let i = 0; i < channelIds.length; i++) {
          const channelId = channelIds[i];
          const channelData = await client.getChannelData(channelId);
          const channelBalance = await client.getChannelBalance(
            channelId,
            SEPOLIA_CONFIG.contracts.tokenAddress
          );

          // Find counterparty (the other participant)
          const counterparty = channelData.channel.participants.find(
            (addr) => addr.toLowerCase() !== wallet.address.toLowerCase()
          );

          // Map status enum to readable string
          const statusNames = ['VOID', 'INITIAL', 'ACTIVE', 'DISPUTE', 'FINAL'];
          const statusName = statusNames[channelData.status] || 'UNKNOWN';

          const prefix = i === channelIds.length - 1 ? '└──' : '├──';
          console.log(`│  ${prefix} Channel ${channelId.slice(0, 10)}...`);
          console.log(`│      • Status: ${statusName}`);
          console.log(`│      • Counterparty: ${counterparty?.slice(0, 10)}...${counterparty?.slice(-8)}`);
          console.log(`│      • Balance: ${formatEthBalance(channelBalance)} ETH`);
          console.log(`│      • State Version: ${channelData.lastValidState.version}`);
          if (i < channelIds.length - 1) console.log('│');
        }
      }

      console.log('└─────────────────────────────────────────────────────────────────\n');
    } catch (error) {
      console.log(`┌─ ${wallet.name}`);
      console.log(`│  ⚠️  Error fetching channel data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log('└─────────────────────────────────────────────────────────────────\n');
    }
  }
}

main().catch(console.error);
