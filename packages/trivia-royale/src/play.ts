/**
 * Trivia Royale - Full Yellow SDK Integration Demo
 *
 * This demo showcases Yellow Network SDK's 3-layer architecture for building
 * fast, low-cost, multi-party blockchain games.
 *
 * ========================================
 * WHAT YELLOW SDK DOES (Infrastructure):
 * ========================================
 *
 * Layer 1: STATE CHANNELS (On-Chain Escrow)
 * ------------------------------------------
 * - Creates 2-party payment channels between each player and server
 * - Locks funds on-chain in custody contract (0.05 ETH per player)
 * - Enables off-chain state updates without gas fees
 * - Secure: Funds escrowed on-chain, can't be stolen
 * - Used in: Line 364 via `setupChannels()`
 *
 * Layer 2: CLEARNODE (Off-Chain Messaging)
 * -----------------------------------------
 * - WebSocket server for real-time pub/sub messaging
 * - URL: wss://testnet-clearnode.nitrolite.org
 * - Authentication: Challenge-response with wallet signatures
 * - Fast: Messages propagate instantly (no block confirmations)
 * - Free: Zero gas fees for messages
 * - Used in: Line 370 via `connectAllParticipants()`
 *
 * Layer 3: APPLICATION SESSIONS (Multi-Party Coordination)
 * ---------------------------------------------------------
 * - Creates N-party coordination layer (6 participants: 5 players + 1 server)
 * - Server controls game flow (weights: [0,0,0,0,0,100])
 * - Routes messages between all participants via ClearNode
 * - Tracks allocations (entry fees, prize distributions)
 * - Used in: Line 382 via `createGameSession()`
 *
 * ========================================
 * WHAT'S GAME LOGIC (Not Yellow SDK):
 * ========================================
 *
 * - Trivia questions and answers (QUESTIONS array)
 * - Commit-reveal protocol (createCommitment, verifyCommitment)
 * - Winner determination (fastest correct answer)
 * - Prize calculation (50% / 30% / 20% split)
 *
 * Yellow SDK provides the INFRASTRUCTURE (escrow, messaging, coordination).
 * Game logic uses that infrastructure to build a fair, fast trivia game.
 *
 * ========================================
 * THE VALUE PROPOSITION:
 * ========================================
 *
 * WITHOUT Yellow SDK:
 * - Every game action = on-chain transaction (slow, expensive)
 * - Example: 3 rounds × 5 players × 2 txs (commit + reveal) = 30 transactions
 * - Cost: ~$30 in gas fees (at 10 gwei)
 * - Speed: 12 seconds per block × 30 = 6 minutes total
 *
 * WITH Yellow SDK:
 * - Only 2 on-chain txs: channel creation + settlement
 * - All game messages via ClearNode (off-chain, instant, free)
 * - Cost: ~$2 in gas fees (90% cheaper)
 * - Speed: ~30 seconds total (12× faster)
 *
 * ========================================
 * COMPLETE FLOW:
 * ========================================
 *
 * 1. Create channels (on-chain) - Line 364
 * 2. Connect to ClearNode (off-chain WebSocket) - Line 370
 * 3. Create application session (6 participants) - Line 382
 * 4. Play trivia game via ClearNode messages - Line 400
 * 5. Close session and disconnect - Line 409
 */

import { parseEther, formatEther, keccak256, encodePacked, type Hex } from 'viem';
import {
  loadWallets,
  getPlayerWallets,
  getServerWallet,
  type Wallet,
} from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';
import { ensureChannel } from './utils/channels';
import { connectAllParticipants, disconnectAll } from './utils/clearnode';
import {
  createGameSession,
  sendGameMessage,
  closeGameSession,
  createMessageSigner,
} from './yellow-integration';

// ==================== TYPES ====================

interface CommitData {
  commitment: `0x${string}`;
  secret: `0x${string}`;
  answer: string;
  receivedAt: number;
}

interface GameResults {
  wins: Map<string, number>;
}

interface PrizeDistribution {
  name: string;
  wins: number;
  prize: string;
  change: string;
}

// ==================== GAME DATA ====================

const QUESTIONS = [
  { question: 'What year was Bitcoin launched?', answer: '2009' },
  { question: 'What is the native token of Ethereum?', answer: 'ETH' },
  { question: 'Who created Bitcoin?', answer: 'Satoshi Nakamoto' },
];

const MOCK_ANSWERS = [
  { answer: '2009', delay: 1200 },  // Alice
  { answer: '2008', delay: 800 },   // Bob (wrong, but fast)
  { answer: '2009', delay: 1500 },  // Charlie
  { answer: '2010', delay: 2000 },  // Diana (wrong)
  { answer: '2009', delay: 2100 },  // Eve
];

// ==================== HELPER FUNCTIONS ====================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

