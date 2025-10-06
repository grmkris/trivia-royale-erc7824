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
  createPublicRpcClient,
  deriveAddress,
} from '../src/core/wallets';
import { SEPOLIA_CONFIG } from '../src/core/contracts';
import { testEnv } from './testEnv';
import { getUSDCBalance, formatUSDC, parseUSDC } from '../src/core/erc20';
import { loadWallets } from './testWallets';

const WALLET_NAMES = ['Funding', 'Broker', 'Server', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

/**
 * Get broker private key (index 1) for docker-compose.yml
 */
function getBrokerPrivateKey(mnemonic: string): `0x${string}` {
  const account = mnemonicToAccount(mnemonic, { accountIndex: 1 });
  const hdKey = account.getHdKey();
  const privateKeyBytes = hdKey.privateKey;

  // Convert Uint8Array to hex string
  if (privateKeyBytes instanceof Uint8Array) {
    const hex = Array.from(privateKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `0x${hex}` as `0x${string}`;
  }

  if (!privateKeyBytes) {
    throw new Error('Failed to derive private key from mnemonic');
  }

  return privateKeyBytes as `0x${string}`;
}

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Setup\n');

  // Check for existing mnemonic
  let mnemonic = testEnv.MNEMONIC;

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

    // Show Broker configuration
    const brokerPrivateKey = getBrokerPrivateKey(mnemonic);
    const brokerAddress = deriveAddress(mnemonic, 1);

    console.log('\n🔑 BROKER CONFIGURATION (Index 1 - for ClearNode):\n');
    console.log(`   Address:     ${brokerAddress}`);
    console.log(`   Private Key: ${brokerPrivateKey}`);
    console.log('\n   ⚠️  IMPORTANT: Update docker-compose.yml with this private key:');
    console.log(`   Line 103: BROKER_PRIVATE_KEY: ${brokerPrivateKey}\n`);

    console.log('📋 Next Steps:');
    console.log('   1. Save MNEMONIC to .env file');
    console.log('   2. Update BROKER_PRIVATE_KEY in docker-compose.yml (see above)');
    console.log('   3. Fund Funding wallet (index 0) with:');
    console.log(`      - ${SEPOLIA_CONFIG.funding.fundingGasReserve} ETH from: https://faucets.chain.link/sepolia`);
    console.log(`      - ${SEPOLIA_CONFIG.funding.fundingGameReserve} USDC from: https://faucet.circle.com/`);
    console.log('   4. Start ClearNode: docker-compose up -d');
    console.log('   5. Run: bun run fund');
    console.log('   6. Run: bun run play\n');

    return;
  }

  // Existing mnemonic - show status
  console.log('✅ Using existing MNEMONIC from .env\n');

  const wallets = loadWallets();
  const funding = wallets.funding;
  const broker = wallets.broker;
  const publicClient = createPublicRpcClient();

  // Show Broker configuration
  const brokerPrivateKey = getBrokerPrivateKey(mnemonic);
  console.log('🔑 Broker Configuration:\n');
  console.log(`   Address:     ${broker.address}`);
  console.log(`   Private Key: ${brokerPrivateKey}`);
  console.log(`   Expected:    ${SEPOLIA_CONFIG.contracts.brokerAddress}`);
  if (broker.address.toLowerCase() !== SEPOLIA_CONFIG.contracts.brokerAddress.toLowerCase()) {
    console.log(`   ⚠️  WARNING: Broker address mismatch! Update contracts.ts brokerAddress\n`);
  } else {
    console.log(`   ✅ Matches contracts.ts configuration\n`);
  }

  // Check funding wallet balances (both ETH and USDC)
  const ethBalance = await publicClient.getBalance({ address: funding.address });
  const usdcBalance = await getUSDCBalance(funding);

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
    console.log('   1. Verify BROKER_PRIVATE_KEY in docker-compose.yml (see above)');
    console.log('   2. Start ClearNode: docker-compose up -d');
    console.log('   3. Run: bun run fund');
    console.log('   4. Run: bun run play\n');
  }
}

main().catch(console.error);
