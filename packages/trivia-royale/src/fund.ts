/**
 * Fund Distribution Script
 *
 * Distributes dual currencies from Funding wallet:
 * 1. ETH for gas fees (to Broker, Server, and all Players)
 * 2. USDC for game play (to Server and Players only)
 */

import {
  loadWallets,
  createPublicRpcClient,
  type Wallet,
} from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';
import { transferUSDC, getUSDCBalance, formatUSDC, parseUSDC } from './utils/erc20';
import { formatEther, parseEther } from 'viem';

/**
 * Send ETH from funding wallet to target wallet (for gas)
 */
async function sendETH(
  funding: Wallet,
  target: Wallet,
  amount: string
): Promise<void> {
  const amountWei = parseEther(amount);

  const hash = await funding.client.sendTransaction({
    account: funding.account,
    to: target.address,
    value: amountWei,
  });

  console.log(`   ✅ ${target.name}: Sent ${amount} ETH (gas) (tx: ${hash.slice(0, 10)}...)`);
}

/**
 * Send USDC from funding wallet to target wallet (for game)
 */
async function sendUSDC(
  funding: Wallet,
  target: Wallet,
  amount: string
): Promise<void> {
  const hash = await transferUSDC(funding, target.address, amount);

  console.log(`   ✅ ${target.name}: Sent ${amount} USDC (game) (tx: ${hash.slice(0, 10)}...)`);
}

/**
 * Main distribution function - dual currency
 */
async function distributeFunds(
  funding: Wallet,
  gasRecipients: Wallet[],
  gameRecipients: Wallet[]
): Promise<void> {
  const gasAmount = SEPOLIA_CONFIG.funding.gasAmount;
  const gameAmount = SEPOLIA_CONFIG.funding.gameAmount;

  console.log(`💸 Phase 1: Distributing ${gasAmount} ETH (gas) to ${gasRecipients.length} wallets...\n`);

  for (const recipient of gasRecipients) {
    await sendETH(funding, recipient, gasAmount);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n💸 Phase 2: Distributing ${gameAmount} USDC (game) to ${gameRecipients.length} wallets...\n`);

  for (const recipient of gameRecipients) {
    await sendUSDC(funding, recipient, gameAmount);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ All distributions complete!');
}

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Fund Distribution\n');

  const wallets = loadWallets();
  const funding = wallets.funding;
  const broker = wallets.broker;
  const players = wallets.players;
  const server = wallets.server;
  const publicClient = createPublicRpcClient();

  // Check funding wallet balances
  const fundingEthBalance = await publicClient.getBalance({ address: funding.address });
  const fundingUsdcBalance = await getUSDCBalance(funding, funding.address);

  console.log('💰 Funding Wallet:\n');
  console.log(`   Address: ${funding.address}`);
  console.log(`   ETH Balance:  ${formatEther(fundingEthBalance)}`);
  console.log(`   USDC Balance: ${formatUSDC(fundingUsdcBalance)}\n`);

  // Calculate required amounts
  // Gas recipients: Broker + Server + 5 Players = 7 wallets
  const gasRecipients = [broker, server, ...players];
  const requiredEth = parseEther(SEPOLIA_CONFIG.funding.gasAmount) * BigInt(gasRecipients.length);

  // Game recipients: Server + 5 Players = 6 wallets (Broker doesn't need USDC)
  const gameRecipients = [server, ...players];
  const requiredUsdc = parseUSDC(SEPOLIA_CONFIG.funding.gameAmount) * BigInt(gameRecipients.length);

  // Check if funding wallet has enough
  if (fundingEthBalance < requiredEth) {
    console.log('❌ Insufficient ETH in funding wallet!\n');
    console.log(`   Required: ${formatEther(requiredEth)} ETH`);
    console.log(`   Available: ${formatEther(fundingEthBalance)} ETH\n`);
    console.log('📋 Fund funding wallet first:');
    console.log('   bun run prepare\n');
    return;
  }

  if (fundingUsdcBalance < requiredUsdc) {
    console.log('❌ Insufficient USDC in funding wallet!\n');
    console.log(`   Required: ${formatUSDC(requiredUsdc)} USDC`);
    console.log(`   Available: ${formatUSDC(fundingUsdcBalance)} USDC\n`);
    console.log('📋 Fund funding wallet first:');
    console.log('   bun run prepare\n');
    return;
  }

  // Distribute to all wallets
  await distributeFunds(funding, gasRecipients, gameRecipients);

  // Show final balances
  console.log('\n💰 Final Balances:\n');

  for (const wallet of [...gasRecipients]) {
    const ethBalance = await publicClient.getBalance({ address: wallet.address });
    const usdcBalance = await getUSDCBalance(funding, wallet.address);
    console.log(`   ${wallet.name.padEnd(8)}: ${formatEther(ethBalance).padStart(10)} ETH | ${formatUSDC(usdcBalance).padStart(10)} USDC`);
  }

  const finalFundingEth = await publicClient.getBalance({ address: funding.address });
  const finalFundingUsdc = await getUSDCBalance(funding, funding.address);
  console.log(`   ${funding.name.padEnd(8)}: ${formatEther(finalFundingEth).padStart(10)} ETH | ${formatUSDC(finalFundingUsdc).padStart(10)} USDC (remaining)\n`);

  console.log('📋 Next Steps:');
  console.log('   1. Run: bun run status');
  console.log('   2. Run: bun run play\n');
}

main().catch(console.error);
