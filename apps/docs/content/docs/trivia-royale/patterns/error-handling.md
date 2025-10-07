---
title: Error Handling
description: Common issues and how to handle them gracefully
---

# Error Handling

Building robust state channel applications requires handling various failure modes. This guide covers common errors and proven recovery strategies.

## Connection Errors

### WebSocket Disconnection

```typescript
const client = createBetterNitroliteClient({
  wallet,
  onAppMessage: (type, sessionId, data) => {
    // ... handle messages
  }
});

try {
  await client.connect();
} catch (error) {
  console.error('Connection failed:', error.message);

  // Retry with exponential backoff
  await retryWithBackoff(async () => await client.connect(), 3);
}

async function retryWithBackoff(fn: () => Promise<void>, maxRetries: number) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

## Fund Management Errors

### Insufficient Wallet Balance

```typescript
try {
  await client.deposit(parseUSDC('1000'));
} catch (error) {
  if (error.message.includes('Insufficient funds')) {
    // Show user their actual balance
    const balances = await client.getBalances();
    console.error(`You have ${formatUSDC(balances.wallet)}, need ${formatUSDC(parseUSDC('1000'))}`);

    // Suggest smaller amount
    const affordable = balances.wallet;
    console.log(`Try depositing ${formatUSDC(affordable)} instead`);
  }
}
```

### Insufficient Channel Capacity

```typescript
try {
  await client.send({ to: recipient, amount: parseUSDC('50') });
} catch (error) {
  const balances = await client.getBalances();
  const available = balances.channel + balances.ledger;

  console.error(`Insufficient capacity: ${formatUSDC(available)} available, ${formatUSDC(parseUSDC('50'))} requested`);
  console.log(`Deposit more funds or reduce payment amount`);
}
```

## Session Errors

### Signature Collection Timeout

```typescript
async function collectSignatures(sessionId: string, timeout: number = 30000) {
  return new Promise((resolve, reject) => {
    const signatures: string[] = [];
    const timer = setTimeout(() => {
      reject(new Error('Timeout collecting signatures'));
    }, timeout);

    // ... collect signatures ...

    if (signatures.length === expectedCount) {
      clearTimeout(timer);
      resolve(signatures);
    }
  });
}

try {
  const signatures = await collectSignatures(gameId, 30000);
} catch (error) {
  // Notify players
  notifyPlayers(gameId, {
    type: 'game_cancelled',
    reason: 'Not all players signed in time'
  });

  // Clean up
  await db.games.update(gameId, { status: 'CANCELLED' });
}
```

### Session Already Closed

```typescript
async function safeSendMessage(sessionId: Hex, type: string, data: any) {
  const activeSessions = client.getActiveSessions();

  if (!activeSessions.includes(sessionId)) {
    throw new Error(`Session ${sessionId} is not active`);
  }

  try {
    await client.sendMessage(sessionId, type, data);
  } catch (error) {
    if (error.message.includes('not active')) {
      // Session closed during send
      console.warn('Session closed, cleaning up');
      cleanupSession(sessionId);
    }
    throw error;
  }
}
```

## Message Handling Errors

### Invalid Message Data

```typescript
onAppMessage: async (type, sessionId, data) => {
  try {
    if (type === 'answer') {
      // Validate data structure
      if (!data.from || !data.answer) {
        console.error('Invalid answer format:', data);
        return; // Ignore malformed message
      }

      processAnswer(data);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    // Don't crash - log and continue
  }
}
```

## State Consistency Errors

### Balance Mismatch After Operation

```typescript
const balancesBefore = await client.getBalances();
const expectedChange = -parseUSDC('5');

await client.send({ to: recipient, amount: parseUSDC('5') });

// Wait for state to settle
await new Promise(r => setTimeout(r, 1000));

const balancesAfter = await client.getBalances();
const actualChange = balancesAfter.ledger - balancesBefore.ledger;

if (actualChange !== expectedChange) {
  console.error('Balance mismatch!');
  console.error(`Expected: ${formatUSDC(expectedChange)}, Actual: ${formatUSDC(actualChange)}`);

  // Re-query to get consistent state
  const freshBalances = await client.getBalances();
  console.log('Fresh balances:', freshBalances);
}
```

## Best Practices

### 1. Always Verify State After Operations

```typescript
// Before
const before = await client.getBalances();

// Operation
await client.deposit(amount);

// After (with delay)
await new Promise(r => setTimeout(r, 1000));
const after = await client.getBalances();

// Verify
const expectedIncrease = amount;
const actualIncrease = after.channel - before.channel;

if (actualIncrease !== expectedIncrease) {
  console.warn('Unexpected balance change');
}
```

### 2. Implement Timeouts Everywhere

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );

  return Promise.race([promise, timeout]);
}

// Usage
try {
  await withTimeout(client.connect(), 10000);
} catch (error) {
  console.error('Connection timeout');
}
```

### 3. Handle Partial Failures

```typescript
try {
  // Complex operation with multiple steps
  await client.deposit(parseUSDC('10'));      // Step 1
  await createSession(...);                    // Step 2
  await sendMessage(...);                      // Step 3
} catch (error) {
  // Check which step failed
  const balances = await client.getBalances();

  if (balances.channel > initialChannel) {
    console.log('Deposit succeeded, but session creation failed');
    // Decide: retry session creation or withdraw
  } else {
    console.log('Deposit failed');
    // Retry from beginning
  }
}
```

### 4. Graceful Degradation

```typescript
async function sendWithFallback(to: Address, amount: bigint) {
  try {
    // Try instant off-chain transfer
    await client.send({ to, amount });
  } catch (error) {
    console.warn('Off-chain transfer failed, falling back to on-chain');

    // Fallback to standard ERC-20 transfer
    const tx = await usdcContract.transfer(to, amount);
    await tx.wait();
  }
}
```

## Next Steps

- **[Fund Management](../building-blocks/fund-management)**: Understanding balance operations
- **[Session Lifecycle](../building-blocks/session-lifecycle)**: Managing session state
- **[Complete Game](./complete-game)**: See error handling in context
