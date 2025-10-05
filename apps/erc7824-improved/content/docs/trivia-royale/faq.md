---
title: Frequently Asked Questions
description: Common questions about Yellow SDK state channels
---

# Frequently Asked Questions

Answers to questions that come up when building with Yellow SDK.

## Balances & Funds

### Why can my ledger balance be negative?

Your **ledger balance is a net position** - it tracks what you've sent vs. received across all off-chain activity.

- **Negative ledger** = you've sent more than received (you owe to the network)
- **Positive ledger** = you've received more than sent (network owes you)

Your **channel capacity backs your negative balance**. The limit is:
```typescript
// You cannot go more negative than your channel
Math.abs(ledger) <= channel
```

**Example**:
```typescript
{ channel: 10, ledger: 0 }    // Can send up to 10 USDC
await send(amount: 7);
{ channel: 10, ledger: -7 }   // ✓ Valid
await send(amount: 5);
{ channel: 10, ledger: -12 }  // ✗ FAILS - exceeds capacity
```

### What's the difference between `resize_amount` and `allocate_amount`?

They move funds between different layers:

**resize_amount**: Custody ↔ Channel (on-chain operation)
- `resize_amount: 5` → Add 5 from custody to channel
- `resize_amount: -5` → Remove 5 from channel to custody

**allocate_amount**: Channel ↔ Ledger (off-chain operation)
- `allocate_amount: 5` → Move 5 from channel to ledger
- `allocate_amount: -5` → Move 5 from ledger back to channel (deallocate)

**Rule of thumb**:
- Use `resize` when depositing or withdrawing (wallet involved)
- Use `allocate` when preparing ledger for off-chain payments

### How do I know my total available balance?

Sum three balances (exclud wallet):

```typescript
const balances = await client.getBalances();
const totalAvailable =
  balances.custodyContract +  // On-chain escrow
  balances.channel +          // Channel capacity
  balances.ledger;            // Off-chain balance

console.log(`Can withdraw: ${formatUSDC(totalAvailable)}`);
```

### Can I have funds in multiple layers at once?

Yes! This is common:

```typescript
{
  wallet: 50,          // Some USDC still in wallet
  custodyContract: 2,   // Leftover from previous resize
  channel: 10,         // Locked in channel
  ledger: -3           // Sent 3 USDC off-chain
}

// Total available for withdrawal: 2 + 10 + (-3) = 9 USDC
```

## Sessions

### How do I know if a session is closed?

Three ways:

**1. onSessionClosed callback** (only for closer):
```typescript
onSessionClosed: (sessionId, finalAllocations) => {
  console.log(`Session ${sessionId} closed`);
}
```

**2. Check active sessions**:
```typescript
const activeSessions = client.getActiveSessions();
if (!activeSessions.includes(sessionId)) {
  console.log('Session is closed');
}
```

**3. Send a final message**:
```typescript
// Server broadcasts game_over before closing
await server.closeSession(sessionId, allocations);
await server.sendMessage(sessionId, 'game_over', { allocations });

// Players handle as implicit close
onAppMessage: (type, sessionId, data) => {
  if (type === 'game_over') {
    cleanupSession(sessionId);
  }
}
```

### Can I have multiple active sessions?

Yes! You can participate in many sessions simultaneously:

```typescript
// Create or join multiple sessions
const game1 = await createSession(...);
const game2 = await createSession(...);
const game3 = await createSession(...);

const activeSessions = client.getActiveSessions();
// → ['0xgame1id', '0xgame2id', '0xgame3id']

// Messages are routed by sessionId
onAppMessage: (type, sessionId, data) => {
  if (sessionId === game1) { /* handle game 1 */ }
  if (sessionId === game2) { /* handle game 2 */ }
  // ...
}
```

Each session has its own allocations deducted from your ledger balance.

### What happens if I lose connection during a session?

**Short disconnection** (< few seconds):
- WebSocket reconnects automatically
- Session remains active
- You'll receive any missed messages
- Can continue playing

**Long disconnection**:
- Session may timeout (depends on application logic)
- Server might close session
- Funds are distributed according to last agreed state
- Reconnect and check `getActiveSessions()` to see if still active

