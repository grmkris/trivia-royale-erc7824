---
title: Complete Game Walkthrough
description: Full Trivia Royale implementation showing all patterns working together
---

# Complete Game: Trivia Royale

This is a complete multiplayer trivia game demonstrating **every major pattern** in Yellow SDK. Three players compete in a quiz game with instant messaging, balance verification, and prize distribution.

## Game Overview

**Players**: 3 players + 1 server (facilitator)
**Entry Fee**: 0.01 USDC per player (0.03 total)
**Rounds**: 3 trivia questions
**Scoring**: First correct answer wins the round
**Prizes**: 1st: 50%, 2nd: 30%, 3rd: 20%

## Architecture

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Player 1  │  │  Player 2  │  │  Player 3  │
│   Client   │  │   Client   │  │   Client   │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │                │                │
      └────────────────┼────────────────┘
                       │
                  WebSocket
                       │
               ┌───────▼────────┐
               │   ClearNode    │
               │   (Broker)     │
               └───────┬────────┘
                       │
                ┌──────▼───────┐
                │    Server    │
                │ (Game Logic) │
                └──────────────┘
```

## Complete Code

### Message Schema

```typescript
interface TriviaGameSchema extends MessageSchema {
  game_start: {
    data: { totalRounds: number; entryFee: string };
  };
  question: {
    data: { text: string; round: number };
  };
  answer: {
    data: {
      answer: string;
      round: number;
      from: Address;
      timestamp: number;
    };
  };
  round_result: {
    data: {
      winner: Address;
      correctAnswer: string;
      round: number;
    };
  };
  game_over: {
    data: {
      finalWinner: Address;
      scores: Record<string, number>;
    };
  };
}
```

### Server Implementation

```typescript
async function runTriviaGame() {
  const player1 = wallets.test34;
  const player2 = wallets.test35;
  const player3 = wallets.test36;
  const server = wallets.server;

  const ENTRY_FEE = '0.01';
  const QUESTIONS = [
    { question: 'What is 2+2?', answer: '4' },
    { question: 'What is the capital of France?', answer: 'Paris' },
    { question: 'Who created Bitcoin?', answer: 'Satoshi Nakamoto' },
  ];

  // Track game state
  const scores: Record<Address, number> = {
    [player1.address]: 0,
    [player2.address]: 0,
    [player3.address]: 0,
  };
  const answerSubmissions: Array<{
    round: number;
    from: Address;
    answer: string;
    timestamp: number;
  }> = [];

  // Create server client
  const serverClient = createBetterNitroliteClient<TriviaGameSchema>({
    wallet: server,
    onAppMessage: async (type, sessionId, data) => {
      // Server collects answers
      if (type === 'answer') {
        answerSubmissions.push(data);
      }
    }
  });

  // Create player clients with auto-response logic
  const client1 = createPlayerClient(player1, '4', 'London', 'Satoshi Nakamoto');
  const client2 = createPlayerClient(player2, '5', 'Paris', 'Satoshi Nakamoto');
  const client3 = createPlayerClient(player3, '4', 'Paris', 'Hal Finney');

  // Connect all clients
  await Promise.all([
    client1.connect(),
    client2.connect(),
    client3.connect(),
    serverClient.connect(),
  ]);

  // Record initial balances
  const p1Before = await client1.getBalances();
  const p2Before = await client2.getBalances();
  const p3Before = await client3.getBalances();

  console.log('💰 Initial Ledger Balances:');
  console.log(`  Player 1: ${formatUSDC(p1Before.ledger)}`);
  console.log(`  Player 2: ${formatUSDC(p2Before.ledger)}`);
  console.log(`  Player 3: ${formatUSDC(p3Before.ledger)}`);

  // Distributed session creation
  console.log('\n🔐 Creating session with distributed signatures...');

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

  const sessionId = await serverClient.createSession(sessionRequest, [
    sigServer as `0x${string}`,
    sig1 as `0x${string}`,
    sig2 as `0x${string}`,
    sig3 as `0x${string}`
  ]);

  console.log(`  ✅ Session created: ${sessionId}\n`);

  // Start game
  await serverClient.sendMessage(sessionId, 'game_start', {
    totalRounds: 3,
    entryFee: ENTRY_FEE,
  });

  console.log('🎮 Game started!\n');

  // Play rounds
  for (let round = 1; round <= 3; round++) {
    const q = QUESTIONS[round - 1]!;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📝 ROUND ${round}: ${q.question}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    answerSubmissions.length = 0;

    // Broadcast question
    await serverClient.sendMessage(sessionId, 'question', {
      text: q.question,
      round,
    });

    // Wait for answers
    await new Promise(resolve => setTimeout(resolve, 500));

    // Determine winner (fastest correct answer)
    const correctAnswers = answerSubmissions
      .filter(a => a.round === round && a.answer === q.answer)
      .sort((a, b) => a.timestamp - b.timestamp);

    const winner = correctAnswers[0]?.from;

    if (winner) {
      // Update score
      scores[winner]++;

      // Announce result
      await serverClient.sendMessage(sessionId, 'round_result', {
        winner,
        correctAnswer: q.answer,
        round,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const winnerName = getPlayerName(winner, [player1, player2, player3]);
      console.log(`\n🏆 Winner: ${winnerName}\n`);
    }
  }

  // Final results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Final Results:\n');

  const sortedScores = Object.entries(scores).sort(([, a], [, b]) => b - a);

  sortedScores.forEach(([addr, score], idx) => {
    const name = getPlayerName(addr as Address, [player1, player2, player3]);
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
    console.log(`  ${medal} ${name}: ${score} wins`);
  });

  const finalWinner = sortedScores[0]![0] as Address;

  await serverClient.sendMessage(sessionId, 'game_over', {
    finalWinner,
    scores: Object.fromEntries(sortedScores),
  });

  // Prize distribution (50%, 30%, 20%)
  const totalPot = parseUSDC(ENTRY_FEE) * 3n;
  const prizes = {
    first: (totalPot * 50n) / 100n,
    second: (totalPot * 30n) / 100n,
    third: (totalPot * 20n) / 100n,
  };

  const finalAllocations = [
    { participant: sortedScores[0]![0] as Address, asset: 'USDC', amount: formatUSDC(prizes.first) },
    { participant: sortedScores[1]![0] as Address, asset: 'USDC', amount: formatUSDC(prizes.second) },
    { participant: sortedScores[2]![0] as Address, asset: 'USDC', amount: formatUSDC(prizes.third) },
    { participant: server.address, asset: 'USDC', amount: '0' },
  ];

  console.log('\n🏆 Prize Distribution:');
  console.log(`  🥇 1st: ${formatUSDC(prizes.first)} USDC`);
  console.log(`  🥈 2nd: ${formatUSDC(prizes.second)} USDC`);
  console.log(`  🥉 3rd: ${formatUSDC(prizes.third)} USDC\n`);

  // Close session
  await serverClient.closeSession(sessionId, finalAllocations);
  console.log('✅ Session closed\n');

  // Verify fund conservation
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
    const name = getPlayerName(addr as Address, [player1, player2, player3]);
    const sign = change! >= 0n ? '+' : '';
    console.log(`  ${name}: ${sign}${formatUSDC(change!)} USDC`);
  });

  const totalChange = changes[player1.address]! + changes[player2.address]! + changes[player3.address]!;
  console.log(`\n  ✅ Fund conservation: ${totalChange === 0n ? 'PASS' : 'FAIL'}\n`);

  // Disconnect
  await Promise.all([
    client1.disconnect(),
    client2.disconnect(),
    client3.disconnect(),
    serverClient.disconnect(),
  ]);

  console.log('🎉 Game complete!\n');
}

