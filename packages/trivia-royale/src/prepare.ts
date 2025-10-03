/**
 * Preparation Script for Trivia Royale
 *
 * This script helps you prepare for running the game by:
 * - Generating mnemonic-based HD wallets
 * - Showing Master wallet address for funding
 * - Checking balances
 * - Testing ClearNode connectivity
 */

import { mnemonicToAccount } from 'viem/accounts';
import { formatEther, parseEther } from 'viem';
import {
  generateNewMnemonic,
  loadWallets,
  createPublicRpcClient,
  deriveAddress,
} from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';
import { env } from './env';

const WALLET_NAMES = ['Master', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Server'];

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Setup\n');

  // Check for existing mnemonic
  let mnemonic = env.MNEMONIC;

  if (!mnemonic) {
    console.log('⚠️  GENERATING NEW MNEMONIC - SAVE THIS!\n');
    mnemonic = generateNewMnemonic();
    console.log(`${mnemonic}\n`);
    console.log('📝 Add to .env:');
    console.log(`MNEMONIC="${mnemonic}"\n`);

    // Show derived addresses (without full wallet loading)
    console.log('👥 Wallet Addresses (HD Path: m/44\'/60\'/N\'/0/0):\n');
    for (let i = 0; i < WALLET_NAMES.length; i++) {
      const address = deriveAddress(mnemonic, i);
      console.log(`   ${i}. ${WALLET_NAMES[i]?.padEnd(8)}: ${address}`);
    }

    console.log('\n📋 Next Steps:');
    console.log('   1. Save MNEMONIC to .env file');
    console.log('   2. Fund Master wallet (index 0) with 0.5 ETH from faucet:');
    console.log('      https://faucets.chain.link/sepolia');
    console.log('   3. Run: bun run fund');
    console.log('   4. Run: bun run play\n');

    return;
  }

  // Existing mnemonic - show status
  console.log('✅ Using existing MNEMONIC from .env\n');

  const wallets = loadWallets();
  const master = wallets.master;
  const publicClient = createPublicRpcClient();

  // Check master balance
  const masterBalance = await publicClient.getBalance({ address: master.address });

  console.log('💰 Master Wallet:\n');
  console.log(`   Address: ${master.address}`);
  console.log(`   Balance: ${formatEther(masterBalance)} ETH\n`);

  const requiredAmount = parseEther(SEPOLIA_CONFIG.funding.masterAmount);

  if (masterBalance < requiredAmount) {
    console.log('⚠️  MASTER WALLET NEEDS FUNDING!\n');
    console.log(`   Required: ${SEPOLIA_CONFIG.funding.masterAmount} ETH`);
    console.log(`   Current:  ${formatEther(masterBalance)} ETH\n`);
    console.log('📋 Get ETH from faucet:');
    console.log('   https://faucets.chain.link/sepolia\n');
    console.log(`   Send to: ${master.address}\n`);
  } else {
    console.log('✅ Master wallet has sufficient funds\n');
    console.log('📋 Next Steps:');
    console.log('   1. Run: bun run fund');
    console.log('   2. Run: bun run play\n');
  }
}

main().catch(console.error);
