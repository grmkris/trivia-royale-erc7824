---
title: Simple Payment
description: The simplest Yellow SDK application - deposit, send, withdraw
---

# Simple Payment

This is the **absolute simplest** Yellow SDK application. No sessions, no complex messaging - just peer-to-peer value transfer using ledger balances.

## Complete Code

```typescript
import { createBetterNitroliteClient } from './client';
import { parseUSDC, formatUSDC } from './core/erc20';
import { loadWallets } from './core/wallets';

async function simplePaymentExample() {
  const wallets = loadWallets();
  const alice = wallets.alice;
  const bob = wallets.bob;

  // Create clients for both parties
  const aliceClient = createBetterNitroliteClient({ wallet: alice });
  const bobClient = createBetterNitroliteClient({ wallet: bob });

  // Step 1: Connect to ClearNode
  console.log('📡 Connecting to ClearNode...');
  await Promise.all([
    aliceClient.connect(),
    bobClient.connect()
  ]);

  // Step 2: Check initial balances
  console.log('\n💰 Initial Balances');
  let aliceBalances = await aliceClient.getBalances();
  let bobBalances = await bobClient.getBalances();

  console.log('Alice:', {
    wallet: formatUSDC(aliceBalances.wallet),
    channel: formatUSDC(aliceBalances.channel),
    ledger: formatUSDC(aliceBalances.ledger)
  });

  console.log('Bob:', {
    wallet: formatUSDC(bobBalances.wallet),
    channel: formatUSDC(bobBalances.channel),
    ledger: formatUSDC(bobBalances.ledger)
  });

  // Step 3: Alice deposits 10 USDC (if needed)
  if (aliceBalances.channel === 0n) {
    console.log('\n💸 Alice depositing 10 USDC...');
    await aliceClient.deposit(parseUSDC('10'));

    aliceBalances = await aliceClient.getBalances();
    console.log('Alice channel balance:', formatUSDC(aliceBalances.channel));
  }

  // Step 4: Alice sends 3 USDC to Bob
  console.log('\n📤 Alice sending 3 USDC to Bob...');
  await aliceClient.send({
    to: bob.address,
    amount: parseUSDC('3')
  });

  // Step 5: Check balances after payment
  console.log('\n💰 After Payment');
  aliceBalances = await aliceClient.getBalances();
  bobBalances = await bobClient.getBalances();

  console.log('Alice ledger:', formatUSDC(aliceBalances.ledger));
  console.log('Bob ledger:', formatUSDC(bobBalances.ledger));

  // Step 6: Bob withdraws his earnings
  console.log('\n💰 Bob withdrawing 3 USDC...');
  await bobClient.withdraw(parseUSDC('3'));

  bobBalances = await bobClient.getBalances();
  console.log('Bob wallet:', formatUSDC(bobBalances.wallet));

  // Cleanup
  await aliceClient.disconnect();
  await bobClient.disconnect();

  console.log('\n✅ Complete!');
}

simplePaymentExample();
```

## What's Happening

### Step 1: Connect
Both parties connect to the ClearNode:
- WebSocket connection established
- Authentication completed
- Channels queried

### Step 2: Initial State
```
Alice: { wallet: 100, channel: 0, ledger: 0 }
Bob:   { wallet: 50, channel: 0, ledger: 0 }
```

### Step 3: Deposit
Alice moves funds from wallet → channel:
```
Alice: { wallet: 90, channel: 10, ledger: 0 }
```

### Step 4: Send
Alice transfers 3 USDC to Bob via ledger:
```
Alice: { wallet: 90, channel: 10, ledger: -3 }  ← negative!
Bob:   { wallet: 50, channel: 0, ledger: 3 }    ← positive!
```

Alice's ledger is negative because she **sent** value. Bob's is positive because he **received** value.

### Step 5: Withdraw
Bob converts his ledger balance back to wallet:
```
Bob: { wallet: 53, channel: 0, ledger: 0 }
```

## Key Insights

### 1. Ledger is Net Balance
Ledger balances represent your **net position**:
- Sending decreases ledger (can go negative)
- Receiving increases ledger (can go positive)
- Your channel capacity backs negative balances

### 2. Instant & Gasless
The `send()` operation:
- Completes in milliseconds
- Costs zero gas
- Updates off-chain state only

### 3. Channel Required for Sending
Alice needs a channel to send. Bob doesn't need one to receive:
```typescript
// ✓ Works: Alice has channel
await aliceClient.send({ to: bob.address, amount });

// ✗ Fails: Bob has no channel
await bobClient.send({ to: alice.address, amount });
// Error: No channel exists
```

### 4. Automatic Balance Settlement
When Bob withdraws, the system automatically:
1. Settles ledger balances with Alice's channel
2. Transfers value through the custody contract
3. Returns funds to Bob's wallet

## Variations

### Variation 1: Bidirectional Payment

Both parties can send if both have channels:

```typescript
// Both deposit
await aliceClient.deposit(parseUSDC('10'));
await bobClient.deposit(parseUSDC('10'));

// Alice sends 3 to Bob
await aliceClient.send({ to: bob.address, amount: parseUSDC('3') });
// Alice ledger: -3, Bob ledger: +3

// Bob sends 1 back to Alice
await bobClient.send({ to: alice.address, amount: parseUSDC('1') });
// Alice ledger: -2, Bob ledger: +2

// Net position: Alice sent 2 USDC to Bob
```

### Variation 2: Multiple Payments

Ledger balances accumulate:

```typescript
await client.send({ to: recipient, amount: parseUSDC('1') });
// Ledger: -1

await client.send({ to: recipient, amount: parseUSDC('2') });
// Ledger: -3

await client.send({ to: recipient, amount: parseUSDC('0.5') });
// Ledger: -3.5
```

### Variation 3: Check Balance Before Sending

Prevent errors by checking capacity:

```typescript
const balances = await client.getBalances();
const available = balances.channel + balances.ledger;

const amount = parseUSDC('5');

if (Math.abs(Number(balances.ledger - amount)) > Number(balances.channel)) {
  console.error('Insufficient channel capacity');
} else {
  await client.send({ to: recipient, amount });
}
```

## Next Steps

- **[Ping-Pong](./ping-pong)**: Add sessions and messaging
- **[Fund Management](../building-blocks/fund-management)**: Deep dive into balance operations
- **[Complete Game](./complete-game)**: Full multiplayer application
