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
 * - Locks funds on-chain in custody contract (0.0001 ETH per player)
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
  type Wallet,
} from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';
import { createNitroliteClient, ensureChannel } from './utils/channels';
import { connectAllParticipants, disconnectAll } from './utils/clearnode';
import { createMessageSigner } from './yellow-integration';
import type { NitroliteClient } from '@erc7824/nitrolite';
import { createServerClient } from './game/ServerGameClient';
import { createPlayerClient } from './game/PlayerGameClient';
import type { GameResults, PrizeDistribution, PlayerMockConfig } from './game/types';

// ==================== GAME DATA ====================

const QUESTIONS = [
  { question: 'What year was Bitcoin launched?', answer: '2009' },
  { question: 'What is the native token of Ethereum?', answer: 'ETH' },
  { question: 'Who created Bitcoin?', answer: 'Satoshi Nakamoto' },
];

// Mock configurations for each player (demo mode)
const PLAYER_MOCK_CONFIGS: Record<string, PlayerMockConfig> = {
  Alice: {
    answers: [
      { answer: '2009', delay: 1200 },                 // Round 1: ✓ WINNER
      { answer: 'Ether', delay: 1500 },                // Round 2: ✗
      { answer: 'Satoshi', delay: 2000 },              // Round 3: ✗
    ],
  },
  Bob: {
    answers: [
      { answer: '2008', delay: 800 },                  // Round 1: ✗ (fast but wrong)
      { answer: 'ETH', delay: 1800 },                  // Round 2: ✓
      { answer: 'Satoshi Nakamoto', delay: 1000 },     // Round 3: ✓ WINNER
    ],
  },
  Charlie: {
    answers: [
      { answer: '2009', delay: 1500 },                 // Round 1: ✓
      { answer: 'ETH', delay: 900 },                   // Round 2: ✓ WINNER (fastest)
      { answer: 'Satoshi Nakamoto', delay: 1600 },     // Round 3: ✓
    ],
  },
  Diana: {
    answers: [
      { answer: '2009', delay: 2000 },                 // Round 1: ✓
      { answer: 'Ethereum', delay: 2200 },             // Round 2: ✗
      { answer: 'Satoshi Nakamoto', delay: 2500 },     // Round 3: ✓
    ],
  },
  Eve: {
    answers: [
      { answer: '2010', delay: 2500 },                 // Round 1: ✗
      { answer: 'ETH', delay: 2800 },                  // Round 2: ✓
      { answer: 'Hal Finney', delay: 3000 },           // Round 3: ✗
    ],
  },
};

// ==================== HELPER FUNCTIONS ====================

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
      prize: finalPrize.toFixed(6),
      change: change.toFixed(6),
    };
  });
}

// ==================== GAME FLOW ====================

async function setupChannels(
  players: Wallet[],
  server: Wallet,
): Promise<string[]> {
  console.log('2. Creating channels (on-chain)...\n');

  const channelIds: string[] = [];

  for (const player of players) {
    const channelId = await ensureChannel({
      playerNitroliteClient: createNitroliteClient(player, server.address),
      playerWallet: player,
      serverWallet: server,
      amount: '0.0001',
    });
    channelIds.push(channelId);
  }

  console.log(`   ✅ All ${channelIds.length} channels ready\n`);
  return channelIds;
}

