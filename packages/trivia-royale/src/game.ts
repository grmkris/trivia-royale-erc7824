import { NitroliteClient } from "@erc7824/nitrolite";
import { createWalletClient, http, type Address, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { keccak256, encodePacked } from "viem";

// ==================== CONFIG ====================
const CONFIG = {
  chainId: 84532, // Base Sepolia
  rpcUrl: "https://sepolia.base.org",
  clearNodeUrl: "wss://testnet-clearnode.nitrolite.org",
  // These will be discovered from the SDK or set manually
  contractAddresses: {
    custody: "0x0000000000000000000000000000000000000000", // TBD
    adjudicator: "0x0000000000000000000000000000000000000000", // TBD
    token: "0x0000000000000000000000000000000000000000", // TBD
  },
};

// ==================== TYPES ====================
interface Player {
  name: string;
  address: Address;
  wallet: WalletClient;
  balance: string;
}

interface AIHost {
  name: string;
  address: Address;
  wallet: WalletClient;
}

interface Question {
  text: string;
  answer: string;
}

interface Commit {
  playerId: Address;
  commitment: string;
  receivedAt: number;
}

interface Reveal {
  playerId: Address;
  answer: string;
  secret: string;
  receivedAt: number;
}

// ==================== HARDCODED DATA ====================
const QUESTIONS: Question[] = [
  { text: "What year was Bitcoin launched?", answer: "2009" },
  { text: "What is the native token of Ethereum?", answer: "ETH" },
  { text: "What does DeFi stand for?", answer: "Decentralized Finance" },
];

// Mock player answers (some correct, some wrong, different timing)
const MOCK_ANSWERS = [
  { playerIndex: 0, answer: "2009", delay: 1000 }, // Player 1: correct, fast
  { playerIndex: 1, answer: "2008", delay: 800 },  // Player 2: wrong, fastest
  { playerIndex: 2, answer: "2009", delay: 1500 }, // Player 3: correct, slow
  { playerIndex: 3, answer: "2010", delay: 1200 }, // Player 4: wrong
  { playerIndex: 4, answer: "2009", delay: 900 },  // Player 5: correct, medium
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate a random private key for testing
 */
function generatePrivateKey(): `0x${string}` {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Create a test wallet
 */
function createWallet(privateKey: `0x${string}`): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(CONFIG.rpcUrl),
  });
}

/**
 * Create a player instance
 */
function createPlayer(name: string, privateKey?: `0x${string}`): Player {
  const key = privateKey || generatePrivateKey();
  const wallet = createWallet(key);

  return {
    name,
    address: wallet.account!.address,
    wallet,
    balance: "2.0", // Starting balance
  };
}

/**
 * Create AI host instance
 */
function createAIHost(privateKey?: `0x${string}`): AIHost {
  const key = privateKey || generatePrivateKey();
  const wallet = createWallet(key);

  return {
    name: "AI Host",
    address: wallet.account!.address,
    wallet,
  };
}

/**
 * Generate a random secret for commit-reveal
 */
