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
import { getUSDCBalance, formatUSDC, parseUSDC } from './utils/erc20';

const WALLET_NAMES = ['Funding', 'Broker', 'Server', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

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
    console.log('   2. Fund Funding wallet (index 0) with:');
    console.log(`      - ${SEPOLIA_CONFIG.funding.fundingGasReserve} ETH from: https://faucets.chain.link/sepolia`);
    console.log(`      - ${SEPOLIA_CONFIG.funding.fundingGameReserve} USDC from: https://faucet.circle.com/`);
    console.log('   3. Run: bun run fund');
    console.log('   4. Run: bun run play\n');

    return;
  }

  // Existing mnemonic - show status
  console.log('✅ Using existing MNEMONIC from .env\n');

  const wallets = loadWallets();
  const funding = wallets.funding;
  const publicClient = createPublicRpcClient();

  // Check funding wallet balances (both ETH and USDC)
  const ethBalance = await publicClient.getBalance({ address: funding.address });
  const usdcBalance = await getUSDCBalance(funding, funding.address);

  console.log('💰 Funding Wallet:\n');
  console.log(`   Address: ${funding.address}`);
  console.log(`   ETH Balance:  ${formatEther(ethBalance)}`);
  console.log(`   USDC Balance: ${formatUSDC(usdcBalance)}\n`);

  const requiredEth = parseEther(SEPOLIA_CONFIG.funding.fundingGasReserve);
  const requiredUsdc = parseUSDC(SEPOLIA_CONFIG.funding.fundingGameReserve);

  const needsEth = ethBalance < requiredEth;
  const needsUsdc = usdcBalance < requiredUsdc;

  if (needsEth || needsUsdc) {
    console.log('⚠️  FUNDING WALLET NEEDS FUNDING!\n');

    if (needsEth) {
      console.log(`   ETH Required:  ${SEPOLIA_CONFIG.funding.fundingGasReserve} ETH`);
      console.log(`   ETH Current:   ${formatEther(ethBalance)} ETH`);
      console.log('   📋 Get ETH from: https://faucets.chain.link/sepolia\n');
    }

    if (needsUsdc) {
      console.log(`   USDC Required: ${SEPOLIA_CONFIG.funding.fundingGameReserve} USDC`);
      console.log(`   USDC Current:  ${formatUSDC(usdcBalance)} USDC`);
      console.log('   📋 Get USDC from: https://faucet.circle.com/\n');
    }

    console.log(`   Send to: ${funding.address}\n`);
  } else {
    console.log('✅ Funding wallet has sufficient funds\n');
    console.log('📋 Next Steps:');
    console.log('   1. Run: bun run fund');
    console.log('   2. Run: bun run play\n');
  }
}

main().catch(console.error);
