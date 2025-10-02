/**
 * Preparation Script for Trivia Royale
 *
 * This script helps you prepare for running the game by:
 * - Generating 6 test wallets
 * - Checking balances
 * - Testing ClearNode connectivity
 * - Displaying funding instructions
 */

import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { connectToClearNode } from "./yellow-integration";

// ==================== CONFIG ====================
const CONFIG = {
  chainId: 84532,
  rpcUrl: "https://sepolia.base.org",
  clearNodeUrl: "wss://testnet-clearnode.nitrolite.org",
};

const PARTICIPANT_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve", "AI Host"];

// ==================== WALLET GENERATION ====================

/**
 * Generate a random private key
 */
function generatePrivateKey(): `0x${string}` {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Generate 6 deterministic wallets
 */
function generateWallets() {
  const wallets = [];

  for (let i = 0; i < 6; i++) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    wallets.push({
      name: PARTICIPANT_NAMES[i],
      address: account.address,
      privateKey,
    });
  }

  return wallets;
}

// ==================== BALANCE CHECKING ====================

/**
 * Check ETH balance for an address
 */
async function checkBalance(address: string) {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(CONFIG.rpcUrl),
  });

  const balance = await publicClient.getBalance({
    address: address as `0x${string}`,
  });

  return balance;
}

// ==================== MAIN SCRIPT ====================

async function main() {
  console.log("\n🎮 TRIVIA ROYALE - Preparation Script\n");
  console.log("=" .repeat(60));

  // Step 1: Generate Wallets
  console.log("\n1️⃣  Generating Test Wallets...\n");
  const wallets = generateWallets();

  console.log("Generated 6 wallets:");
  wallets.forEach((wallet, index) => {
    console.log(`\n${index + 1}. ${wallet.name}`);
    console.log(`   Address:     ${wallet.address}`);
    console.log(`   Private Key: ${wallet.privateKey}`);
  });

  // Step 2: Check Balances
  console.log("\n\n2️⃣  Checking ETH Balances...\n");

  let totalBalance = 0n;
  const balances: { name: string; address: string; balance: bigint }[] = [];

  for (const wallet of wallets) {
    try {
      const balance = await checkBalance(wallet.address);
      balances.push({
        name: wallet.name,
        address: wallet.address,
        balance,
      });
      totalBalance += balance;

      const hasBalance = balance > 0n;
      const icon = hasBalance ? "✅" : "❌";
      console.log(
        `${icon} ${wallet.name}: ${formatEther(balance)} ETH`
      );
    } catch (error) {
      console.log(`❌ ${wallet.name}: Error checking balance`);
    }
  }

  console.log(`\n   Total: ${formatEther(totalBalance)} ETH`);

  // Step 3: Test ClearNode Connection
  console.log("\n\n3️⃣  Testing ClearNode Connectivity...\n");

  try {
    const ws = await connectToClearNode(CONFIG.clearNodeUrl);
    console.log("  ✅ ClearNode is reachable");
    ws.close();
  } catch (error) {
    console.log("  ❌ Could not connect to ClearNode");
    console.log(`  Error: ${error}`);
  }

  // Step 4: Display Instructions
  console.log("\n\n4️⃣  Next Steps\n");
  console.log("=" .repeat(60));

  const needsFunding = balances.every((b) => b.balance === 0n);

  if (needsFunding) {
    console.log("\n⚠️  WALLETS NEED FUNDING\n");
    console.log("Get Base Sepolia ETH from the faucet:");
    console.log("  🔗 https://portal.cdp.coinbase.com/products/faucet\n");
    console.log("Fund these addresses:\n");

    wallets.forEach((wallet, index) => {
      console.log(`${index + 1}. ${wallet.name}: ${wallet.address}`);
    });

    console.log("\n💡 Tip: You need at least 0.1 ETH per wallet for gas fees");
    console.log("        Recommended: 0.2 ETH per wallet\n");
  } else {
    console.log("\n✅ Wallets are funded!\n");
    console.log("You can now:");
    console.log("  1. Save these private keys to .env (optional)");
    console.log("  2. Run the game simulation: bun run src/game.ts");
    console.log("  3. (Future) Run with Yellow SDK integration\n");
  }

  // Step 5: Save to .env (optional)
  console.log("\n5️⃣  Environment Variables\n");
  console.log("=" .repeat(60));
  console.log("\nTo use these wallets, add to your .env file:\n");

  wallets.forEach((wallet, index) => {
    const envVar = index === 5 ? "AI_HOST_PRIVATE_KEY" : `PLAYER${index + 1}_PRIVATE_KEY`;
    console.log(`${envVar}=${wallet.privateKey}`);
  });

  console.log("\n\n✅ Preparation Complete!\n");
}

// Run the script
main().catch(console.error);
