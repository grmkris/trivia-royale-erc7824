---
title: Typed Messaging
description: Type-safe message schemas and event handlers
---

# Typed Messaging

The `BetterNitroliteClient` supports **fully typed message schemas** using TypeScript, giving you autocomplete, compile-time type checking, and self-documenting message formats.

## Defining a Message Schema

Extend the `MessageSchema` interface to define your application's message types:

```typescript
import { MessageSchema } from './client';
import type { Address } from 'viem';

interface TriviaGameSchema extends MessageSchema {
  game_start: {
    data: { totalRounds: number; entryFee: string };
  };
  question: {
    data: { text: string; round: number };
  };
  answer: {
    data: { answer: string; from: Address; timestamp: number };
  };
  result: {
    data: { winner: Address; round: number };
  };
}
```

Each key is a **message type**, and the `data` field defines the payload shape.

## Creating a Typed Client

Pass your schema as a type parameter:

```typescript
const client = createBetterNitroliteClient<TriviaGameSchema>({
  wallet,
  onAppMessage: async (type, sessionId, data) => {
    // 'type' is: 'game_start' | 'question' | 'answer' | 'result'
    // 'data' is typed based on 'type'!
  }
});
```

## Type-Safe Message Handlers

The handler gives you autocomplete and type checking:

```typescript
onAppMessage: async (type, sessionId, data) => {
  switch (type) {
    case 'question':
      // data.text: string
      // data.round: number
      console.log(`Q${data.round}: ${data.text}`);
      break;

    case 'answer':
      // data.answer: string
      // data.from: Address
      // data.timestamp: number
      if (data.from !== myAddress) {
        recordAnswer(data);
      }
      break;

    case 'result':
      // data.winner: Address
      // data.round: number
      if (data.winner === myAddress) {
        console.log('I won!');
      }
      break;
  }
}
```

## Sending Typed Messages

`sendMessage` is also type-safe:

```typescript
// ✓ Valid
await client.sendMessage(sessionId, 'question', {
  text: 'What is 2+2?',
  round: 1
});

// ✗ TypeScript error: missing 'round'
await client.sendMessage(sessionId, 'question', {
  text: 'What is 2+2?'
});

// ✗ TypeScript error: 'unknown_type' not in schema
await client.sendMessage(sessionId, 'unknown_type', { ... });
```

## Best Practices

### 1. Always Include Sender Address

```typescript
answer: {
  data: {
    answer: string;
    from: Address;  // ← Enables filtering in handlers
  };
}
```

### 2. Add Timestamps for Ordering

```typescript
move: {
  data: {
    x: number;
    y: number;
    timestamp: number;  // ← Enables correct ordering
  };
}
```

### 3. Use Discriminated Unions

For complex message types with variants:

```typescript
interface GameMessage extends MessageSchema {
  action: {
    data:
      | { type: 'move'; x: number; y: number }
      | { type: 'attack'; target: Address }
      | { type: 'defend'; shield: number };
  };
}

onAppMessage: (type, sessionId, data) => {
  if (type === 'action') {
    switch (data.type) {
      case 'move': /* data.x, data.y available */ break;
      case 'attack': /* data.target available */ break;
      case 'defend': /* data.shield available */ break;
    }
  }
}
```

### 4. Document Message Purpose

Use JSDoc comments for clarity:

```typescript
interface ChessSchema extends MessageSchema {
  /** Player makes a move */
  move: {
    data: {
      /** Algebraic notation (e.g., "e4", "Nf3") */
      notation: string;
      /** Move timestamp in milliseconds */
      timestamp: number;
    };
  };

  /** Game ended with a result */
  game_over: {
    data: {
      /** Winner address, or null for draw */
      winner: Address | null;
      /** Reason: 'checkmate', 'timeout', 'resignation', 'draw' */
      reason: string;
    };
  };
}
```

## Next Steps

- **[Session Lifecycle](./session-lifecycle)**: Manage active sessions
- **[Ping-Pong Example](../patterns/ping-pong)**: Simple typed messaging in action
- **[Complete Game](../patterns/complete-game)**: Complex message flows
