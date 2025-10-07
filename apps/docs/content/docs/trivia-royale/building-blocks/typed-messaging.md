---
title: Typed Messaging
description: Type-safe message schemas with TypeScript
---

# Typed Messaging

Using TypeScript interfaces for message types provides autocomplete and compile-time type checking.

## Defining Message Types

```typescript
import { MessageSchema } from './client';
import type { Address } from 'viem';

interface GameSchema extends MessageSchema {
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

## Using Typed Messages

```typescript
const client = createBetterNitroliteClient<GameSchema>({
  wallet,
  onAppMessage: async (type, sessionId, data) => {
    switch (type) {
      case 'question':
        // data.text and data.round are typed
        await client.sendMessage(sessionId, 'answer', {
          answer: '42',
          from: wallet.address,
          timestamp: Date.now()
        });
        break;
    }
  }
});

// Send with type checking
await client.sendMessage(sessionId, 'question', {
  text: 'What is the answer?',
  round: 1
});
```

## Next Steps

- **[Session Lifecycle](./session-lifecycle)**: Managing active sessions
- **[Ping-Pong Example](../patterns/ping-pong)**: Simple example
- **[Complete Game](../patterns/complete-game)**: Full implementation
