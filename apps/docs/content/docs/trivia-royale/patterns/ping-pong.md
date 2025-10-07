---
title: Ping-Pong Session
description: Your first session with typed messages and event handlers
---

# Ping-Pong Session

This pattern demonstrates **sessions**, **typed messaging**, and **event handlers** - the building blocks of interactive applications.

## Complete Code

```typescript twoslash
import { createBetterNitroliteClient, MessageSchema } from '@trivia-royale/game';
import type { Wallet } from '@trivia-royale/game';
import type { Address, Hex } from 'viem';

interface PingPongSchema extends MessageSchema {
  ping: { data: { from: Address; timestamp: number } };
  pong: { data: { from: Address; replyTo: number } };
}

declare const wallets: {
  server: Wallet;
  player1: Wallet;
};
// ---cut---

async function pingPongExample() {
  const server = wallets.server;
  const player = wallets.player1;

  // Server tracks pong responses
  const pongResponses: Array<{ from: Address; latency: number }> = [];

  // Create clients with typed message handlers
  const serverClient = createBetterNitroliteClient<PingPongSchema>({
    wallet: server,
    onAppMessage: async (type, sessionId, data) => {
      if (type === 'pong') {
        // TypeScript knows: data is { from: Address; replyTo: number }
        const latency = Date.now() - data.replyTo;
        pongResponses.push({ from: data.from, latency });
        console.log(`📬 Received pong from ${data.from.slice(0, 10)} (${latency}ms)`);
      }
    }
  });

  const playerClient = createBetterNitroliteClient<PingPongSchema>({
    wallet: player,
    onAppMessage: async (type, sessionId, data) => {
      if (type === 'ping') {
        // TypeScript knows: data is { from: Address; timestamp: number }
        console.log(`📬 Received ping from ${data.from.slice(0, 10)}`);

        // Auto-respond with pong
        await playerClient.sendMessage(sessionId, 'pong', {
          from: player.address,
          replyTo: data.timestamp
        });
        console.log(`📤 Sent pong response`);
      }
    }
  });

  // Connect both clients
  await Promise.all([
    serverClient.connect(),
    playerClient.connect()
  ]);

  // Create session
  const request = serverClient.prepareSession({
    participants: [server.address, player.address],
    allocations: [
      { participant: server.address, asset: 'USDC', amount: '0' },
      { participant: player.address, asset: 'USDC', amount: '0' }
    ]
  });

  const [serverSig, playerSig] = await Promise.all([
    serverClient.signSessionRequest(request),
    playerClient.signSessionRequest(request)
  ]);

  const sessionId = await serverClient.createSession(request, [serverSig, playerSig]);
  console.log(`✅ Session created: ${sessionId}\n`);

  // Send ping
  console.log('📤 Server sending ping...');
  await serverClient.sendMessage(sessionId, 'ping', {
    from: server.address,
    timestamp: Date.now()
  });

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check results
  console.log(`\n📊 Results:`);
  console.log(`Pong responses: ${pongResponses.length}`);
  pongResponses.forEach(r => {
    console.log(`  - ${r.from.slice(0, 10)}: ${r.latency}ms`);
  });

  // Cleanup
  await serverClient.closeSession(sessionId, [
    { participant: server.address, asset: 'USDC', amount: '0' },
    { participant: player.address, asset: 'USDC', amount: '0' }
  ]);

  await serverClient.disconnect();
  await playerClient.disconnect();
}
```

## Key Concepts

### 1. Message Schema
Defines the structure of messages:
```typescript twoslash
import type { MessageSchema } from '@trivia-royale/game';
import type { Address } from 'viem';

interface PingPongSchema extends MessageSchema {
  ping: { data: { from: Address; timestamp: number } };
  pong: { data: { from: Address; replyTo: number } };
}
```

### 2. Event Handlers
Clients react to messages asynchronously with automatic type narrowing:
```typescript twoslash
import { createBetterNitroliteClient, MessageSchema } from '@trivia-royale/game';
import type { Address, Hex } from 'viem';

interface PingPongSchema extends MessageSchema {
  ping: { data: { from: Address; timestamp: number } };
  pong: { data: { from: Address; replyTo: number } };
}

declare const client: ReturnType<typeof createBetterNitroliteClient<PingPongSchema>>;
declare const sessionId: Hex;
declare const myAddress: Address;
// ---cut---

client.onAppMessage = async (type, sessionId, data) => {
  if (type === 'ping') {
    // data is automatically { from: Address; timestamp: number }
    await client.sendMessage(sessionId, 'pong', {
      from: myAddress,
      replyTo: data.timestamp
    });
  }
};
```

### 3. Broadcasting
Messages are broadcast to all participants:
```
Server sends 'ping' → ClearNode → Player receives
Player sends 'pong' → ClearNode → Server receives
```

### 4. Session Lifecycle
```
Create → Active → Exchange Messages → Close
```

## Next Steps

- **[Distributed Sessions](../building-blocks/distributed-sessions)**: Multi-party coordination
- **[Complete Game](./complete-game)**: Full multiplayer application
