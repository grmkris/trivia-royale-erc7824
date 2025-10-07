---
title: Distributed Sessions
description: The prepare → sign → collect → create pattern for multi-party sessions
---

# Distributed Sessions

One of the most powerful (and initially confusing) patterns in Yellow SDK is **distributed session creation**. This allows multiple parties to collectively create a session without requiring a trusted central authority to hold signatures.

## The Problem

Traditional approaches require one party to:
1. Collect everyone's private keys OR
2. Act as a trusted intermediary OR
3. Collect signatures sequentially (slow!)

Yellow SDK solves this with a **distributed signing pattern** where:
- Each party signs independently (in parallel!)
- No party needs to trust the coordinator
- All signatures are verified by the ClearNode
- Only valid multi-party agreements succeed

## The Pattern

```
1. PREPARE   → Server creates unsigned request
2. SIGN      → All parties sign in parallel
3. COLLECT   → Server gathers all signatures
4. CREATE    → Server submits to ClearNode
```

This pattern enables **trustless coordination** - the server can't create a session without valid signatures from all participants.

## Step-by-Step Walkthrough

### Step 1: Prepare the Request

The session **initiator** (usually a game server) prepares the session request:

```typescript
const sessionRequest = serverClient.prepareSession({
  participants: [
    player1.address,
    player2.address,
    server.address
  ],
  allocations: [
    { participant: player1.address, asset: 'USDC', amount: '1.00' },
    { participant: player2.address, asset: 'USDC', amount: '1.00' },
    { participant: server.address, asset: 'USDC', amount: '0' },
  ],
});
```

This creates an **unsigned request object**:

```typescript
{
  req: [
    requestId,
    'create_app_session',
    [
      {
        definition: {
          protocol: 'NitroRPC/0.4',
          participants: [...],
          weights: [0, 0, 100],    // Server controlled
          quorum: 100,
          challenge: 0,
          nonce: 1696420800000
        },
        allocations: [...]
      }
    ],
    timestamp
  ],
  sig: []  // ← Empty! No signatures yet
}
```

**Key insight**: `prepareSession()` creates a deterministic request that everyone can independently verify and sign.

### Step 2: Distribute for Signing

In a real application, the server sends this request to all participants:

```typescript
// Via HTTP, WebSocket, or any communication channel
POST /api/game/sign-session
Body: {
  sessionRequest: sessionRequest,
  gameId: "game-123"
}
```

### Step 3: Each Participant Signs

Each participant receives the request and signs it **independently**:

```typescript
// Player 1's client
const signature1 = await player1Client.signSessionRequest(sessionRequest);
// Returns: "0xabc123..." (65-byte signature)

// Player 2's client
const signature2 = await player2Client.signSessionRequest(sessionRequest);
// Returns: "0xdef456..."

// Server also signs
const signatureServer = await serverClient.signSessionRequest(sessionRequest);
// Returns: "0x789xyz..."
```

**What's being signed**:
```typescript
// Each party signs the entire request object
const messageToSign = JSON.stringify(sessionRequest.req);
const signature = await wallet.signMessage(messageToSign);
```

**Important**: Everyone signs the **same data** (the `req` field), ensuring agreement on session parameters.

### Step 4: Collect Signatures

Participants return their signatures to the initiator:

```typescript
// Via HTTP response, WebSocket message, etc.
{
  signature: "0xabc123...",
  participant: "0xPlayer1Address"
}
```

The server collects all signatures:

```typescript
const signatures = [
  signatureServer,  // ← Server signature FIRST!
  signature1,       // ← Then players in allocation order
  signature2,
];
```

**Critical**: Signature order matters! The pattern is:
1. **Server signature first** (the weight holder)
2. **Then non-zero allocation participants** in the order they appear in allocations

### Step 5: Create the Session

With all signatures collected, the server creates the session:

```typescript
const sessionId = await serverClient.createSession(
  sessionRequest,
  [signatureServer as `0x${string}`, signature1 as `0x${string}`, signature2 as `0x${string}`]
);

console.log(`Session created: ${sessionId}`);
// → "0x0ac588b2924edbbbe34bb4c51d089771bd7bd7018136c8c4317624112a8c9f79"
```

The ClearNode:
1. Verifies all signatures match participants
2. Checks allocations don't exceed channel capacity
3. Creates the session and broadcasts to all participants
4. Returns the unique session ID

## Real-World Implementation

Here's how this looks in a complete game server:

