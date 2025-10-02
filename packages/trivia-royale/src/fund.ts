/**
 * Fund Distribution Script
 *
 * Distributes ETH from Master wallet to all player and server wallets
 */

import { parseEther, formatEther } from 'viem';
import {
  loadWallets,
  getMasterWallet,
  getPlayerWallets,
  getServerWallet,
  createPublicRpcClient,
  type Wallet,
} from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';

/**
 * Send ETH from master to target wallet
 */
async function sendETH(
  master: Wallet,
  target: Wallet,
  amount: string
): Promise<void> {
  const amountWei = parseEther(amount);

  const hash = await master.client.sendTransaction({
    account: master.account,
    to: target.address,
    value: amountWei,
  });

  console.log(`   ✅ ${target.name}: Sent ${amount} ETH (tx: ${hash.slice(0, 10)}...)`);
}

/**
 * Main distribution function
 */
async function distributeFunds(
  master: Wallet,
  recipients: Wallet[],
  amountPerWallet: string
): Promise<void> {
  console.log(`💸 Distributing ${amountPerWallet} ETH to each wallet...\n`);

  for (const recipient of recipients) {
    await sendETH(master, recipient, amountPerWallet);

    // Small delay between transactions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ All distributions complete!');
}

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Fund Distribution\n');

  const wallets = loadWallets();
  const master = getMasterWallet(wallets);
  const players = getPlayerWallets(wallets);
  const server = getServerWallet(wallets);
  const publicClient = createPublicRpcClient();

  // Check master balance
  const masterBalance = await publicClient.getBalance({ address: master.address });

  console.log('💰 Master Wallet:\n');
  console.log(`   Address: ${master.address}`);
  console.log(`   Balance: ${formatEther(masterBalance)} ETH\n`);

  const requiredAmount = parseEther(SEPOLIA_CONFIG.funding.distributionAmount) * BigInt(6);

  if (masterBalance < requiredAmount) {
    console.log('❌ Insufficient funds in master wallet!\n');
    console.log(`   Required: ${formatEther(requiredAmount)} ETH`);
    console.log(`   Available: ${formatEther(masterBalance)} ETH\n`);
    console.log('📋 Fund master wallet first:');
    console.log('   bun run prepare\n');
    return;
  }

  // Distribute to all wallets
  const recipients = [...players, server];
  await distributeFunds(master, recipients, SEPOLIA_CONFIG.funding.distributionAmount);

  // Show final balances
  console.log('\n💰 Final Balances:\n');

  for (const wallet of recipients) {
    const balance = await publicClient.getBalance({ address: wallet.address });
    console.log(`   ${wallet.name.padEnd(8)}: ${formatEther(balance)} ETH`);
  }

  const finalMasterBalance = await publicClient.getBalance({ address: master.address });
  console.log(`   ${master.name.padEnd(8)}: ${formatEther(finalMasterBalance)} ETH (remaining)\n`);

  console.log('📋 Next Steps:');
  console.log('   1. Run: bun run status');
  console.log('   2. Run: bun run play\n');
}

main().catch(console.error);
