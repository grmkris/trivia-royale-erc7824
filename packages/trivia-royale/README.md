# Trivia Royale - Yellow SDK Demo

A multiplayer trivia game built with Yellow SDK (Nitrolite) showcasing instant, gasless state updates via state channels.

## 🎮 Game Concept

5 players compete in a trivia game where:
- Each player stakes 2 USDC
- AI host asks questions
- Players commit answers (hidden)
- All reveal simultaneously
- Fastest correct answer wins the round
- Instant balance updates (no gas fees!)
- Winner takes the pot after multiple rounds

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  5 Players + 1 AI Host              │
│  (6-party state channel)            │
└──────────┬──────────────────────────┘
           │
           ├─── Yellow SDK (NitroliteClient)
           │    - Channel creation
           │    - State updates
           │    - Settlement
           │
           └─── ClearNode (WebSocket)
                - Off-chain messaging
                - Commit-reveal coordination
```

## 📦 Tech Stack

- **Runtime**: Bun.js
- **Language**: TypeScript
- **Blockchain**: Base Sepolia Testnet
- **SDK**: `@erc7824/nitrolite` (Yellow SDK)
- **Crypto**: `viem`

## 🚀 Current Implementation

### What's Working

✅ **Functional Game Simulation** (`src/game.ts`)
- 6 participant wallets (5 players + AI host)
- Commit-reveal protocol for fairness
- 5-second timeout enforcement
- Deterministic winner calculation
- Balance tracking and updates
- Full game flow simulation

### Functional Components

```typescript
createPlayer(name)           // Create player with wallet
createAIHost()              // Create AI host with wallet
createCommitment()          // Hash answer + secret + address
verifyReveal()              // Verify reveal matches commitment
determineWinner()           // Deterministic winner selection
playRound()                 // Execute one trivia round
playGame()                  // Main game orchestrator
```

## 🏃 Run the Simulation

```bash
# Install dependencies
bun install

# Run the game simulation
bun run src/game.ts
```

**Output:**
```
🎮 TRIVIA ROYALE - Yellow SDK Demo

👥 Creating participants...
  Players:
    - Alice: 0x7F8...
    - Bob: 0x94D...
    ...

💰 Initial Balances:
  Alice: 2.0 USDC
  Bob: 2.0 USDC
  ...

============================================================
ROUND 1: What year was Bitcoin launched?
============================================================

📝 COMMIT PHASE (5 seconds)
  ✅ Alice: Committed in 1003ms
  ✅ Bob: Committed in 1805ms
  ...

🔓 REVEAL PHASE
  ✅ Alice: Revealed "2009"
  ✅ Bob: Revealed "2008"
  ...

🏆 WINNER DETERMINATION
  🎉 Winner: Alice (answered in 1003ms)

💸 Balance Update:
  💰 Alice: 2.5 USDC (+0.5)
  📉 Bob: 1.9 USDC (-0.1)
  ...
```

## 🔧 Configuration

### Base Sepolia Testnet

```typescript
const CONFIG = {
  chainId: 84532,
  rpcUrl: "https://sepolia.base.org",
  clearNodeUrl: "wss://testnet-clearnode.nitrolite.org",
};
```

### Environment Variables (`.env`)

```bash
CHAIN_ID=84532
NETWORK=base-sepolia
RPC_URL=https://sepolia.base.org
CLEARNODE_URL=wss://testnet-clearnode.nitrolite.org

# Contract addresses (to be updated)
CUSTODY_ADDRESS=0x...
ADJUDICATOR_ADDRESS=0x...
TOKEN_ADDRESS=0x...
```

## 📋 Next Steps

### Phase 1: Yellow SDK Integration

- [ ] Connect to ClearNode WebSocket
- [ ] Implement authentication flow
- [ ] Create 6-party channel on Base Sepolia
- [ ] Get server signature for channel creation

### Phase 2: Application Sessions

- [ ] Create application session for game
- [ ] Send commit messages via `createApplicationMessage`
- [ ] Coordinate reveal phase
- [ ] Update channel state after each round

### Phase 3: State Updates

- [ ] Implement state update signing (all 6 participants)
- [ ] Update allocations based on game results
- [ ] Handle state update confirmations

### Phase 4: Settlement

- [ ] Close application session
- [ ] Close channel with final allocations
- [ ] Withdrawal process

## 🎯 Yellow SDK Usage Pattern

Based on the SDK structure, here's the integration approach:

```typescript
import {
  NitroliteClient,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAppSessionMessage,
  createApplicationMessage,
  createCloseAppSessionMessage,
} from "@erc7824/nitrolite";