```typescript
// ============================================
// SERVER: Game lobby endpoint
// ============================================
app.post('/api/game/:gameId/start', async (req, res) => {
  const game = await db.games.findById(req.params.gameId);
  const players = game.players; // Array of player addresses

  // 1. PREPARE
  const sessionRequest = serverClient.prepareSession({
    participants: [...players, serverAddress],
    allocations: players.map(p => ({
      participant: p.address,
      asset: 'USDC',
      amount: game.entryFee
    })).concat([
      { participant: serverAddress, asset: 'USDC', amount: '0' }
    ]),
  });

  // 2. DISTRIBUTE - Broadcast to all players via WebSocket
  players.forEach(player => {
    wsConnections.get(player.address).send({
      type: 'SESSION_SIGN_REQUEST',
      data: { sessionRequest, gameId: game.id }
    });
  });

  // 3. COLLECT - Wait for signatures (with timeout)
  const signatures = await collectSignatures(game.id, players.length, 30000);

  // 4. CREATE
  const sessionId = await serverClient.createSession(
    sessionRequest,
    [await serverClient.signSessionRequest(sessionRequest), ...signatures]
  );

  // Update game state
  await db.games.update(game.id, { sessionId, status: 'ACTIVE' });

  res.json({ sessionId });
});

// ============================================
// CLIENT: Player receives sign request
// ============================================
ws.on('message', async (msg) => {
  if (msg.type === 'SESSION_SIGN_REQUEST') {
    // Player reviews session terms (UI shows entry fee, players, etc.)
    const userConfirmed = await showSessionApprovalUI(msg.data.sessionRequest);

    if (userConfirmed) {
      // Sign the request
      const signature = await playerClient.signSessionRequest(msg.data.sessionRequest);

      // Send back to server
      ws.send({
        type: 'SESSION_SIGNATURE',
        data: {
          gameId: msg.data.gameId,
          signature,
          participant: playerAddress
        }
      });
    }
  }
});

// ============================================
// SERVER: Collect signatures helper
// ============================================
async function collectSignatures(gameId, expectedCount, timeoutMs) {
  return new Promise((resolve, reject) => {
    const signatures = [];
    const timeout = setTimeout(() => {
      reject(new Error('Signature collection timeout'));
    }, timeoutMs);

    wsServer.on('message', (msg) => {
      if (msg.type === 'SESSION_SIGNATURE' && msg.data.gameId === gameId) {
        signatures.push(msg.data.signature);

        if (signatures.length === expectedCount) {
          clearTimeout(timeout);
          resolve(signatures);
        }
      }
    });
  });
}
```

## Signature Order Rules

The **order of signatures in the array** matters because ClearNode verifies them against participant order:

### Rule 1: Weight Holder First
If you have a server-controlled session (weights: [0, 0, 100]), the server's signature **must be first**:

```typescript
const signatures = [
  serverSig,   // ← Must be first (has weight 100)
  player1Sig,  // ← Then players
  player2Sig,
];
```

### Rule 2: Non-Zero Allocations
Only participants with **non-zero allocations** need to sign (in the order they appear):

```typescript
allocations: [
  { participant: player1, asset: 'USDC', amount: '1.00' },   // ← Signs (position 0)
  { participant: player2, asset: 'USDC', amount: '1.00' },   // ← Signs (position 1)
  { participant: server, asset: 'USDC', amount: '0' },       // ← Signs if weight > 0
]

// If server has weight, order is:
signatures: [serverSig, player1Sig, player2Sig]

// If server has no weight (peer-to-peer), order is:
signatures: [player1Sig, player2Sig]
```

### Rule 3: Consistent Ordering
The order must match between:
- `participants` array
- `allocations` array
- `signatures` array (after weight holder)

## Handling Failures

### Timeout Collecting Signatures

```typescript
try {
  const signatures = await collectSignatures(gameId, playerCount, 30000);
} catch (error) {
  console.error('Failed to collect all signatures:', error);

  // Notify players game is cancelled
  notifyPlayers(gameId, 'SESSION_CANCELLED', {
    reason: 'Not all players signed in time'
  });

  // Clean up game state
  await db.games.update(gameId, { status: 'CANCELLED' });
}
```

### Invalid Signature

```typescript
try {
  const sessionId = await serverClient.createSession(request, signatures);
} catch (error) {
  // ClearNode rejected due to invalid signature
  if (error.message.includes('invalid signature')) {
    console.error('One or more signatures invalid');

    // Identify which signature failed (ClearNode doesn't tell you which)
    // May need to re-request signatures
  }
}
```

### Insufficient Channel Balance