### Why do signature order matter in `createSession`?

The signatures must be provided in a specific order for ClearNode verification:

```typescript
const signatures = [
  serverSignature,   // 1. Weight holder first (if server-controlled)
  player1Signature,  // 2. Then non-zero allocation participants
  player2Signature,  //    in the order they appear in allocations
];
```

TODO@kris: Verify technical reason for signature ordering (ClearNode validation algorithm)

## Messages

### Do I receive my own messages?

**Yes!** When you send a message, ClearNode broadcasts it to **all participants including you**:

```typescript
await client.sendMessage(sessionId, 'move', { x: 5, y: 3 });

// Your own handler is called
onAppMessage: (type, sessionId, data) => {
  if (type === 'move') {
    // This runs for your OWN message too!
    console.log(`Move: ${data.x}, ${data.y}`);
  }
}
```

**Best practice**: Filter your own messages when collecting responses:

```typescript
onAppMessage: (type, sessionId, data) => {
  if (type === 'answer') {
    // Only process answers from OTHER players
    if (data.from !== myAddress) {
      recordAnswer(data);
    }
  }
}
```

### Can messages arrive out of order?

**Per-sender**: Messages from a single sender arrive in order
**Cross-sender**: Messages from different senders may arrive in any order

**Solution**: Include timestamps to establish ordering:

```typescript
const correctAnswers = submissions
  .filter(a => a.answer === correctAnswer)
  .sort((a, b) => a.timestamp - b.timestamp);

const winner = correctAnswers[0]; // Earliest wins
```

### What's the maximum message size?

No hard limit in the protocol, but **keep messages small** for performance:

- ✓ Good: < 10 KB (simple game state)
- ⚠ Acceptable: 10-100 KB (complex state)
- ✗ Bad: > 100 KB (will be slow)

**Best practice**: Send deltas, not full state:

```typescript
// ✗ Bad: Send entire game state
await sendMessage(sessionId, 'update', { fullState: hugeObject });

// ✓ Good: Send only the change
await sendMessage(sessionId, 'move', { playerId, position });
```

## Errors & Edge Cases

### What if ClearNode goes offline?

**During active session**:
- WebSocket connection lost
- Client will attempt to reconnect (exponential backoff)
- Session state is preserved on ClearNode
- When reconnected, continue from where you left off

**Long-term outage**:
- You can challenge the channel on-chain
- Submit your latest signed state
- Force settlement after challenge period
- Recover funds based on last agreed state

### What enforces fund conservation?

The principle that `sum(all balance changes) === 0`:

TODO@kris: Verify if ClearNode validates fund conservation or if it's developer responsibility

**Current understanding**: Developers should verify fund conservation in their tests. ClearNode may validate allocations sum correctly, but explicit checks recommended.

### Can I cancel a session creation?

Once all signatures are collected and `createSession()` is called: **No, session is created**.

**Before creation**: Yes, just don't call `createSession()` with the signatures.

**After creation**: You must properly close the session with `closeSession()`.

### What happens if a player refuses to close a session?

If using a **server-controlled session** (weights: [0, 0, 100]):
- Server can close unilaterally
- Players don't need to sign

If using a **peer-to-peer session** (weights: [50, 50]):
- You can challenge the channel on-chain
- Submit latest signed state
- Force closure after challenge period

## Performance & Limits

### How many transactions per second can I do?

Off-chain operations (send, session messages): **Thousands per second**

On-chain operations (deposit, withdraw, resize): **Limited by blockchain** (~1-2 per block)

**Design pattern**: Do most activity off-chain, minimize on-chain operations.

### How long do operations take?

- **send()**: < 100ms (instant off-chain)
- **sendMessage()**: < 100ms (WebSocket roundtrip)
- **deposit()**: 3-60 seconds (wait for block confirmation)
- **withdraw()**: 3-60 seconds (on-chain transaction)
- **createSession()**: < 200ms (ClearNode processing)
- **closeSession()**: < 200ms (ClearNode processing)

## Next Steps

- **[Glossary](./glossary)**: Definitions of all terms
- **[Error Handling](./patterns/error-handling)**: How to handle failures
- **[Core Concepts](./core-concepts)**: Deep dive into architecture
