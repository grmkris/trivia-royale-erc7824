---
title: Typed Messaging
description: Type-safe message schemas with TypeScript
---

# Typed Messaging

The Yellow SDK provides full TypeScript support with automatic type narrowing in message handlers. Define your message schema once, and get autocomplete and compile-time type checking everywhere.

## Defining Message Types

```typescript twoslash
import type { MessageSchema } from '@trivia-royale/game';
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

## Automatic Type Narrowing

When you implement `onAppMessage`, TypeScript automatically narrows the `data` type based on the `type` parameter:

```typescript twoslash
import { createBetterNitroliteClient, MessageSchema } from '@trivia-royale/game';
import type { Address, Hex } from 'viem';

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

declare const client: ReturnType<typeof createBetterNitroliteClient<GameSchema>>;
declare const sessionId: Hex;
declare const myAddress: Address;
// ---cut---

// TypeScript automatically narrows data based on type
client.onAppMessage = async (type, sessionId, data) => {
  if (type === 'question') {
    // data is automatically { text: string; round: number }
    console.log(`Round ${data.round}: ${data.text}`);

    await client.sendMessage(sessionId, 'answer', {
      answer: '42',
      from: myAddress,
      timestamp: Date.now()
    });
  }

  if (type === 'answer') {
    // data is automatically { answer: string; from: Address; timestamp: number }
    if (data.from !== myAddress) {
      console.log(`${data.from} answered: ${data.answer}`);
    }
  }

  if (type === 'result') {
    // data is automatically { winner: Address; round: number }
    console.log(`Winner of round ${data.round}: ${data.winner}`);
  }
};
```

## Type-Safe Message Sending

The `sendMessage` method is also fully typed. Your editor will autocomplete message types and validate data:

```typescript twoslash
import { createBetterNitroliteClient, MessageSchema } from '@trivia-royale/game';
import type { Address, Hex } from 'viem';

interface GameSchema extends MessageSchema {
  question: {
    data: { text: string; round: number };
  };
  answer: {
    data: { answer: string; from: Address; timestamp: number };
  };
}

declare const client: ReturnType<typeof createBetterNitroliteClient<GameSchema>>;
declare const sessionId: Hex;
declare const myAddress: Address;
// ---cut---

// TypeScript validates message type and data structure
await client.sendMessage(sessionId, 'question', {
  text: 'What is 2+2?',
  round: 1
});

await client.sendMessage(sessionId, 'answer', {
  answer: '4',
  from: myAddress,
  timestamp: Date.now()
});
```

## Next Steps

- **[Session Lifecycle](./session-lifecycle)**: Managing active sessions
- **[Ping-Pong Example](../patterns/ping-pong)**: Simple example
- **[Complete Game](../patterns/complete-game)**: Full implementation