function createCommitment(
  answer: string,
  secret: `0x${string}`,
  address: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(['string', 'bytes32', 'address'], [answer, secret, address])
  );
}

function verifyCommitment(
  answer: string,
  secret: `0x${string}`,
  address: `0x${string}`,
  commitment: `0x${string}`
): boolean {
  const expected = createCommitment(answer, secret, address);
  return expected === commitment;
}

function calculatePrizes(results: [string, number][]): PrizeDistribution[] {
  const entryFee = parseFloat(SEPOLIA_CONFIG.game.entryFee);
  const totalPool = entryFee * 5;

  const distribution = [
    { pct: 0.50, prize: totalPool * 0.50 },
    { pct: 0.30, prize: totalPool * 0.30 },
    { pct: 0.20, prize: totalPool * 0.20 },
  ];

  return results.map(([name, wins], index) => {
    const dist = distribution[index] || { prize: 0 };
    const finalPrize = dist.prize;
    const change = finalPrize - entryFee;

    return {
      name,
      wins,
      prize: finalPrize.toFixed(3),
      change: change.toFixed(3),
    };
  });
}

// ==================== GAME FLOW ====================

async function setupChannels(
  players: Wallet[],
  server: Wallet
): Promise<string[]> {
  console.log('2. Creating channels (on-chain)...\n');

  const channelIds: string[] = [];

  for (const player of players) {
    const channelId = await ensureChannel(player, server, '0.05');
    channelIds.push(channelId);
  }

  console.log(`   ✅ All ${channelIds.length} channels ready\n`);
  return channelIds;
}

async function collectCommits(
  players: Wallet[],
  connections: Map<string, WebSocket>,
  sessionId: Hex,
  questionSentAt: number
): Promise<Map<string, CommitData>> {
  const commits = new Map<string, CommitData>();

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const mockAnswer = MOCK_ANSWERS[i];

    if (!player || !mockAnswer) continue;

    await delay(mockAnswer.delay);

    const receivedAt = Date.now();
    const elapsed = receivedAt - questionSentAt;

    if (elapsed > SEPOLIA_CONFIG.game.commitTimeoutMs) {
      console.log(`   ❌ ${player.name}: Too late! (${elapsed}ms)`);
      continue;
    }

    const secret = generateSecret();
    const commitment = createCommitment(mockAnswer.answer, secret, player.address);

    // Send commit via ClearNode
    const playerWs = connections.get(player.name);
    if (!playerWs) continue;

    const playerSigner = createMessageSigner(player.client);

    await sendGameMessage(playerWs, playerSigner, sessionId, {
      type: 'commit',
      commitment,
      timestamp: receivedAt,
    });

    commits.set(player.name, {
      commitment,
      secret,
      answer: mockAnswer.answer,
      receivedAt,
    });

    console.log(`   ✅ ${player.name}: Committed (${elapsed}ms)`);
  }

  return commits;
}

async function processReveals(
  commits: Map<string, CommitData>,
  players: Wallet[],
  connections: Map<string, WebSocket>,
  sessionId: Hex,
  correctAnswer: string,
  questionSentAt: number
): Promise<string | null> {
  const correctReveals: Array<{ name: string; time: number }> = [];

  for (const [name, commit] of commits) {
    const player = players.find(p => p.name === name);
    if (!player) continue;

    const playerWs = connections.get(name);
    if (!playerWs) continue;

    const playerSigner = createMessageSigner(player.client);

    // Send reveal via ClearNode
    await sendGameMessage(playerWs, playerSigner, sessionId, {
      type: 'reveal',
      answer: commit.answer,
      secret: commit.secret,
    });

    // Verify commitment
    const isValid = verifyCommitment(
      commit.answer,
      commit.secret,
      player.address,
      commit.commitment
    );

    if (!isValid) {
      console.log(`   ❌ ${name}: Invalid reveal!`);
      continue;
    }

    const isCorrect = commit.answer === correctAnswer;
    const icon = isCorrect ? '✓' : '✗';
    console.log(`   ${icon} ${name}: "${commit.answer}"`);

    if (isCorrect) {
      correctReveals.push({
        name,
        time: commit.receivedAt - questionSentAt,
      });
    }
  }

  if (correctReveals.length === 0) {
    console.log('\n💀 No winners\n');
    return null;
  }

  correctReveals.sort((a, b) => a.time - b.time);
  const winner = correctReveals[0];
  if (!winner) return null;

  console.log(`\n🏆 WINNER: ${winner.name} (${winner.time}ms)\n`);
  return winner.name;
}