// Helper: Create player client with auto-response
function createPlayerClient(
  wallet: Wallet,
  answer1: string,
  answer2: string,
  answer3: string
) {
  const answers = [answer1, answer2, answer3];

  return createBetterNitroliteClient<TriviaGameSchema>({
    wallet,
    sessionAllowance: '0.01',
    onAppMessage: async (type, sessionId, data) => {
      if (type === 'question') {
        const answer = answers[data.round - 1]!;

        setTimeout(async () => {
          await client.sendMessage(sessionId, 'answer', {
            answer,
            round: data.round,
            from: wallet.address,
            timestamp: Date.now(),
          });
        }, Math.random() * 200); // Random delay 0-200ms
      }
    },
  });
}

// Helper: Get player name for display
function getPlayerName(address: Address, players: Wallet[]): string {
  const index = players.findIndex(p => p.address === address);
  return index >= 0 ? `Player ${index + 1}` : 'Unknown';
}

// Helper: Format USDC with decimals
function formatUSDC(amount: bigint): string {
  const decimals = 6n;
  const whole = amount / (10n ** decimals);
  const fraction = amount % (10n ** decimals);
  return `${whole}.${fraction.toString().padStart(Number(decimals), '0')}`;
}

// Helper: Parse USDC string to bigint
function parseUSDC(amount: string): bigint {
  const [whole = '0', fraction = '0'] = amount.split('.');
  const paddedFraction = fraction.padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * 1000000n + BigInt(paddedFraction);
}
```

> 📁 **Full Implementation**: See the complete working code in the [Trivia Royale repository](TODO@kris: Add GitHub repository URL)
>
> Key files:
> - `client.ts` - BetterNitroliteClient implementation
> - `client.test.ts` - Full game test with balance verification
> - `game.test.ts` - Additional game patterns
> - `core/erc20.ts` - parseUSDC and formatUSDC helpers

## Key Patterns Demonstrated

### 1. Distributed Session Creation
```typescript
// Prepare → Sign → Collect → Create
const request = server.prepareSession({ ... });
const signatures = await collectAllSignatures(request);
const sessionId = await server.createSession(request, signatures);
```

### 2. Typed Message Broadcasting
```typescript
// Server broadcasts question
await server.sendMessage(sessionId, 'question', { text, round });

