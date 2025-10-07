# @trivia-royale/game

Core Yellow SDK integration package for Trivia Royale. Wraps state channel operations with game-specific types and client logic.

## Overview

3 players compete in a trivia game where:
- Each player stakes 0.01 USDC
- Players answer questions as fast as possible
- Points awarded for correct answers and speed
- Prize pool splits 50/30/20 for top 3
- All state updates happen off-chain (no gas fees)
- Final settlement on-chain

## Features

- **TriviaClient** - High-level client wrapping Yellow SDK operations
- **Typed message schemas** - Type-safe application session messages
- **Balance helpers** - Utilities for 4-layer balance model (wallet/custody/channel/ledger)
- **Session management** - Auto-joining, state sync, lifecycle handling

## Usage

```typescript
import { TriviaClient, createTriviaWallet } from '@trivia-royale/game';

const wallet = await createTriviaWallet(mnemonic, 0);
const client = new TriviaClient(wallet);

await client.connect();
await client.depositToChannel('10.00'); // Deposit 10 USDC
```

## Key Components

### TriviaClient

Main client class for interacting with Yellow SDK:

```typescript
class TriviaClient {
  connect(): Promise<void>
  depositToChannel(amount: string): Promise<void>
  withdrawFromChannel(amount: string): Promise<void>
  getBalances(): Promise<Balances>
  createSession(params: SessionParams): Promise<string>
  sendMessage(sessionId: string, data: unknown): Promise<void>
  onMessage(handler: MessageHandler): void
}
```

### Message Schemas

Type-safe message types for application sessions:

```typescript
type GameMessage =
  | { type: 'join'; playerName: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'answer'; questionId: string; answer: string }
  | { type: 'results'; scores: PlayerScore[] }
  | { type: 'gameOver'; winners: Winner[] }
```

## Setup

```bash
bun install
```

Required environment variables:

```env
MNEMONIC=your twelve word mnemonic phrase goes here
```

## Architecture

Trivia Royale demonstrates Yellow SDK's core capabilities:

- **4-Layer Balance Model** - Wallet → Custody → Channel → Ledger
- **Application Sessions** - Isolated game instances with automatic fund distribution
- **Message Passing** - Typed, broadcast messaging between participants
- **Multi-party Coordination** - Server prepares sessions, clients sign and join

See the [full documentation](../../apps/docs) for detailed guides on each concept.
