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
import { SEPOLIA_CONFIG, getEtherscanTxLink } from './utils/contracts';
import { transferUSDC, getUSDCBalance, formatUSDC, parseUSDC } from './utils/erc20';
import { formatEther, parseEther } from 'viem';
import { sepolia } from 'viem/chains';

/**
 * Send ETH from funding wallet to target wallet (for gas)
 */
async function sendETH(
  funding: Wallet,
  target: Wallet,
  amount: string
): Promise<void> {
  const amountWei = parseEther(amount);

  const hash = await funding.walletClient.sendTransaction({
    account: funding.account,
    to: target.address,
    value: amountWei,
    chain: sepolia,
  });

  console.log(`   ✅ ${target.name}: Sent ${amount} ETH (gas) - ${getEtherscanTxLink(hash)}`);
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

  console.log(`   ✅ ${target.name}: Sent ${amount} USDC (game) - ${getEtherscanTxLink(hash)}`);
}

/**
 * Filter wallets by names (case-insensitive)
 */
function filterWalletsByNames(
  wallets: Wallet[],
  names: string[]
): { matched: Wallet[]; invalid: string[] } {
  const matched: Wallet[] = [];
  const invalid: string[] = [];

  for (const name of names) {
    const wallet = wallets.find(w => w.name.toLowerCase() === name.toLowerCase());
    if (wallet) {
      matched.push(wallet);
    } else {
      invalid.push(name);
    }
  }

  return { matched, invalid };
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
  const test = wallets.test;
  const test2 = wallets.test2;
  const test3 = wallets.test3;
  const test4 = wallets.test4;
  const test5 = wallets.test5;
  const test6 = wallets.test6;
  const test7 = wallets.test7;
  const test8 = wallets.test8;
  const test9 = wallets.test9;
  const test10 = wallets.test10;
  const test11 = wallets.test11;
  const test12 = wallets.test12;
  const test13 = wallets.test13;
  const test14 = wallets.test14;
  const test15 = wallets.test15;
  const test16 = wallets.test16;
  const test17 = wallets.test17;
  const test18 = wallets.test18;
  const test19 = wallets.test19;
  const test20 = wallets.test20;
  const test21 = wallets.test21;
  const test22 = wallets.test22;
  const test23 = wallets.test23;
  const test24 = wallets.test24;
  const test25 = wallets.test25;
  const test26 = wallets.test26;
  const test27 = wallets.test27;
  const test28 = wallets.test28;
  const test29 = wallets.test29;
  const test30 = wallets.test30;
  const test31 = wallets.test31;
  const test32 = wallets.test32;
  const test33 = wallets.test33;
  const test34 = wallets.test34;
  const publicClient = createPublicRpcClient();

  // Check funding wallet balances
  const fundingEthBalance = await publicClient.getBalance({ address: funding.address });
  const fundingUsdcBalance = await getUSDCBalance(funding);

  console.log('💰 Funding Wallet:\n');
  console.log(`   Address: ${funding.address}`);
  console.log(`   ETH Balance:  ${formatEther(fundingEthBalance)}`);
  console.log(`   USDC Balance: ${formatUSDC(fundingUsdcBalance)}\n`);

  // Parse command-line arguments for selective funding
  const walletNames = process.argv.slice(2);

  // All possible recipients (before filtering)
  // Gas recipients: Broker + Server + 5 Players + Test-Test34 = 41 wallets
  let gasRecipients = [broker, server, ...players, test, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14, test15, test16, test17, test18, test19, test20, test21, test22, test23, test24, test25, test26, test27, test28, test29, test30, test31, test32, test33, test34];

  // Game recipients: Server + 5 Players + Test-Test34 = 40 wallets (Broker doesn't need USDC)
  let gameRecipients = [server, ...players, test, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14, test15, test16, test17, test18, test19, test20, test21, test22, test23, test24, test25, test26, test27, test28, test29, test30, test31, test32, test33, test34];

  // Apply filter if wallet names provided
  if (walletNames.length > 0) {
    const allPossibleRecipients = [...gasRecipients];
    const { matched, invalid } = filterWalletsByNames(allPossibleRecipients, walletNames);

    if (invalid.length > 0) {
      console.log(`❌ Invalid wallet name(s): ${invalid.join(', ')}\n`);
      console.log('Available wallets:');
      console.log(`   ${allPossibleRecipients.map(w => w.name).join(', ')}\n`);
      return;
    }

    gasRecipients = matched;
    // Game recipients exclude Broker even if specified
    gameRecipients = matched.filter(w => w.name !== 'Broker');

    console.log(`📋 Funding ${matched.length} selected wallet(s):`);
    console.log(`   ${matched.map(w => w.name).join(', ')}\n`);
  } else {
    console.log(`📋 Funding all ${gasRecipients.length} wallets\n`);
  }

  // Calculate required amounts
  const requiredEth = parseEther(SEPOLIA_CONFIG.funding.gasAmount) * BigInt(gasRecipients.length);
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
    const usdcBalance = await getUSDCBalance(wallet);
    console.log(`   ${wallet.name.padEnd(8)}: ${formatEther(ethBalance).padStart(10)} ETH | ${formatUSDC(usdcBalance).padStart(10)} USDC`);
  }

  const finalFundingEth = await publicClient.getBalance({ address: funding.address });
  const finalFundingUsdc = await getUSDCBalance(funding);
  console.log(`   ${funding.name.padEnd(8)}: ${formatEther(finalFundingEth).padStart(10)} ETH | ${formatUSDC(finalFundingUsdc).padStart(10)} USDC (remaining)\n`);

  console.log('📋 Next Steps:');
  console.log('   1. Run: bun run status');
  console.log('   2. Run: bun run play\n');
}

main().catch(console.error);
