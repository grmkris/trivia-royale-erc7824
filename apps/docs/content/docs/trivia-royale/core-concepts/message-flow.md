---
title: Message Flow
description: How clients exchange messages in real-time through the ClearNode broker
---

# Message Flow

All real-time communication in Trivia Royale happens through **typed messages** broadcast via the ClearNode broker. This guide shows you how to define, send, and handle messages using the actual trivia game as an example.

## The Pattern

```typescript
// 1. Define your message types
interface TriviaGameSchema extends MessageSchema {
  question: { data: { text: string; round: number } };
  answer: { data: { answer: string; from: Address; timestamp: number } };
}

// 2. Handle incoming messages
onAppMessage: async (type, sessionId, data) => {
  if (type === 'question') {
    // Respond to question
    await client.sendMessage(sessionId, 'answer', { ... });
  }
}

// 3. Send messages
await client.sendMessage(sessionId, 'question', {
  text: 'What is 2+2?',
  round: 1,
});
```

**Key principle:** Messages are **broadcast to all participants** including the sender. This means:
- Server sends `question` → Server, Player 1, Player 2, Player 3 all receive it
- Player 1 sends `answer` → Server, Player 1, Player 2, Player 3 all receive it

## Step 1: Define Your Message Schema

Use TypeScript to define all message types your game will use:

```typescript twoslash
import type { MessageSchema } from '@trivia-royale/game';
import type { Address } from 'viem';

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
```

TypeScript automatically narrows the `data` type based on the message `type` in your handlers.

## Step 2: Handle Incoming Messages

Set up `onAppMessage` to receive and process messages:

```typescript twoslash
import { createBetterNitroliteClient, type MessageSchema } from '@trivia-royale/game';
import type { Wallet } from '@trivia-royale/game';
import type { Address, Hex } from 'viem';

interface TriviaGameSchema extends MessageSchema {
  question: { data: { text: string; round: number } };
  answer: { data: { answer: string; round: number; from: Address; timestamp: number } };
}

declare const wallet: Wallet;
declare function computeAnswer(text: string): string;
// ---cut---
const client = createBetterNitroliteClient<TriviaGameSchema>({
  wallet,
  onAppMessage: async (type, sessionId, data) => {
    if (type === 'question') {
      // TypeScript knows data is { text: string; round: number }
      console.log(`Question ${data.round}: ${data.text}`);

      // Respond with answer
      await client.sendMessage(sessionId, 'answer', {
        answer: computeAnswer(data.text),
        round: data.round,
        from: wallet.address,
        timestamp: Date.now(),
      });
    }

    if (type === 'answer') {
      // Only process answers from OTHER players
      if (data.from !== wallet.address) {
        console.log(`${data.from} answered: ${data.answer}`);
      }
    }
  },
});
```

**Pattern:** Check message type → Process data → Optionally send response

**When to filter:** Since you receive your own messages, filter them out when collecting responses from others (like `answer` messages). Don't filter when everyone should react the same way (like `game_start`).

## Step 3: Send Messages

Use `sendMessage()` to broadcast to all session participants:

```typescript twoslash
import { createBetterNitroliteClient, type MessageSchema } from '@trivia-royale/game';
import type { Hex } from 'viem';

interface TriviaGameSchema extends MessageSchema {
  question: { data: { text: string; round: number } };
}

declare const client: ReturnType<typeof createBetterNitroliteClient<TriviaGameSchema>>;
declare const sessionId: Hex;
// ---cut---
// Server broadcasts question to all players
await client.sendMessage(sessionId, 'question', {
  text: 'What is the capital of France?',
  round: 2,
});
```

This broadcasts to:
- All other participants in the session
- Yourself (arrives in your `onAppMessage`)

## Real Example: Trivia Game Round

Here's how a complete round flows in the trivia game (from `packages/trivia-royale/src/game.test.ts:290-343`):

```typescript
// Server broadcasts question
await serverClient.sendMessage(sessionId, 'question', {
  text: 'What is 2+2?',
  round: 1,
});

// All players receive it and auto-respond via their handlers:
// Player 1's handler:
onAppMessage: async (type, sessionId, data) => {
  if (type === 'question') {
    await client.sendMessage(sessionId, 'answer', {
      answer: '4',
      round: data.round,
      from: player1.address,
      timestamp: Date.now(),
    });
  }
}

// Server receives all answers and determines winner
onAppMessage: async (type, sessionId, data) => {
  if (type === 'answer') {
    answerSubmissions.push(data);

    if (answerSubmissions.length === totalPlayers) {
      // Find fastest correct answer
      const correctAnswers = answerSubmissions
        .filter(a => a.answer === '4')
        .sort((a, b) => a.timestamp - b.timestamp);

      const winner = correctAnswers[0].from;

      // Announce winner
      await serverClient.sendMessage(sessionId, 'round_result', {
        winner,
        correctAnswer: '4',
        round: 1,
      });
    }
  }
}
```

**Flow:**
1. Server: broadcasts `question` → Everyone receives it (including server)
2. Players: each sends `answer` → Everyone receives all answers (including the player who sent it)
3. Server: collects answers, determines winner, broadcasts `round_result` → Everyone receives it

**Total messages:** 1 question + 3 answers + 1 result = 5 messages, all broadcast to all 4 participants

## Important Details

### Always Include Sender Address

Since messages broadcast to everyone, include the sender so recipients can identify who sent it:

```typescript
interface AnswerMessage {
  data: {
    answer: string;
    from: Address;  // ← Always include!
  };
}
```

### Add Timestamps for Timing

When speed matters (like trivia), include timestamps:

```typescript
interface AnswerMessage {
  data: {
    answer: string;
    from: Address;
    timestamp: number;  // ← Enables "fastest correct answer" logic
  };
}
```

Then sort by timestamp to determine order:

```typescript
const sorted = answers.sort((a, b) => a.timestamp - b.timestamp);
const fastest = sorted[0];
```

### Message Ordering

**Per-sender ordering is guaranteed:**
```typescript
// Server sends 3 questions
await server.sendMessage(sessionId, 'question', { round: 1, ... });
await server.sendMessage(sessionId, 'question', { round: 2, ... });
await server.sendMessage(sessionId, 'question', { round: 3, ... });

// All players receive them in order: round 1, 2, 3 ✓
```

**Cross-sender ordering is NOT guaranteed:**
```typescript
// Player 1 sends answer at 10:00:00.100
await player1.sendMessage(sessionId, 'answer', { ... });

// Player 2 sends answer at 10:00:00.080 (earlier!)
await player2.sendMessage(sessionId, 'answer', { ... });

// Server might receive Player 2's first, even though it was sent later
```

**Solution:** Use timestamps to determine actual order when it matters.

## Next Steps

Now that you understand message flow:
- **[Ping-Pong Example](../patterns/ping-pong)**: Build a minimal message-driven app
- **[Complete Game](../patterns/complete-game)**: See the full trivia game implementation