function generateSecret(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a commitment hash (answer + secret + playerAddress)
 */
function createCommitment(answer: string, secret: string, playerAddress: Address): string {
  return keccak256(encodePacked(
    ['string', 'string', 'address'],
    [answer, secret, playerAddress]
  ));
}

/**
 * Verify a reveal against a commitment
 */
function verifyReveal(
  commitment: string,
  answer: string,
  secret: string,
  playerAddress: Address
): boolean {
  const expectedCommit = createCommitment(answer, secret, playerAddress);
  return commitment === expectedCommit;
}

/**
 * Determine the winner based on reveals (deterministic)
 */
function determineWinner(
  reveals: Reveal[],
  correctAnswer: string
): Reveal | null {
  // Filter correct answers
  const correctReveals = reveals.filter(r =>
    r.answer.toLowerCase() === correctAnswer.toLowerCase()
  );

  if (correctReveals.length === 0) {
    return null; // No winner
  }

  // Sort by receivedAt timestamp (ascending)
  correctReveals.sort((a, b) => {
    if (a.receivedAt !== b.receivedAt) {
      return a.receivedAt - b.receivedAt;
    }
    // Tiebreaker: lexicographic address comparison
    return a.playerId.toLowerCase() < b.playerId.toLowerCase() ? -1 : 1;
  });

  return correctReveals[0];
}

// ==================== GAME SIMULATION ====================

/**
 * Simulate a game round with commit-reveal
 */
async function playRound(
  roundNumber: number,
  question: Question,
  players: Player[],
  aiHost: AIHost
): Promise<Address | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`ROUND ${roundNumber}: ${question.text}`);
  console.log("=".repeat(60));

  const questionSentAt = Date.now();
  const commits: Commit[] = [];
  const reveals: Reveal[] = [];
  const COMMIT_TIMEOUT_MS = 5000;

  // Phase 1: COMMIT
  console.log("\n📝 COMMIT PHASE (5 seconds)");

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const mockAnswer = MOCK_ANSWERS[i];

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, mockAnswer.delay));

    const receivedAt = Date.now();
    const elapsed = receivedAt - questionSentAt;

    if (elapsed > COMMIT_TIMEOUT_MS) {
      console.log(`  ❌ ${player.name}: Too late! (${elapsed}ms)`);
      continue;
    }

    const secret = generateSecret();
    const commitment = createCommitment(mockAnswer.answer, secret, player.address);

    commits.push({
      playerId: player.address,
      commitment,
      receivedAt,
    });

    console.log(`  ✅ ${player.name}: Committed in ${elapsed}ms`);

    // Store secret for reveal (in real app, this would be in localStorage)
    (player as any).lastSecret = secret;
    (player as any).lastAnswer = mockAnswer.answer;
  }

  // Phase 2: REVEAL
  console.log(`\n🔓 REVEAL PHASE`);
  console.log(`Valid commits: ${commits.length}/${players.length}`);

  for (const commit of commits) {
    const player = players.find(p => p.address === commit.playerId)!;
    const answer = (player as any).lastAnswer;
    const secret = (player as any).lastSecret;

    // Verify reveal matches commit
    const isValid = verifyReveal(commit.commitment, answer, secret, player.address);

    if (!isValid) {
      console.log(`  ❌ ${player.name}: Invalid reveal (doesn't match commit)`);
      continue;
    }

    reveals.push({
      playerId: player.address,
      answer,
      secret,
      receivedAt: commit.receivedAt,
    });

    console.log(`  ✅ ${player.name}: Revealed "${answer}"`);
  }

  // Phase 3: DETERMINE WINNER
  console.log(`\n🏆 WINNER DETERMINATION`);
  console.log(`Correct answer: "${question.answer}"`);

  const winner = determineWinner(reveals, question.answer);

  if (!winner) {
    console.log(`  ⚠️  No winner this round (no correct answers)`);
    return null;
  }

  const winnerPlayer = players.find(p => p.address === winner.playerId)!;
  const winnerTime = winner.receivedAt - questionSentAt;

  console.log(`  🎉 Winner: ${winnerPlayer.name} (answered in ${winnerTime}ms)`);

  return winner.playerId;
}

/**
 * Update player balances based on round result
 */
function updateBalances(
  players: Player[],
  winnerAddress: Address | null,
  rewardAmount: number = 0.5
): void {
  if (!winnerAddress) {
    return; // No changes if no winner
  }

  for (const player of players) {
    if (player.address === winnerAddress) {
      player.balance = (parseFloat(player.balance) + rewardAmount).toFixed(1);
      console.log(`  💰 ${player.name}: ${player.balance} USDC (+${rewardAmount})`);
    } else {
      player.balance = (parseFloat(player.balance) - 0.1).toFixed(1);
      console.log(`  📉 ${player.name}: ${player.balance} USDC (-0.1)`);
    }
  }
}

/**
 * Main game orchestrator
 */
async function playGame(): Promise<void> {
  console.log("\n🎮 TRIVIA ROYALE - Yellow SDK Demo\n");

  // Create participants
  console.log("👥 Creating participants...");
  const players: Player[] = [
    createPlayer("Alice"),
    createPlayer("Bob"),
    createPlayer("Charlie"),
    createPlayer("Diana"),
    createPlayer("Eve"),
  ];

  const aiHost = createAIHost();

  console.log(`\n  Players:`);
  players.forEach(p => console.log(`    - ${p.name}: ${p.address}`));
  console.log(`  AI Host: ${aiHost.address}`);

  // Show initial balances
  console.log(`\n💰 Initial Balances:`);
  players.forEach(p => console.log(`  ${p.name}: ${p.balance} USDC`));

  // Play rounds
  const numRounds = 2;
  for (let i = 0; i < numRounds; i++) {
    const question = QUESTIONS[i];
    const winner = await playRound(i + 1, question, players, aiHost);

    // Update balances
    console.log(`\n💸 Balance Update:`);
    updateBalances(players, winner);
  }

  // Final results
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 FINAL RESULTS");
  console.log("=".repeat(60));

  const sortedPlayers = [...players].sort((a, b) =>
    parseFloat(b.balance) - parseFloat(a.balance)
  );

  sortedPlayers.forEach((p, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    console.log(`${medal} ${p.name}: ${p.balance} USDC`);
  });

  console.log("\n✅ Game complete!");
  console.log("\n📝 Next steps:");
  console.log("  1. Integrate actual Yellow SDK channel creation");
  console.log("  2. Connect to ClearNode for real message passing");
  console.log("  3. Add on-chain state updates");
  console.log("  4. Test on Base Sepolia testnet\n");
}

// ==================== MAIN ====================
playGame().catch(console.error);
