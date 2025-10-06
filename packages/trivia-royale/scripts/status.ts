/**
 * Status Report Script
 *
 * Shows current status of all wallets:
 * - ETH balances (on-chain wallet balance)
 * - Off-chain ledger balances (ClearNode off-chain tracking)
 * - Custody balances (deposited in custody contract)
 * - Channel information (open channels, balances, participants)
 *
 * Usage:
 *   bun run status           # Show all wallets
 *   bun run status alice     # Show only Alice
 *   bun run status server    # Show only Server
 */

import { loadWallets } from './testWallets';
import type { Wallet } from '../src/core/wallets';
import { NitroliteClient, ChannelStatus } from '@erc7824/nitrolite';
import { SEPOLIA_CONFIG } from '../src/core/contracts';
import { connectToClearNode, authenticateClearNode } from '../src/rpc/connection';
import { getLedgerBalances } from '../src/rpc/channels';
import { getUSDCBalance, formatUSDC } from '../src/core/erc20';
import { formatEther } from 'viem';
import { getChannelWithBroker } from '../src/rpc/channels';
/**
 * Format USDC with more decimals for precision
 */
function formatUsdcBalance(wei: bigint): string {
  return formatUSDC(wei).padStart(14);
}

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Status Report\n');
  console.log(`💎 USDC Token: ${SEPOLIA_CONFIG.contracts.tokenAddress}\n`);

  const wallets = loadWallets();

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

  // Get wallet role icons
  const getRoleIcon = (name: string) => {
    switch (name) {
      case 'Funding': return '💰';
      case 'Broker': return '🏦';
      case 'Server': return '🎮';
      case 'Test': return '🧪';
      case 'Test2': return '🧬';
      case 'Test3': return '🔬';
      case 'Test4': return '⚗️';
      case 'Test5': return '🧫';
      case 'Test6': return '🔭';
      case 'Test7': return '🧮';
      case 'Test8': return '🔎';
      case 'Test9': return '🔬';
      case 'Test10': return '⚛️';
      case 'Test11': return '🧲';
      case 'Test12': return '💠';
      case 'Test13': return '🔮';
      case 'Test14': return '🌟';
      case 'Test15': return '⭐';
      case 'Test16': return '✨';
      case 'Test17': return '💫';
      case 'Test18': return '🌠';
      case 'Test19': return '☄️';
      case 'Test20': return '🌌';
      case 'Test21': return '🌀';
      case 'Test22': return '🎆';
      case 'Test23': return '🎇';
      case 'Test24': return '🎨';
      case 'Test25': return '🎭';
      case 'Test26': return '🎪';
      case 'Test27': return '🎬';
      case 'Test28': return '🎤';
      case 'Test29': return '🎧';
      case 'Test30': return '🎮';
      case 'Test31': return '🎯';
      case 'Test32': return '🎲';
      case 'Test33': return '🎰';
      case 'Test34': return '🎱';
      default: return '👤';
    }
  };

  // Wallet balances (both ETH and USDC)
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
  console.log('                                  WALLET BALANCES                                          ');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
  console.log('┌───┬──────────┬────────────────────────────────────────────┬──────────────┬──────────────┐');
  console.log('│   │ Wallet   │ Address                                    │ ETH (gas)    │ USDC (game)  │');
  console.log('├───┼──────────┼────────────────────────────────────────────┼──────────────┼──────────────┤');

  for (const wallet of walletsToShow) {
    const ethBalance = await wallet.publicClient.getBalance({ address: wallet.address });
    const usdcBalance = await getUSDCBalance(wallet);

    const icon = getRoleIcon(wallet.name);
    const ethFormatted = formatEther(ethBalance).padStart(12);
    const usdcFormatted = formatUsdcBalance(usdcBalance);

    console.log(`│ ${icon} │ ${wallet.name.padEnd(8)} │ ${wallet.address} │ ${ethFormatted} │ ${usdcFormatted} │`);
  }

  console.log('└───┴──────────┴────────────────────────────────────────────┴──────────────┴──────────────┘\n');

  // Off-chain ledger balances (from ClearNode)
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                         OFF-CHAIN LEDGER BALANCES                             ');
  console.log('                   (Updated by ClearNode Application Sessions)                 ');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Connect to ClearNode to get ledger balances
  const connections = new Map<string, WebSocket>();
  try {
    for (const wallet of walletsToShow) {
      const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
      await authenticateClearNode(ws, wallet);
      connections.set(wallet.name, ws);
    }

    // Display ledger balances
    for (const wallet of walletsToShow) {
      const ws = connections.get(wallet.name);
      if (!ws) continue;

      try {
        const ledgerBalances = await getLedgerBalances(ws, wallet);

        console.log(`┌─ ${wallet.name} (${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)})`);

        if (ledgerBalances && ledgerBalances.length > 0) {
          ledgerBalances.forEach((balance: any) => {
            console.log(`│  💎 ${balance.asset.toUpperCase()}: ${balance.amount}`);
          });
        } else {
          console.log(`│  ⚠️  No ledger balances found`);
        }

        console.log('└─────────────────────────────────────────────────────────────────\n');
      } catch (error) {
        console.log(`┌─ ${wallet.name}`);
        console.log(`│  ⚠️  Error fetching ledger balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('└─────────────────────────────────────────────────────────────────\n');
      }
    }
  } catch (error) {
    console.log(`⚠️  Failed to connect to ClearNode: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  } finally {
    // Clean up connections
    for (const [name, ws] of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }

  // Channel status for each wallet
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      CUSTODY & CHANNELS                           ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const wallet of walletsToShow) {
    try {
      // Create read-only NitroliteClient
      const client = new NitroliteClient({
        // @ts-expect-error - wallet.client is a WalletClient
        publicClient: wallet.publicClient,
        // @ts-expect-error - wallet.client is a WalletClient
        walletClient: wallet.walletClient,
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
      const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
      const brokerChannel = await getChannelWithBroker(ws, wallet, wallet.address);
      if (brokerChannel) {
      console.log(`│  🏦 Broker Channel: ${brokerChannel}`);
        const channelData = await client.getChannelData(brokerChannel);
        console.log(`│  🏦 Channel Data: ${channelData.channel.nonce}`);  
      }
      console.log(`┌─ ${wallet.name} (${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)})`);
      console.log(`│  💰 Custody Balance: ${formatUsdcBalance(custodyBalance)} USDC`);
      console.log(`│  📊 Open Channels: ${channelIds.length}`);

      if (channelIds.length > 0) {
        console.log('│');
        for (let i = 0; i < channelIds.length; i++) {
          const channelId = channelIds[i];
          if (!channelId) break;
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
          console.log(`│      • Balance: ${formatUsdcBalance(channelBalance)} USDC`);
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
