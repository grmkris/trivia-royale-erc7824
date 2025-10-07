/**
 * Simple Hono server for Trivia Royale
 *
 * Purpose: Expose server wallet address for testing send operations
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createBetterNitroliteClient,
  createWallet,
  parseUSDC,
  formatUSDC,
  type TriviaGameSchema,
  type LobbyState,
  type SignatureSubmission,
  type GameState,
} from '@trivia-royale/game';
import { mnemonicToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { z } from 'zod';
import { createFileSystemKeyManager } from '@trivia-royale/game/fs-key-manager';
import type { Address } from 'viem';


// Environment validation
const envSchema = z.object({
  MNEMONIC: z.string(),
});
const env = envSchema.parse(Bun.env);

// Create server wallet from mnemonic
// HD Path: m/44'/60'/0'/0/2 (index 2 = server, 0 = funding, 1 = broker)
const account = mnemonicToAccount(env.MNEMONIC, { accountIndex: 2 });

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Use FileSystem key manager for persistent session keys across server restarts
const keyManager = createFileSystemKeyManager('./data');

const serverWallet = createWallet({
  // @ts-expect-error - walletClient is not typed correctly
  walletClient,
  // @ts-expect-error - publicClient is not typed correctly
  publicClient,
  sessionKeyManager: keyManager
});

// ==================== GAME CONSTANTS ====================

const ENTRY_FEE = '0.01'; // 0.01 USDC per player
const TOTAL_ROUNDS = 3;
const ANSWER_TIMEOUT_MS = 5000;
const ROUND_DELAY_MS = 1000;
const LOBBY_RESET_DELAY_MS = 5000;
const PRIZE_SPLIT = { first: 50, second: 30, third: 20 } as const;

const QUESTIONS = [
  { question: 'What is 2+2?', answer: '4' },
  { question: 'What is the capital of France?', answer: 'Paris' },
  { question: 'Who created Bitcoin?', answer: 'Satoshi Nakamoto' },
];

// ==================== GAME STATE ====================

// Lobby state
let lobby: LobbyState = {
  players: [],
  maxPlayers: 3,
  status: 'waiting',
};

// Signature collection
const signatures = new Map<Address, `0x${string}`>();

// Game state
let currentGame: GameState | null = null;
let answerSubmissions: Array<{ round: number; from: Address; answer: string; timestamp: number }> = [];

// Create server client with game message handler
const serverClient = createBetterNitroliteClient<TriviaGameSchema>({
  wallet: serverWallet,
  sessionAllowance: '0.1',
  onAppMessage: async (type, sessionId, data) => {
    console.log('📬 Server received message:', type, data);

    // Handle player answers
    if (type === 'answer' && currentGame) {
      answerSubmissions.push({
        round: data.round,
        from: data.from,
        answer: data.answer,
        timestamp: data.timestamp,
      });
      console.log(`   📥 Answer from ${data.from.slice(0, 10)}...: "${data.answer}"`);
    }
  }
});

// Connect to ClearNode on startup
console.log('🚀 Starting server...');
console.log(`📍 Server address: ${serverWallet.address}`);

// Try to connect to ClearNode and initialize channel (non-blocking)
try {
  await serverClient.connect();
  console.log('✅ Connected to ClearNode');

  // Check and initialize channel
  const MIN_CHANNEL_BALANCE = parseUSDC('10'); // 10 USDC minimum
  const balances = await serverClient.getBalances();

  console.log('💰 Server balances:');
  console.log(`  Wallet: ${formatUSDC(balances.wallet)} USDC`);
  console.log(`  Custody: ${formatUSDC(balances.custodyContract)} USDC`);
  console.log(`  Channel: ${formatUSDC(balances.channel)} USDC`);
  console.log(`  Ledger: ${formatUSDC(balances.ledger)} USDC`);

  if (balances.channel === 0n) {
    console.log(`📊 No channel found, creating with ${formatUSDC(MIN_CHANNEL_BALANCE)} USDC...`);
    await serverClient.deposit(MIN_CHANNEL_BALANCE);
    console.log('✅ Channel created');
  } else if (balances.channel < MIN_CHANNEL_BALANCE) {
    console.warn(
      `⚠️  Low channel balance: ${formatUSDC(balances.channel)} ` +
      `(recommended: ${formatUSDC(MIN_CHANNEL_BALANCE)})`
    );
  } else {
    console.log(`✅ Channel exists with ${formatUSDC(balances.channel)} USDC`);
  }
} catch (err) {
  console.error('⚠️  ClearNode unavailable - server starting in degraded mode');
  console.error('   Game endpoints will not work until ClearNode is connected');
}

// ==================== GAME LOGIC ====================

async function startGame() {
  try {
    if (!lobby.sessionRequest) {
      throw new Error('No session request prepared');
    }

    // Get server signature
    const serverSig = await serverClient.signSessionRequest(lobby.sessionRequest);

    // Collect all signatures in correct order: [server, ...players]
    const allSignatures: `0x${string}`[] = [
      serverSig as `0x${string}`,
      ...lobby.players.map(p => signatures.get(p.address)!),
    ];

    // Create session
    const sessionId = await serverClient.createSession(lobby.sessionRequest, allSignatures);
    console.log(`✅ Session created: ${sessionId}`);

    lobby.status = 'in_progress';
    lobby.sessionId = sessionId;

    // Initialize game state
    currentGame = {
      sessionId,
      currentRound: 0,
      totalRounds: TOTAL_ROUNDS,
      scores: {},
      status: 'active',
    };

    // Initialize scores
    for (const player of lobby.players) {
      currentGame.scores[player.address] = 0;
    }

    // Send game start message
    await serverClient.sendMessage(sessionId, 'game_start', {
      totalRounds: TOTAL_ROUNDS,
      entryFee: ENTRY_FEE,
    });

    console.log(`🎮 Game started! Playing ${TOTAL_ROUNDS} rounds...\n`);

    // Play all rounds
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      await playRound(sessionId, round);
    }

    // End game
    await endGame(sessionId);

  } catch (err) {
    console.error('❌ Failed to start game:', err);
    resetLobby();
  }
}

async function playRound(sessionId: string, roundNumber: number) {
  if (!currentGame) return;

  currentGame.currentRound = roundNumber;
  const question = QUESTIONS[roundNumber - 1];

  if (!question) {
    console.error(`No question for round ${roundNumber}`);
    return;
  }

  console.log(`\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   📝 ROUND ${roundNumber}: ${question.question}`);
  console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Clear previous round's submissions
  answerSubmissions.length = 0;

  // Broadcast question
  await serverClient.sendMessage(sessionId as `0x${string}`, 'question', {
    text: question.question,
    round: roundNumber,
  });

  // Wait for all answers
  await new Promise(resolve => setTimeout(resolve, ANSWER_TIMEOUT_MS));

  // Determine winner (fastest correct answer)
  const correctAnswers = answerSubmissions
    .filter(a => a.round === roundNumber && a.answer.toLowerCase() === question.answer.toLowerCase())
    .sort((a, b) => a.timestamp - b.timestamp);

  const winner = correctAnswers[0]?.from;

  if (winner) {
    // Update score
    currentGame.scores[winner] = (currentGame.scores[winner] || 0) + 1;

    // Announce winner
    await serverClient.sendMessage(sessionId as `0x${string}`, 'round_result', {
      winner,
      correctAnswer: question.answer,
      round: roundNumber,
    });

    console.log(`\n   🏆 Winner: ${winner.slice(0, 10)}... (correct answer: "${question.answer}")\n`);
  } else {
    console.log(`\n   💀 No correct answers this round\n`);
  }

  // Small delay between rounds
  await new Promise(resolve => setTimeout(resolve, ROUND_DELAY_MS));
}

async function endGame(sessionId: string) {
  if (!currentGame) return;

  console.log('\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Game Over! Final Results:\n');

  // Sort by score
  const sortedScores = Object.entries(currentGame.scores)
    .sort(([, a], [, b]) => b - a);

  sortedScores.forEach(([addr, score], idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
    console.log(`   ${medal} ${addr.slice(0, 10)}...: ${score} wins`);
  });

  const finalWinner = sortedScores[0]?.[0] as Address;

  // Send game over message
  await serverClient.sendMessage(sessionId as `0x${string}`, 'game_over', {
    finalWinner,
    scores: Object.fromEntries(sortedScores),
  });

  // Distribute prizes
  const totalPot = parseUSDC(ENTRY_FEE) * BigInt(lobby.maxPlayers);
  const prizes = {
    first: (totalPot * BigInt(PRIZE_SPLIT.first)) / 100n,
    second: (totalPot * BigInt(PRIZE_SPLIT.second)) / 100n,
    third: (totalPot * BigInt(PRIZE_SPLIT.third)) / 100n,
  };

  const firstPlaceAddr = sortedScores[0]?.[0] as Address;
  const secondPlaceAddr = sortedScores[1]?.[0] as Address;
  const thirdPlaceAddr = sortedScores[2]?.[0] as Address;

  console.log(`\n   🏆 Prizes:`);
  console.log(`   🥇 1st: ${formatUSDC(prizes.first)} USDC`);
  console.log(`   🥈 2nd: ${formatUSDC(prizes.second)} USDC`);
  console.log(`   🥉 3rd: ${formatUSDC(prizes.third)} USDC\n`);

  // Close session with prize distribution
  const finalAllocations = [
    { participant: firstPlaceAddr, asset: 'USDC', amount: formatUSDC(prizes.first) },
    { participant: secondPlaceAddr, asset: 'USDC', amount: formatUSDC(prizes.second) },
    { participant: thirdPlaceAddr, asset: 'USDC', amount: formatUSDC(prizes.third) },
    { participant: serverWallet.address, asset: 'USDC', amount: '0' },
  ];

  await serverClient.closeSession(sessionId as `0x${string}`, finalAllocations);
  console.log('✅ Session closed, prizes distributed!\n');

  // Mark game as finished
  currentGame.status = 'finished';

  // Reset lobby after a delay
  setTimeout(resetLobby, LOBBY_RESET_DELAY_MS);
}

function resetLobby() {
  console.log('🔄 Resetting lobby...\n');
  lobby = {
    players: [],
    maxPlayers: 3,
    status: 'waiting',
  };
  signatures.clear();
  currentGame = null;
  answerSubmissions.length = 0;
}

// Create Hono app
const app = new Hono();

// Disable CORS because this is a demo server
app.use('/*', cors({
  origin: '*',
  credentials: true,
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get server address (for testing sends)
app.get('/server-address', (c) => {
  return c.json({
    address: serverWallet.address,
    sessionAddress: serverWallet.sessionSigner.address
  });
});

// Get server balances
app.get('/server-balances', async (c) => {
  try {
    const balances = await serverClient.getBalances();
    return c.json({
      wallet: balances.wallet.toString(),
      custody: balances.custodyContract.toString(),
      channel: balances.channel.toString(),
      ledger: balances.ledger.toString()
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch balances' }, 500);
  }
});

// ==================== GAME ENDPOINTS ====================

// Join game lobby
app.post('/join-game', async (c) => {
  try {
    const body = await c.req.json();
    const playerAddress = body.playerAddress as Address;

    if (!playerAddress) {
      return c.json({ error: 'playerAddress required' }, 400);
    }

    // Check if already in lobby
    if (lobby.players.some(p => p.address === playerAddress)) {
      return c.json(lobby);
    }

    // Check if lobby full
    if (lobby.players.length >= lobby.maxPlayers) {
      return c.json({ error: 'Lobby full' }, 400);
    }

    // Add player
    lobby.players.push({
      address: playerAddress,
      joinedAt: Date.now(),
    });

    console.log(`🎮 Player joined: ${playerAddress.slice(0, 10)}... (${lobby.players.length}/${lobby.maxPlayers})`);

    // If lobby full, prepare session
    if (lobby.players.length === lobby.maxPlayers) {
      lobby.status = 'collecting_signatures';

      // Prepare session request
      const sessionRequest = serverClient.prepareSession({
        participants: [...lobby.players.map(p => p.address), serverWallet.address],
        allocations: [
          ...lobby.players.map(p => ({
            participant: p.address,
            asset: 'USDC',
            amount: ENTRY_FEE
          })),
          { participant: serverWallet.address, asset: 'USDC', amount: '0' },
        ],
      });

      lobby.sessionRequest = sessionRequest;
      console.log('📝 Session request prepared, waiting for signatures...');
    }

    return c.json(lobby);
  } catch (err) {
    console.error('Error in /join-game:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get lobby state
app.get('/lobby-state', (c) => {
  return c.json(lobby);
});

// Submit signature
app.post('/submit-signature', async (c) => {
  try {
    const body = await c.req.json();
    const { playerAddress, signature } = body as SignatureSubmission;

    if (!playerAddress || !signature) {
      return c.json({ error: 'playerAddress and signature required' }, 400);
    }

    signatures.set(playerAddress, signature);
    console.log(`✍️  Signature received from ${playerAddress.slice(0, 10)}... (${signatures.size}/${lobby.maxPlayers})`);

    // If all signatures collected, start game
    if (signatures.size === lobby.maxPlayers && lobby.sessionRequest) {
      lobby.status = 'starting';
      console.log('🚀 All signatures collected, starting game...');

      // Start game asynchronously
      setTimeout(() => startGame(), 100);
    }

    return c.json({
      received: signatures.size,
      needed: lobby.maxPlayers
    });
  } catch (err) {
    console.error('Error in /submit-signature:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get game state
app.get('/game-state', (c) => {
  return c.json(currentGame || { status: 'no_game' });
});

console.log('🎮 Server running on http://localhost:3002');

export default {
  port: 3002,
  fetch: app.fetch
};