// 1. Create client for each participant
const client = new NitroliteClient({
  publicClient,
  walletClient,
  stateSigner,
  addresses: contractAddresses,
  chainId: 84532,
  challengeDuration: 86400n,
});

// 2. Connect to ClearNode (WebSocket)
const ws = new WebSocket("wss://testnet-clearnode.nitrolite.org");

// 3. Authenticate
const authRequest = await createAuthRequestMessage({...});
ws.send(authRequest);
// ... handle challenge ...
const authVerify = await createAuthVerifyMessage(signer, challenge);
ws.send(authVerify);

// 4. Create channel (requires server signature)
const { channelId } = await client.createChannel({
  channel: { participants, adjudicator, challenge, nonce },
  unsignedInitialState,
  serverSignature, // From ClearNode
});

// 5. Create application session
const sessionMsg = await createAppSessionMessage(signer, {
  appDefinition: {...},
  allocations: [...],
});
ws.send(sessionMsg);

// 6. Game messages
const questionMsg = await createApplicationMessage(
  aiSigner,
  sessionId,
  { type: "QUESTION", data: {...} }
);
ws.send(questionMsg);

// 7. Close session
const closeMsg = await createCloseAppSessionMessage(signer, {
  sessionId,
  finalAllocations,
});
ws.send(closeMsg);
```

## 📚 Key Learnings

### State Channels (ERC-7824)

1. **Channel Participants are Fixed**: Can't add players after creation
2. **All Must Sign**: Every state update needs all participants' signatures
3. **Off-chain = Free**: Unlimited state updates with zero gas
4. **On-chain Anchoring**: Only open/close touch the blockchain
5. **Deterministic Logic**: Winner calculation must be reproducible

### Commit-Reveal Protocol

1. **Commit Phase**: Players submit `hash(answer + secret + address)`
2. **Timeout Enforcement**: Server rejects late commits
3. **Reveal Phase**: Players reveal answer + secret
4. **Verification**: Check revealed data matches commitment
5. **Fairness**: Can't see others' answers before committing

### Multi-Party Coordination

1. **Server as Participant**: AI host is just another wallet in the channel
2. **Message Broadcasting**: ClearNode routes messages to all participants
3. **Signature Collection**: All 6 must sign each state update
4. **Deterministic Ordering**: Use server timestamps for consistency

## 🔗 Resources

- [Yellow SDK Docs](https://erc7824.org)
- [Nitrolite GitHub](https://github.com/erc7824/nitrolite)
- [ERC-7824 Specification](https://erc7824.org/erc-7824)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

## 📝 Project Structure

```
trivia-royale/
├── src/
│   └── game.ts              # Main game simulation
├── .env                     # Configuration
├── package.json
├── tsconfig.json
├── bun.lock
├── readme.md               # Original challenge
└── PROJECT_README.md       # This file
```

## 🧪 Testing Checklist

- [x] Wallet generation
- [x] Commit-reveal protocol
- [x] Timeout enforcement
- [x] Winner determination (deterministic)
- [x] Balance updates
- [ ] Yellow SDK channel creation
- [ ] ClearNode WebSocket connection
- [ ] Application session creation
- [ ] State updates with signatures
- [ ] Channel closing and settlement

## 🎬 Demo Script

> "Traditional blockchain games are slow and expensive. Every action costs gas.
>
> With Yellow Network's state channels, we built a trivia game where 5 players can compete, answer questions, and settle scores in real-time - all for the cost of 2 transactions total.
>
> Watch as players commit their answers cryptographically, reveal simultaneously, and balances update instantly with zero gas fees.
>
> This is the future of blockchain gaming: instant, fair, and affordable."

---

**Status**: ✅ Simulation Complete | ⏳ Yellow SDK Integration In Progress

Built with 💛 for the Yellow Network DevRel Challenge
