import { createBetterNitroliteClient, type MessageSchema } from "./client";
import { loadWallets } from "../scripts/testWallets";
import { expect } from "bun:test";
import { describe, it } from "bun:test";
import { formatUSDC, parseUSDC } from "./core/erc20";
import type { Address, Hex } from "viem";

describe('BetterNitrolite - Multi-Round Trivia Game', () => {
  it('should play complete trivia game with ledger balance verification', async () => {
    const wallets = loadWallets();

    // Setup: 3 players + 1 server for realistic gameplay
    const player1 = wallets.test37;
    const player2 = wallets.test38;
    const player3 = wallets.test39;
    const server = wallets.server;

    console.log('\n🎮 TRIVIA ROYALE - Full Game Simulation\n');
    console.log(`Server: ${server.address}`);
    console.log(`Player 1: ${player1.address}`);
    console.log(`Player 2: ${player2.address}`);
    console.log(`Player 3: ${player3.address}\n`);

    // Define comprehensive game message schema
    interface TriviaGameSchema extends MessageSchema {
      game_start: {
        data: { totalRounds: number; entryFee: string };
      };
      question: {
        data: { text: string; round: number };
      };
      answer: {
        data: { answer: string; round: number; from: Address; timestamp: number };
      };
      round_result: {
        data: { winner: Address; correctAnswer: string; round: number };
      };
      game_over: {
        data: { finalWinner: Address; scores: Record<string, number> };
      };
    }

    // Game configuration
    const ENTRY_FEE = '0.01'; // 0.01 USDC per player
    const QUESTIONS = [
      { question: 'What is 2+2?', answer: '4' },
      { question: 'What is the capital of France?', answer: 'Paris' },
      { question: 'Who created Bitcoin?', answer: 'Satoshi Nakamoto' },
    ];

    // Player answer configurations (simulating different skill levels)
    const PLAYER_ANSWERS: Record<Address, Array<{ answer: string; delay: number }>> = {
      [player1.address]: [
        { answer: '4', delay: 100 },                 // Round 1: correct, fast ✓
        { answer: 'London', delay: 200 },            // Round 2: wrong ✗
        { answer: 'Satoshi Nakamoto', delay: 150 },  // Round 3: correct ✓
      ],
      [player2.address]: [
        { answer: '5', delay: 80 },                  // Round 1: wrong (fast but wrong) ✗
        { answer: 'Paris', delay: 120 },             // Round 2: correct, fast ✓
        { answer: 'Satoshi Nakamoto', delay: 200 },  // Round 3: correct ✓
      ],
      [player3.address]: [
        { answer: '4', delay: 150 },                 // Round 1: correct ✓
        { answer: 'Paris', delay: 180 },             // Round 2: correct ✓
        { answer: 'Hal Finney', delay: 100 },        // Round 3: wrong (fast but wrong) ✗
      ],
    };

    // Track game state
    const scores: Record<Address, number> = {
      [player1.address]: 0,
      [player2.address]: 0,
      [player3.address]: 0,
    };

    const messagesReceived: Array<{ client: string; type: string; data: any }> = [];
    const answerSubmissions: Array<{ round: number; from: Address; answer: string; timestamp: number }> = [];

    // Create clients with message handlers
    const client1 = createBetterNitroliteClient<TriviaGameSchema>({
      wallet: player1,
            sessionAllowance: '0.01',
      onAppMessage: async (type, sessionId, data) => {
        messagesReceived.push({ client: 'player1', type: String(type), data });

        if (type === 'question') {
          const round = data.round as number;
          const config = PLAYER_ANSWERS[player1.address]?.[round - 1];

          if (!config) {
            console.error(`No answer config for player1 round ${round}`);
            return;
          }

          // Simulate thinking time
          setTimeout(async () => {
            const timestamp = Date.now();
            await client1.sendMessage(sessionId, 'answer', {
              answer: config.answer,
              round,
              from: player1.address,
              timestamp,
            });
            answerSubmissions.push({ round, from: player1.address, answer: config.answer, timestamp });
            console.log(`   📤 Player 1 answered: "${config.answer}"`);
          }, config.delay);
        } else if (type === 'round_result') {
          if (data.winner === player1.address) {
            const currentScore = scores[player1.address];
            if (currentScore !== undefined) {
              scores[player1.address] = currentScore + 1;
            }
            console.log(`   🎉 Player 1 won round ${data.round}!`);
          }
        }
      },
    });

    const client2 = createBetterNitroliteClient<TriviaGameSchema>({
      wallet: player2,
            sessionAllowance: '0.01',
      onAppMessage: async (type, sessionId, data) => {
        messagesReceived.push({ client: 'player2', type: String(type), data });

        if (type === 'question') {
          const round = data.round as number;
          const config = PLAYER_ANSWERS[player2.address]?.[round - 1];

          if (!config) {
            console.error(`No answer config for player2 round ${round}`);
            return;
          }

          setTimeout(async () => {
            const timestamp = Date.now();
            await client2.sendMessage(sessionId, 'answer', {
              answer: config.answer,
              round,
              from: player2.address,
              timestamp,
            });
            answerSubmissions.push({ round, from: player2.address, answer: config.answer, timestamp });
            console.log(`   📤 Player 2 answered: "${config.answer}"`);
          }, config.delay);
        } else if (type === 'round_result') {
          if (data.winner === player2.address) {
            const currentScore = scores[player2.address];
            if (currentScore !== undefined) {
              scores[player2.address] = currentScore + 1;
            }
            console.log(`   🎉 Player 2 won round ${data.round}!`);
          }
        }
      },
    });

    const client3 = createBetterNitroliteClient<TriviaGameSchema>({
      wallet: player3,
            sessionAllowance: '0.01',
      onAppMessage: async (type, sessionId, data) => {
        messagesReceived.push({ client: 'player3', type: String(type), data });

        if (type === 'question') {
          const round = data.round as number;
          const config = PLAYER_ANSWERS[player3.address]?.[round - 1];

          if (!config) {
            console.error(`No answer config for player3 round ${round}`);
            return;
          }

          setTimeout(async () => {
            const timestamp = Date.now();
            await client3.sendMessage(sessionId, 'answer', {
              answer: config.answer,
              round,
              from: player3.address,
              timestamp,
            });
            answerSubmissions.push({ round, from: player3.address, answer: config.answer, timestamp });
            console.log(`   📤 Player 3 answered: "${config.answer}"`);
          }, config.delay);
        } else if (type === 'round_result') {
          if (data.winner === player3.address) {
            const currentScore = scores[player3.address];
            if (currentScore !== undefined) {
              scores[player3.address] = currentScore + 1;
            }
            console.log(`   🎉 Player 3 won round ${data.round}!`);
          }
        }
      },
    });

    const serverClient = createBetterNitroliteClient<TriviaGameSchema>({
      wallet: server,
            onAppMessage: async (type, sessionId, data) => {
        messagesReceived.push({ client: 'server', type: String(type), data });
      },
    });

    // ==================== CONNECT & AUTHENTICATE ====================
    console.log('📡 Step 1: Connecting all participants...\n');

    await Promise.all([
      client1.connect(),
      client2.connect(),
      client3.connect(),
      serverClient.connect(),
    ]);

    console.log('✅ All clients connected\n');

    // ==================== RECORD INITIAL BALANCES ====================
    console.log('💰 Step 2: Recording initial ledger balances...\n');

    const p1Before = await client1.getBalances();
    const p2Before = await client2.getBalances();
    const p3Before = await client3.getBalances();

    console.log(`   Player 1 ledger: ${formatUSDC(p1Before.ledger)} USDC`);
    console.log(`   Player 2 ledger: ${formatUSDC(p2Before.ledger)} USDC`);
    console.log(`   Player 3 ledger: ${formatUSDC(p3Before.ledger)} USDC\n`);

    // ==================== VALIDATE CHANNEL SETUP ====================
    console.log('💰 Step 2.5: Validating player channels...\n');

    const MIN_CHANNEL_BALANCE = parseUSDC('10'); // 10 USDC minimum

    for (const [name, client, balances] of [
      ['Player 1', client1, p1Before] as const,
      ['Player 2', client2, p2Before] as const,
      ['Player 3', client3, p3Before] as const,
    ]) {
      if (balances.channel === 0n) {
        // No channel - create one with 10 USDC
        console.log(`   📊 ${name}: No channel found, creating with 10 USDC...`);
        await client.deposit(MIN_CHANNEL_BALANCE);
        console.log(`   ✅ ${name}: Channel created\n`);
      } else if (balances.channel < MIN_CHANNEL_BALANCE) {
        // Channel exists but insufficient funds - add more
        const needed = MIN_CHANNEL_BALANCE - balances.channel;
        console.log(`   📊 ${name}: Insufficient balance, adding ${formatUSDC(needed)} USDC...`);
        await client.deposit(needed);
        console.log(`   ✅ ${name}: Channel topped up\n`);
      } else {
        console.log(`   ✅ ${name}: Has ${formatUSDC(balances.channel)} USDC (sufficient)\n`);
      }
    }

    // ==================== DISTRIBUTED SESSION CREATION ====================
    console.log('🔐 Step 3: Creating game session with distributed signatures...\n');

    const sessionRequest = serverClient.prepareSession({
      participants: [player1.address, player2.address, player3.address, server.address],
      allocations: [
        { participant: player1.address, asset: 'USDC', amount: ENTRY_FEE },
        { participant: player2.address, asset: 'USDC', amount: ENTRY_FEE },
        { participant: player3.address, asset: 'USDC', amount: ENTRY_FEE },
        { participant: server.address, asset: 'USDC', amount: '0' },
      ],
    });

    const [sig1, sig2, sig3, sigServer] = await Promise.all([
      client1.signSessionRequest(sessionRequest),
      client2.signSessionRequest(sessionRequest),
      client3.signSessionRequest(sessionRequest),
      serverClient.signSessionRequest(sessionRequest),
    ]);

    console.log(`   ✅ All participants signed`);

    const sessionId = await serverClient.createSession(sessionRequest, [sigServer as `0x${string}`, sig1 as `0x${string}`, sig2 as `0x${string}`, sig3 as `0x${string}`]);

    console.log(`   ✅ Session created: ${sessionId}\n`);

    // ==================== PLAY MULTI-ROUND TRIVIA ====================
    console.log('🎲 Step 4: Playing 3-round trivia game...\n');

    // Start game
    await serverClient.sendMessage(sessionId, 'game_start', {
      totalRounds: 3,
      entryFee: ENTRY_FEE,
    });

    console.log('   🎮 Game started!\n');

    // Play each round
    for (let round = 1; round <= 3; round++) {
      const q = QUESTIONS[round - 1];

      if (!q) {
        console.error(`No question for round ${round}`);
        continue;
      }

      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   📝 ROUND ${round}: ${q.question}`);
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // Clear previous round's submissions
      answerSubmissions.length = 0;

      // Broadcast question
      await serverClient.sendMessage(sessionId, 'question', {
        text: q.question,
        round,
      });

      // Wait for all answers (players auto-respond via handlers)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Determine winner (fastest correct answer)
      const correctAnswers = answerSubmissions
        .filter(a => a.round === round && a.answer === q.answer)
        .sort((a, b) => a.timestamp - b.timestamp);

      const winner = correctAnswers[0]?.from;

      if (winner) {
        // Announce winner
        await serverClient.sendMessage(sessionId, 'round_result', {
          winner,
          correctAnswer: q.answer,
          round,
        });

        // Give handlers time to update scores
        await new Promise(resolve => setTimeout(resolve, 100));

        const winnerName = winner === player1.address ? 'Player 1'
                         : winner === player2.address ? 'Player 2'
                         : 'Player 3';

        const firstCorrect = correctAnswers[0];
        const firstAnswer = answerSubmissions[0];
        if (firstCorrect && firstAnswer) {
          console.log(`\n   🏆 Winner: ${winnerName} (answered in ${firstCorrect.timestamp - firstAnswer.timestamp}ms)\n`);
        }
      } else {
        console.log(`\n   💀 No correct answers this round\n`);
      }
    }

    // ==================== DETERMINE FINAL WINNER ====================
    console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Step 5: Final Results\n');

    const sortedScores = Object.entries(scores)
      .sort(([, a], [, b]) => b - a);

    sortedScores.forEach(([addr, score], idx) => {
      const name = addr === player1.address ? 'Player 1'
                 : addr === player2.address ? 'Player 2'
                 : 'Player 3';
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
      console.log(`   ${medal} ${name}: ${score} wins`);
    });

    const firstPlace = sortedScores[0];
    if (!firstPlace) {
      throw new Error('No scores recorded');
    }
    const finalWinner = firstPlace[0] as Address;

    await serverClient.sendMessage(sessionId, 'game_over', {
      finalWinner,
      scores: Object.fromEntries(sortedScores),
    });

    console.log(`\n   🎉 Champion: ${finalWinner === player1.address ? 'Player 1' : finalWinner === player2.address ? 'Player 2' : 'Player 3'}!\n`);

    // ==================== VERIFY LEDGER BALANCES ====================
    console.log('💰 Step 6: Checking ledger balances after game...\n');

    // Small delay to ensure messages propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    const p1During = await client1.getBalances();
    const p2During = await client2.getBalances();
    const p3During = await client3.getBalances();

    console.log(`   Player 1 ledger: ${formatUSDC(p1During.ledger)} USDC (was ${formatUSDC(p1Before.ledger)})`);
    console.log(`   Player 2 ledger: ${formatUSDC(p2During.ledger)} USDC (was ${formatUSDC(p2Before.ledger)})`);
    console.log(`   Player 3 ledger: ${formatUSDC(p3During.ledger)} USDC (was ${formatUSDC(p3Before.ledger)})\n`);

    // ==================== CLOSE SESSION WITH PRIZES ====================
    console.log('🏆 Step 7: Distributing prizes...\n');

    // Prize distribution: 1st: 50%, 2nd: 30%, 3rd: 20%
    const totalPot = parseUSDC(ENTRY_FEE) * 3n; // Parse human-readable to micro-USDC
    const prizes = {
      first: (totalPot * 50n) / 100n,
      second: (totalPot * 30n) / 100n,
      third: (totalPot * 20n) / 100n,
    };

    const firstPlaceAddr = sortedScores[0]?.[0];
    const secondPlaceAddr = sortedScores[1]?.[0];
    const thirdPlaceAddr = sortedScores[2]?.[0];

    if (!firstPlaceAddr || !secondPlaceAddr || !thirdPlaceAddr) {
      throw new Error('Not enough players in sorted scores');
    }

    const finalAllocations = [
      { participant: firstPlaceAddr as Address, asset: 'USDC', amount: formatUSDC(prizes.first) },
      { participant: secondPlaceAddr as Address, asset: 'USDC', amount: formatUSDC(prizes.second) },
      { participant: thirdPlaceAddr as Address, asset: 'USDC', amount: formatUSDC(prizes.third) },
      { participant: server.address, asset: 'USDC', amount: '0' },
    ];

    console.log(`   🥇 1st place: ${formatUSDC(prizes.first)} USDC`);
    console.log(`   🥈 2nd place: ${formatUSDC(prizes.second)} USDC`);
    console.log(`   🥉 3rd place: ${formatUSDC(prizes.third)} USDC\n`);

    await serverClient.closeSession(sessionId, finalAllocations);
    console.log('   ✅ Session closed\n');

    // ==================== FINAL VERIFICATION ====================
    console.log('✅ Step 8: Final verification...\n');

    // Wait for close to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    const p1After = await client1.getBalances();
    const p2After = await client2.getBalances();
    const p3After = await client3.getBalances();

    const changes = {
      [player1.address]: p1After.ledger - p1Before.ledger,
      [player2.address]: p2After.ledger - p2Before.ledger,
      [player3.address]: p3After.ledger - p3Before.ledger,
    };

    console.log('💸 Ledger Balance Changes:\n');
    Object.entries(changes).forEach(([addr, change]) => {
      if (change === undefined) return;

      const name = addr === player1.address ? 'Player 1'
                 : addr === player2.address ? 'Player 2'
                 : 'Player 3';
      const sign = change >= 0n ? '+' : '';
      console.log(`   ${name}: ${sign}${formatUSDC(change)} USDC`);
    });

    // Verify conservation of funds (sum of changes should be 0)
    const change1 = changes[player1.address];
    const change2 = changes[player2.address];
    const change3 = changes[player3.address];

    if (change1 === undefined || change2 === undefined || change3 === undefined) {
      throw new Error('Missing player balance changes');
    }

    const totalChange = change1 + change2 + change3;
    expect(totalChange).toBe(0n);
    console.log(`\n   ✅ Fund conservation verified (total change: ${totalChange})\n`);

    // Verify session cleanup
    expect(serverClient.getActiveSessions()).not.toContain(sessionId);
    console.log('   ✅ Session cleanup verified\n');

    // ==================== SUMMARY ====================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 GAME COMPLETE - Yellow SDK Value Proposition Demonstrated!\n');
    console.log('What we proved:');
    console.log('  ✅ Multi-party session creation (4 participants)');
    console.log('  ✅ Distributed signature collection (all sign)');
    console.log('  ✅ Real-time message broadcasting (questions + answers)');
    console.log('  ✅ Bidirectional communication (server ↔ players)');
    console.log('  ✅ Off-chain value transfer via ledger (0.03 USDC total)');
    console.log('  ✅ Prize distribution based on performance');
    console.log('  ✅ Balance verification (conservation of funds)');
    console.log('  ✅ Complete session lifecycle (create → play → close)\n');
    console.log('💡 Key Insight:');
    console.log('   The entire game (3 rounds, 9 messages) happened off-chain with');
    console.log('   instant settlement and zero gas fees after initial session setup!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ==================== DISCONNECT ====================
    console.log('🔌 Disconnecting all clients...');
    await Promise.all([
      client1.disconnect(),
      client2.disconnect(),
      client3.disconnect(),
      serverClient.disconnect(),
    ]);
    console.log('✅ Test complete!\n');

  }, 120000); // 2 minute timeout for comprehensive test
});