// All players receive and auto-respond
onAppMessage: (type, sessionId, data) => {
  if (type === 'question') {
    sendMessage(sessionId, 'answer', { ... });
  }
}
```

### 3. Balance Verification
```typescript
// Record before
const before = await client.getBalances();

// ... play game ...

// Verify after
const after = await client.getBalances();
const change = after.ledger - before.ledger;

// Fund conservation check
const totalChange = change1 + change2 + change3;
assert(totalChange === 0n); // Must sum to zero!
```

### 4. Prize Distribution
```typescript
// Close session with final allocations
await server.closeSession(sessionId, [
  { participant: winner, amount: '0.015' },   // 50%
  { participant: second, amount: '0.009' },   // 30%
  { participant: third, amount: '0.006' },    // 20%
]);

// Funds automatically return to ledger balances
```

## Critical Insights

### Fund Conservation Principle

**The golden rule**: The sum of all balance changes **must equal zero**. Value cannot be created or destroyed, only transferred.

```typescript
// Initial state - everyone starts at 0
const totalBefore = 0 + 0 + 0 = 0 USDC

// Entry fees deducted when session created
// player1: 0 - 0.01 = -0.01
// player2: 0 - 0.01 = -0.01
// player3: 0 - 0.01 = -0.01
// Total: -0.03 USDC

// Prizes distributed when session closed
// winner:  -0.01 + 0.015 = +0.005 (net +0.5¢)
// second:  -0.01 + 0.009 = -0.001 (net -0.1¢)
// third:   -0.01 + 0.006 = -0.004 (net -0.4¢)
// Total change: +0.005 - 0.001 - 0.004 = 0 ✓

// The total change MUST be zero
totalChange === 0n; // Fund conservation verified!
```

**Why this matters**:
- Ensures fair prize distribution (no funds lost or created)
- Detects bugs in allocation logic
- Validates session closed correctly

**What enforces it**: TODO@kris - Verify if ClearNode validates this or if it's a developer responsibility

Entry fees (3 × 0.01 = 0.03 USDC) were collected and redistributed as prizes (0.015 + 0.009 + 0.006 = 0.03 USDC). Total value in the system remains constant.

### Message Ordering
Answers may arrive out of order. Always include timestamps:
```typescript
const correctAnswers = submissions
  .filter(a => a.answer === correctAnswer)
  .sort((a, b) => a.timestamp - b.timestamp);

const winner = correctAnswers[0]; // Earliest timestamp wins
```

### Session Allowances
Players specify maximum stake when connecting:
```typescript
const client = createBetterNitroliteClient({
  wallet,
  sessionAllowance: '0.01',  // Won't join sessions > 0.01 USDC
});
```

## Next Steps

- **[Error Handling](./error-handling)**: Handle failures gracefully
- **[Building Blocks](/docs/trivia-royale/building-blocks)**: Deep dive into each pattern
- **[Core Concepts](/docs/trivia-royale/core-concepts)**: Understand the fundamentals