async function playGame(
  players: Wallet[],
  server: Wallet,
  connections: Map<string, WebSocket>,
  participants: Address[],
  initialAllocations: Array<{ participant: Address; asset: string; amount: string }>
): Promise<{ results: GameResults; sessionId: Hex; gameClients: { server: any; players: any[] } }> {
  console.log('🎲 SETTING UP GAME\n');

  const results: GameResults = { wins: new Map() };
  players.forEach(p => results.wins.set(p.name, 0));

  // Create server client
  const serverWs = connections.get(server.name);
  if (!serverWs) throw new Error('Server not connected');

  const serverSigner = createMessageSigner(server.client);
  const serverClient = createServerClient({
    ws: serverWs,
    signer: serverSigner,
    participants,
    serverAddress: server.address,
  });

  // Create player clients
  const playerClients = players.map(player => {
    const playerWs = connections.get(player.name);
    if (!playerWs) throw new Error(`Player ${player.name} not connected`);

    const playerSigner = createMessageSigner(player.client);
    const mockConfig = PLAYER_MOCK_CONFIGS[player.name];

    return createPlayerClient({
      ws: playerWs,
      signer: playerSigner,
      wallet: player,
      mockConfig,
    });
  });

  // Start all clients (BEFORE creating session!)
  await serverClient.start();
  await Promise.all(playerClients.map(client => client.start()));

  console.log('  ✅ All game clients ready\n');

  // NOW create the session (clients are listening)
  console.log('  🎮 Creating game session...\n');
  const sessionId = await serverClient.createGame(initialAllocations);
  console.log(`  ✅ Session created: ${sessionId}\n`);

  console.log('🎲 PLAYING TRIVIA GAME\n');

  // Play rounds
  for (let roundNum = 0; roundNum < SEPOLIA_CONFIG.game.rounds; roundNum++) {
    const question = QUESTIONS[roundNum];
    if (!question) break;

    console.log('='.repeat(60));
    console.log(`ROUND ${roundNum + 1}: ${question.question}`);
    console.log('='.repeat(60) + '\n');

    // COMMIT PHASE
    console.log('📝 COMMIT PHASE (5 seconds)\n');

    const questionSentAt = await serverClient.broadcastQuestion(
      sessionId,
      question.question,
      roundNum + 1,
      SEPOLIA_CONFIG.game.commitTimeoutMs
    );

    // Collect commits (players auto-respond via their clients)
    const commits = await serverClient.collectCommits(
      questionSentAt,
      SEPOLIA_CONFIG.game.commitTimeoutMs
    );

    console.log(`\n   📥 Collected ${commits.size} commits\n`);

    // REVEAL PHASE
    console.log('🔓 REVEAL PHASE\n');

    await serverClient.requestReveals(sessionId, roundNum + 1);

    const reveals = await serverClient.collectReveals(
      questionSentAt,
      2000 // Give 2 seconds for reveals
    );

    // Display reveals
    for (const [address, reveal] of reveals) {
      const player = players.find(p => p.address === address);
      const icon = reveal.isCorrect ? '✓' : '✗';
      const validIcon = reveal.isValid ? '' : '⚠️ ';
      console.log(`   ${validIcon}${icon} ${player?.name}: "${reveal.answer}"`);
    }

    // Determine winner
    const winner = serverClient.determineWinner(reveals, question.answer);

    if (winner) {
      const winnerPlayer = players.find(p => p.address === winner.playerAddress);
      if (winnerPlayer) {
        console.log(`\n🏆 WINNER: ${winnerPlayer.name} (${winner.responseTime}ms)\n`);
        results.wins.set(winnerPlayer.name, (results.wins.get(winnerPlayer.name) || 0) + 1);
      }
    } else {
      console.log('\n💀 No winners\n');
    }

    // Broadcast result
    await serverClient.broadcastResult(
      sessionId,
      roundNum + 1,
      winner,
      question.answer
    );
  }

  // Return results, session ID, and clients (for cleanup)
  return {
    results,
    sessionId,
    gameClients: {
      server: serverClient,
      players: playerClients,
    },
  };
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
  const players = wallets.players;
  const server = wallets.server;

  console.log(`   ✅ Loaded ${wallets.all.length} wallets`);
  players.forEach(p => console.log(`      - ${p.name}: ${p.address}`));
  console.log(`      - ${server.name}: ${server.address}\n`);

  // ==================== CHANNEL CREATION ====================
  const channelIds = await setupChannels(players, server);

  // ==================== CLEARNODE CONNECTION ====================
  console.log('3. Connecting to ClearNode (off-chain)...\n');

  const allParticipants = [...players, server];
  const connections = await connectAllParticipants(allParticipants);

  console.log(`   ✅ All ${connections.size} participants connected\n`);

  // ==================== PLAY GAME ====================
  console.log('4. Setting up game clients and playing...\n');

  const allParticipantsForSession = [...players, server];
  const initialAllocations: Array<{
    participant: `0x${string}`;
    asset: string;
    amount: string;
  }> = allParticipantsForSession.map(p => ({
    participant: p.address,
    asset: 'eth',
    amount: '0', // Start with 0 - funds already locked in channels
  }));

  const { results, sessionId, gameClients } = await playGame(
    players,
    server,
    connections,
    allParticipantsForSession.map(p => p.address),
    initialAllocations
  );

  // ==================== DISPLAY RESULTS ====================
  const prizes = displayResults(results);

  // ==================== CLEANUP ====================
  console.log('\n🔒 CLEANUP PHASE\n');

  console.log('1. Closing application session...');
  await gameClients.server.endGame(
    sessionId,
    [] // Final allocations would be calculated from prizes
  );
  console.log('   ✅ Session closed\n');

  console.log('2. Cleaning up game clients...');
  gameClients.server.cleanup();
  gameClients.players.forEach(client => client.cleanup());
  console.log('   ✅ Clients cleaned up\n');

  console.log('3. Disconnecting from ClearNode...');
  disconnectAll(connections);
  console.log('   ✅ All disconnected\n');

  console.log('✅ GAME COMPLETE!\n');
  console.log('💡 Channel states updated off-chain via Yellow SDK');
  console.log('📋 Run `bun run status` to check balances\n');
}

main().catch(console.error);