async function playGame(
  players: Wallet[],
  server: Wallet,
  connections: Map<string, WebSocket>,
  sessionId: Hex
): Promise<GameResults> {
  console.log('🎲 PLAYING TRIVIA GAME\n');

  const results: GameResults = { wins: new Map() };
  players.forEach(p => results.wins.set(p.name, 0));

  const serverWs = connections.get(server.name);
  if (!serverWs) throw new Error('Server not connected');

  const serverSigner = createMessageSigner(server.client);

  for (let roundNum = 0; roundNum < SEPOLIA_CONFIG.game.rounds; roundNum++) {
    const question = QUESTIONS[roundNum];
    if (!question) break;

    console.log('='.repeat(60));
    console.log(`ROUND ${roundNum + 1}: ${question.question}`);
    console.log('='.repeat(60) + '\n');

    // Server broadcasts question via ClearNode
    console.log('📝 COMMIT PHASE (5 seconds)\n');

    await sendGameMessage(serverWs, serverSigner, sessionId, {
      type: 'question',
      question: question.question,
      round: roundNum + 1,
      timestamp: Date.now(),
    });

    const questionSentAt = Date.now();

    // Collect commits from players
    const commits = await collectCommits(
      players,
      connections,
      sessionId,
      questionSentAt
    );

    // Process reveals
    console.log('\n🔓 REVEAL PHASE\n');

    const winner = await processReveals(
      commits,
      players,
      connections,
      sessionId,
      question.answer,
      questionSentAt
    );

    if (winner) {
      results.wins.set(winner, (results.wins.get(winner) || 0) + 1);
    }
  }

  return results;
}

function displayResults(results: GameResults): PrizeDistribution[] {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 GAME COMPLETE!');
  console.log('='.repeat(60) + '\n');

  console.log('📊 FINAL RESULTS:\n');

  const sortedResults = Array.from(results.wins.entries())
    .sort((a, b) => b[1] - a[1]);

  const medals = ['🥇', '🥈', '🥉'];
  sortedResults.forEach(([name, wins], index) => {
    const medal = medals[index] || '💀';
    console.log(`   ${medal} ${name}: ${wins} wins`);
  });

  console.log('\n💰 PRIZE DISTRIBUTION:\n');

  const prizes = calculatePrizes(sortedResults);
  prizes.forEach(({ name, change }) => {
    const sign = parseFloat(change) >= 0 ? '+' : '';
    console.log(`   ${name}: ${sign}${change} ETH`);
  });

  return prizes;
}

// ==================== MAIN ====================

async function main() {
  console.log('\n🎮 TRIVIA ROYALE - Full Yellow SDK Integration\n');

  // ==================== SETUP PHASE ====================
  console.log('📋 SETUP PHASE\n');

  console.log('1. Loading wallets...\n');
  const wallets = loadWallets();
  const players = getPlayerWallets(wallets);
  const server = getServerWallet(wallets);

  console.log(`   ✅ Loaded ${wallets.length} wallets`);
  players.forEach(p => console.log(`      - ${p.name}: ${p.address}`));
  console.log(`      - ${server.name}: ${server.address}\n`);

  // ==================== CHANNEL CREATION ====================
  const channelIds = await setupChannels(players, server);

  // ==================== CLEARNODE CONNECTION ====================
  console.log('3. Connecting to ClearNode (off-chain)...\n');

  const allParticipants = [...players, server];
  const connections = await connectAllParticipants(allParticipants);

  console.log(`   ✅ All ${connections.size} participants connected\n`);

  // ==================== APPLICATION SESSION ====================
  console.log('4. Creating application session...\n');

  const serverWs = connections.get(server.name);
  if (!serverWs) throw new Error('Server not connected');

  const serverSigner = createMessageSigner(server.client);

  const session = await createGameSession(
    serverWs,
    serverSigner,
    allParticipants.map(p => p.address),
    players.map(p => ({
      participant: p.address,
      asset: 'eth',
      amount: SEPOLIA_CONFIG.game.entryFee,
    })).concat([{
      participant: server.address,
      asset: 'eth',
      amount: '0.02',
    }])
  );

  console.log(`   ✅ Session created: ${session.sessionId}\n`);

  // ==================== PLAY GAME ====================
  const results = await playGame(players, server, connections, session.sessionId);

  // ==================== DISPLAY RESULTS ====================
  const prizes = displayResults(results);

  // ==================== CLEANUP ====================
  console.log('\n🔒 CLEANUP PHASE\n');

  console.log('1. Closing application session...');
  await closeGameSession(
    serverWs,
    serverSigner,
    session.sessionId,
    [] // Final allocations would be calculated from prizes
  );
  console.log('   ✅ Session closed\n');

  console.log('2. Disconnecting from ClearNode...');
  disconnectAll(connections);
  console.log('   ✅ All disconnected\n');

  console.log('✅ GAME COMPLETE!\n');
  console.log('💡 Channel states updated off-chain via Yellow SDK');
  console.log('📋 Run `bun run status` to check balances\n');
}

main().catch(console.error);