```typescript
try {
  const sessionId = await serverClient.createSession(request, signatures);
} catch (error) {
  if (error.message.includes('insufficient balance')) {
    // One or more players doesn't have enough channel capacity
    console.error('Player has insufficient funds');

    // Notify the specific player to deposit more
    // Or reduce the entry fee and restart signing
  }
}
```

## Optimizing the Flow

### Parallel Signing

Since all participants sign the same request, signatures can happen **in parallel**:

```typescript
// ✗ Bad: Sequential (slow!)
const sig1 = await client1.signSessionRequest(request);
const sig2 = await client2.signSessionRequest(request);
const sig3 = await client3.signSessionRequest(request);

// ✓ Good: Parallel (fast!)
const [sig1, sig2, sig3] = await Promise.all([
  client1.signSessionRequest(request),
  client2.signSessionRequest(request),
  client3.signSessionRequest(request),
]);
```

### Pre-Approval

For games with known participants, you can prepare sessions in advance:

```typescript
// During matchmaking, prepare session
const sessionRequest = prepareSession({ ... });

// Players pre-sign while waiting
const preSignatures = await collectSignatures(...);

// When game starts, instantly create
const sessionId = await createSession(sessionRequest, preSignatures);
// → Nearly instant session creation!
```

## Security Considerations

### 1. Verify Request Before Signing

Clients should **always verify** what they're signing:

```typescript
async function signSessionRequest(request) {
  // Extract session parameters
  const { participants, allocations } = request.req[2][0];

  // Show user what they're agreeing to
  const userApproved = await showApprovalUI({
    participants,
    yourStake: allocations.find(a => a.participant === myAddress).amount,
    otherPlayers: participants.filter(p => p !== myAddress)
  });

  if (!userApproved) {
    throw new Error('User rejected session');
  }

  // Only sign after user confirmation
  return await client.signSessionRequest(request);
}
```

### 2. Validate Participant List

Ensure you're only playing with expected participants:

```typescript
// Check participants match expected players
const expectedPlayers = ['0xAlice', '0xBob', '0xCharlie'];
const actualPlayers = sessionRequest.req[2][0].definition.participants;

if (!expectedPlayers.every(p => actualPlayers.includes(p))) {
  throw new Error('Unexpected participants in session');
}
```

### 3. Verify Allocations

Check allocations match the agreed game rules:

```typescript
const myAllocation = allocations.find(a => a.participant === myAddress);

if (parseUSDC(myAllocation.amount) > myMaxStake) {
  throw new Error(`Stake ${myAllocation.amount} exceeds maximum ${myMaxStake}`);
}
```

## Common Patterns

### Pattern 1: Tournament Bracket

Create multiple sessions in sequence:

```typescript
// Round 1: 4 games
const round1Sessions = await Promise.all([
  createDistributedSession([player1, player2]),
  createDistributedSession([player3, player4]),
  createDistributedSession([player5, player6]),
  createDistributedSession([player7, player8]),
]);

// Determine winners...

// Round 2: 2 games
const round2Sessions = await Promise.all([
  createDistributedSession([winner1, winner2]),
  createDistributedSession([winner3, winner4]),
]);
```

### Pattern 2: Drop-In/Drop-Out

Allow players to join existing lobbies:

```typescript
// Start with 2 players
let sessionRequest = prepareSession([player1, player2]);

// Player 3 wants to join
sessionRequest = prepareSession([player1, player2, player3]);

// Collect ALL signatures again (previous ones are now invalid)
const signatures = await collectAll([player1, player2, player3]);

const sessionId = await createSession(sessionRequest, signatures);
```

### Pattern 3: Retry Logic

Handle signature collection failures gracefully:

```typescript
async function createSessionWithRetry(request, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const signatures = await collectSignatures(request, 30000);
      return await createSession(request, signatures);
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw new Error('Failed to create session after retries');
      }

      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}
```

## Implementation

See the distributed session pattern in action:
- [`prepareSession()`](https://github.com/grmkris/trivia-royale-erc7824/blob/main/packages/trivia-royale/src/client.ts#L700-L760) - Prepares unsigned session request
- [`signSessionRequest()`](https://github.com/grmkris/trivia-royale-erc7824/blob/main/packages/trivia-royale/src/client.ts#L762-L780) - Signs session request with participant key
- [`createSession()`](https://github.com/grmkris/trivia-royale-erc7824/blob/main/packages/trivia-royale/src/client.ts#L782-L820) - Submits signatures to ClearNode

## Next Steps

- **[Session Lifecycle](./session-lifecycle)**: Manage active sessions and cleanup
- **[Complete Game](../patterns/complete-game)**: See distributed sessions in a real multiplayer game
