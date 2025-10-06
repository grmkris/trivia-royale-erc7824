---
title: Glossary
description: Key terms and concepts in Yellow SDK state channels
---

# Glossary

Quick reference for terms used throughout the Trivia Royale Guide.

## Balance & Funds

### Wallet Balance
Your standard ERC-20 token balance in your Ethereum address. Fully under your control, requires gas for transactions. Starting point for all deposits.

### Custody Contract
The Yellow smart contract that escrows funds. Acts as an intermediate layer between your wallet and state channels. Provides on-chain security for off-chain operations.

### Channel
A bilateral state channel between you and the Yellow broker (ClearNode). Holds locked funds that provide **capacity** for off-chain operations. Channel balance can be allocated to ledger or resized on-chain.

### Channel Capacity
The total amount of funds locked in your channel. Determines:
- How much you can send (ledger can go negative up to channel amount)
- How much you can receive (no limit)
- Your maximum off-chain payment size

### Ledger Balance
Your **net position** in off-chain transactions, tracked by the ClearNode. Can be:
- **Positive**: You've received more than you've sent
- **Negative**: You've sent more than you've received (limited by channel capacity)
- Changes instantly without gas fees

## Network Components

### ClearNode
The message broker and state validator in the Yellow network. Functions:
- Routes messages between participants
- Tracks ledger balances
- Validates state transitions
- Broadcasts to session participants
- Sometimes called "broker" in documentation

### Broker
Another name for ClearNode. The facilitator of off-chain communication and state management.

## Sessions

### Application Session (Session)
An isolated instance of your game, contract, or application running off-chain. Has:
- Specific participants
- Entry allocations (stakes)
- Message schema
- Lifecycle (create → active → close)

### Session ID
Unique identifier for an application session (hex string). Used to:
- Send messages to the session
- Track active sessions
- Close the session

### Participants
Ethereum addresses that can interact in a session. Order matters for:
- Signature collection
- Allocation mapping
- Prize distribution

### Allocations
Amount each participant commits when joining a session. Represents:
- Entry fees for games
- Stakes for contracts
- Collateral for agreements
- Can be zero for observers/facilitators

### Session Allowance
Maximum amount you're willing to commit to any single session. Set when creating client:
```typescript
createBetterNitroliteClient({
  sessionAllowance: '0.01'  // Max 0.01 USDC per session
});
```

### Weights & Quorum
Control who can make decisions in a session:
- **Weights**: Voting power for each participant (must sum to quorum)
- **Quorum**: Percentage needed to make decisions (usually 100)
- **Example**: `weights: [0, 0, 100], quorum: 100` = server has full control

## Operations

### Deposit
Move funds from **wallet → custody → channel**. Creates channel if it doesn't exist, or resizes existing channel.

### Withdraw
Move funds from **ledger → channel → custody → wallet**. May involve multiple steps:
1. Deallocate ledger → channel
2. Resize channel → custody
3. Withdraw custody → wallet

### Resize
On-chain operation to adjust channel capacity:
- **resize_amount > 0**: Add funds (custody → channel)
- **resize_amount < 0**: Remove funds (channel → custody)

### Allocate
Off-chain operation to move funds between channel and ledger:
- **allocate_amount > 0**: Channel → ledger
- **allocate_amount < 0**: Ledger → channel (deallocate)

### Send
Transfer value to another participant via ledger balances. Instant and gasless. Decreases your ledger (can go negative), increases recipient's ledger.

## Cryptography & Validation

### Nonce
Unique identifier to prevent replay attacks. Usually `Date.now()` or incrementing counter. Used in:
- Session creation
- State updates

### Signature
Cryptographic proof that a participant approved a message or state. Created by signing with private key, verified with public key (address).

### Proof States
The current on-chain channel state used to prove the validity of resize operations. Retrieved via `client.getChannelData(channelId)` - only the latest state is required. The session key must remain consistent across operations.

## State Channel Concepts

### State
Snapshot of channel or session at a specific point in time. Includes:
- Version number (increments with each update)
- Allocations
- Application-specific data
- Signatures

### State Intent
Purpose of a state update:
- `RESIZE`: Changing channel capacity
- `CLOSE`: Finalizing and closing
- `UPDATE`: General state update

### Fund Conservation
**Golden rule**: The sum of all balance changes must equal zero. Value cannot be created or destroyed, only transferred between participants.

## Message Types

### System Messages
Protocol-level messages for channel management:
- `auth_request`, `auth_challenge`, `auth_verify`
- `get_channels`, `get_balances`
- `resize_channel`, `close_channel`

### Application Messages
Your custom message types defined in MessageSchema:
- `question`, `answer`, `result` (trivia game)
- `move`, `game_over` (chess)
- Any types you define!

### Message Schema
TypeScript interface defining your application's message types and payloads. Enables type-safe messaging with autocomplete.

## Client Types

### BetterNitroliteClient
High-level abstraction providing:
- Simplified balance management
- Typed message handling
- Automatic session tracking
- Event-driven architecture

### NitroliteClient
Lower-level SDK providing direct access to:
- Channel operations
- State management
- On-chain transactions

## Next Steps

- [Core Concepts](/docs/trivia-royale/core-concepts): Deep dive into fundamentals
- [Building Blocks](/docs/trivia-royale/building-blocks): Practical patterns
- [FAQ](./faq): Common questions answered
