/**
 * Cashout Script
 *
 * Withdraws off-chain winnings to on-chain wallet.
 *
 * Flow:
 * 1. Check current balances (wallet, ledger, custody, channels)
 * 2. If open channel exists → close it (moves funds channel → custody)
 * 3. If custody has balance → withdraw it (moves funds custody → wallet)
 * 4. Verify final wallet balance
 *
 * Usage:
 *   bun run cashout alice
 *   bun run cashout bob
 */

import { loadWallets } from './testWallets';
import { createPublicRpcClient, createNitroliteClient, type Wallet } from '../src/core/wallets';
import { SEPOLIA_CONFIG, getEtherscanTxLink } from '../src/core/contracts';
import { connectToClearNode, authenticateClearNode } from '../src/rpc/connection';
import {
  getLedgerBalances,
  getChannelWithBroker,
  closeChannelViaRPC
} from '../src/rpc/channels';
import { getUSDCBalance, formatUSDC } from '../src/core/erc20';
import { formatEther } from 'viem';

async function cashout(wallet: Wallet) {
  console.log(`\n💰 CASHOUT - ${wallet.name}\n`);

  const publicClient = createPublicRpcClient();

  // Step 1: Check all balances
  console.log('📊 Current Balances:\n');

  const walletBalance = await getUSDCBalance(wallet);
  console.log(`   Wallet:  ${formatUSDC(walletBalance)} USDC`);

  // Connect to ClearNode
  const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
  await authenticateClearNode(ws, wallet);

  const ledgerBalances = await getLedgerBalances(ws, wallet);
  const ledgerBalance = ledgerBalances.find(b => b.asset === SEPOLIA_CONFIG.game.asset);
  console.log(`   Ledger:  ${ledgerBalance?.amount || '0'} USDC (off-chain)`);

  // Check custody balance
  const nitroliteClient = createNitroliteClient(wallet, SEPOLIA_CONFIG.contracts.brokerAddress);
  const custodyBalance = await nitroliteClient.getAccountBalance(SEPOLIA_CONFIG.contracts.tokenAddress);
  console.log(`   Custody: ${formatUSDC(custodyBalance)} USDC (on-chain escrow)`);

  // Check open channels
  const channelId = await getChannelWithBroker(ws, wallet, SEPOLIA_CONFIG.contracts.brokerAddress);
  if (channelId) {
    const channelBalance = await nitroliteClient.getChannelBalance(
      channelId,
      SEPOLIA_CONFIG.contracts.tokenAddress
    );
    console.log(`   Channel: ${formatUSDC(channelBalance)} USDC (open channel ${channelId.slice(0, 10)}...)`);
  } else {
    console.log(`   Channel: No open channels`);
  }

  // Step 2: Close channel if exists
  if (channelId) {
    console.log(`🔒 Closing channel ${channelId.slice(0, 10)}...`);
    console.log(`   ClearNode will calculate final balances (including off-chain winnings)\n`);

    await closeChannelViaRPC(ws, wallet, channelId);
    console.log(`✅ Channel closed (funds moved to custody)\n`);

    // Wait for channel close to settle
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Re-check custody balance
    const newCustodyBalance = await nitroliteClient.getAccountBalance(SEPOLIA_CONFIG.contracts.tokenAddress);
    console.log(`   New custody balance: ${formatUSDC(newCustodyBalance)} USDC\n`);
  }

  // Step 3: Withdraw from custody
  const finalCustodyBalance = await nitroliteClient.getAccountBalance(SEPOLIA_CONFIG.contracts.tokenAddress);

  if (finalCustodyBalance > 0n) {
    console.log(`💸 Withdrawing ${formatUSDC(finalCustodyBalance)} USDC from custody...\n`);

    const txHash = await nitroliteClient.withdrawal(
      SEPOLIA_CONFIG.contracts.tokenAddress,
      finalCustodyBalance
    );

    console.log(`   📤 Transaction submitted: ${getEtherscanTxLink(txHash)}`);

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`   ✅ Withdrawal confirmed\n`);
  } else {
    console.log(`ℹ️  No funds in custody to withdraw\n`);
  }

  // Step 4: Verify final balance
  const finalWalletBalance = await getUSDCBalance(wallet);
  const finalLedgerBalances = await getLedgerBalances(ws, wallet);
  const finalLedgerBalance = finalLedgerBalances.find(b => b.asset === SEPOLIA_CONFIG.game.asset);

  console.log('📊 Final Balances:\n');
  console.log(`   Wallet:  ${formatUSDC(finalWalletBalance)} USDC (was ${formatUSDC(walletBalance)})`);
  console.log(`   Ledger:  ${finalLedgerBalance?.amount || '0'} USDC (was ${ledgerBalance?.amount || '0'})`);
  console.log(`   Custody: 0 USDC\n`);

  const profit = finalWalletBalance - walletBalance;
  if (profit > 0n) {
    console.log(`🎉 Success! Cashed out ${formatUSDC(profit)} USDC in winnings!\n`);
  } else if (profit < 0n) {
    console.log(`📉 Net loss: ${formatUSDC(-profit)} USDC\n`);
  } else {
    console.log(`➡️  No change in wallet balance\n`);
  }

  // Cleanup
  ws.close();
}

async function main() {
  const wallets = loadWallets();

  // Parse wallet name from command line (e.g., "alice", "bob")
  const walletName = process.argv[2]?.toLowerCase();

  if (!walletName) {
    console.log('❌ Please specify a wallet name\n');
    console.log('Usage: bun run cashout <wallet>\n');
    console.log('Available wallets:');
    console.log(`   ${wallets.players.map(w => w.name.toLowerCase()).join(', ')}\n`);
    process.exit(1);
  }

  const wallet = wallets.all.find(w => w.name.toLowerCase() === walletName);

  if (!wallet) {
    console.log(`❌ Wallet "${walletName}" not found\n`);
    console.log('Available wallets:');
    console.log(`   ${wallets.players.map(w => w.name.toLowerCase()).join(', ')}\n`);
    process.exit(1);
  }

  await cashout(wallet);
}

main().catch(console.error);
