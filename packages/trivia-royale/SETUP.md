# Setup Guide - Trivia Royale

Complete step-by-step guide to set up and run the Trivia Royale game with Yellow SDK on Polygon Amoy testnet.

## 📋 Prerequisites

Before you begin, make sure you have:

- **Bun.js** installed ([Download](https://bun.sh))
- **Git** installed
- A web browser with wallet extension (MetaMask, etc.) - optional
- ~30 minutes for full setup

## 🚀 Quick Start

```bash
# 1. Clone and navigate to monorepo
git clone <your-repo>
cd trivia-royale

# 2. Install dependencies (from monorepo root)
bun install

# 3. Navigate to game package
cd packages/trivia-royale

# 4. Run preparation script
bun run prepare

# 5. Fund wallets (see output for addresses)

# 6. Run game simulation
bun run game
```

**Or from monorepo root:**
```bash
# Run with bun filter
bun run --filter @trivia-royale/game game
bun run --filter @trivia-royale/game prepare
```

## 📖 Detailed Setup

### Step 1: Install Dependencies

```bash
# Install Bun if you haven't
curl -fsSL https://bun.sh/install | bash

# Navigate to the monorepo
cd trivia-royale

# Install all dependencies (installs for all packages)
bun install

# Navigate to the game package
cd packages/trivia-royale
```

**Dependencies installed:**
- `@erc7824/nitrolite` - Yellow SDK
- `viem` - Ethereum library
- TypeScript & types

### Step 2: Generate Test Wallets

Run the preparation script to generate 6 test wallets:

```bash
# From packages/trivia-royale
bun run prepare

# Or from monorepo root
bun run --filter @trivia-royale/game prepare
```

**This will:**
- Generate 6 random wallets (5 players + 1 AI host)
- Display addresses and private keys
- Check current balances
- Test ClearNode connectivity
- Show funding instructions

**Example output:**
```
🎮 TRIVIA ROYALE - Preparation Script

1️⃣  Generating Test Wallets...

Generated 6 wallets:

1. Alice
   Address:     0xe98D82761df695355583B35c7DCe32e2E84278D6
   Private Key: 0x1234...

2. Bob
   Address:     0xB696E751912f1bc16B993F232cE01e29003F8515
   Private Key: 0x5678...

...
```

**Save these private keys!** You'll need them for testing.

### Step 3: Fund Wallets with Testnet MATIC

You need Polygon Amoy testnet MATIC for gas fees.

#### Option A: Polygon Faucet (Recommended)

1. Visit [Polygon Faucet](https://faucet.polygon.technology/)
2. Select **Polygon Amoy**
3. Enter each wallet address from Step 2
4. Request tokens (~0.2 MATIC per wallet)

#### Option B: Alternative Faucets

- [Alchemy Polygon Faucet](https://mumbaifaucet.com/)
- [QuickNode Faucet](https://faucet.quicknode.com/polygon/amoy)

**How much do you need?**
- **Minimum**: 0.1 MATIC per wallet (6 wallets = 0.6 MATIC total)
- **Recommended**: 0.2 MATIC per wallet (6 wallets = 1.2 MATIC total)

**Why?**
- Channel creation: ~0.05 MATIC (one-time, on-chain)
- Channel closing: ~0.03 MATIC (one-time, on-chain)
- Buffer: ~0.02 MATIC for safety

### Step 4: Configure Environment (Optional)

If you want to reuse the same wallets, save them to `.env`:

```bash
# .env
PLAYER1_PRIVATE_KEY=0x...
PLAYER2_PRIVATE_KEY=0x...
PLAYER3_PRIVATE_KEY=0x...
PLAYER4_PRIVATE_KEY=0x...
PLAYER5_PRIVATE_KEY=0x...
AI_HOST_PRIVATE_KEY=0x...
```

### Step 5: Verify Setup

Run the preparation script again to verify:

```bash
# From packages/trivia-royale
bun run prepare

# Or from monorepo root
bun run --filter @trivia-royale/game prepare
```

You should see:
```
2️⃣  Checking MATIC Balances...

✅ Alice: 0.2 MATIC
✅ Bob: 0.2 MATIC
✅ Charlie: 0.2 MATIC
✅ Diana: 0.2 MATIC
✅ Eve: 0.2 MATIC
✅ AI Host: 0.2 MATIC

   Total: 1.2 MATIC
```

### Step 6: Run Game Simulation

Test the game logic without Yellow SDK:

```bash
# From packages/trivia-royale
bun run game

# Or from monorepo root
bun run --filter @trivia-royale/game game
```

This runs the full game simulation locally:
- 6 participants
- Commit-reveal protocol
- Timeout enforcement
- Winner determination
- Balance updates

**Expected output:**
```
🎮 TRIVIA ROYALE - Yellow SDK Demo

👥 Creating participants...
  Players:
    - Alice: 0x...
    - Bob: 0x...
    ...

============================================================
ROUND 1: What year was Bitcoin launched?
============================================================

📝 COMMIT PHASE (5 seconds)
  ✅ Alice: Committed in 1003ms
  ✅ Bob: Committed in 1805ms
  ...

🏆 WINNER DETERMINATION
  🎉 Winner: Alice (answered in 1003ms)

💸 Balance Update:
  💰 Alice: 2.5 USDC (+0.5)
  ...
```

## 🎮 Understanding the Architecture

### The Three "Channel" Concepts

**1. Developer Channel (apps.yellow.com)** - Optional
- Your app registration with Yellow
- Like creating an AWS account
- May not be required for testnet

**2. State Channel (On-chain)**
- Created via `NitroliteClient.createChannel()`
- Locks funds on blockchain
- **Costs gas** ⛽
- Created once per game

**3. Application Session (Off-chain)**
- Created via ClearNode
- Game messaging and coordination
- **Free!** 🆓
- Created within a state channel

### Complete Flow

```
SETUP (One-time):
  Register on apps.yellow.com (maybe optional?)
    ↓
GAME START:
  Create State Channel (on-chain, costs gas)
    ↓
  Connect to ClearNode (off-chain, free)
    ↓
  Create Application Session (off-chain, free)
    ↓
  Play Game - Questions, Answers, Updates (off-chain, free)
    ↓
  Close Session (off-chain, free)
    ↓
GAME END:
  Close Channel & Settle (on-chain, costs gas)
```

**Cost**: Only 2 on-chain transactions!

## 🔧 Configuration

### Network Configuration

The project is configured for **Polygon Amoy** testnet:

```typescript
// .env
CHAIN_ID=80002
NETWORK=polygon-amoy
RPC_URL=https://rpc-amoy.polygon.technology
CLEARNODE_URL=wss://testnet-clearnode.nitrolite.org
```

### Contract Addresses

Contract addresses will be:
- Auto-discovered by Yellow SDK, OR
- Set manually after looking them up

**To find contract addresses:**
1. Check Yellow SDK documentation
2. Look in `@erc7824/nitrolite` package deployments
3. Ask in Yellow Discord/Telegram

## 🧪 Testing Checklist

Before running with real Yellow SDK:

- [ ] Wallets generated
- [ ] All 6 wallets funded with MATIC
- [ ] ClearNode connection successful
- [ ] Game simulation runs
- [ ] Contract addresses confirmed
- [ ] (Optional) Registered on apps.yellow.com

## 🐛 Troubleshooting

### "Could not connect to ClearNode"

**Problem**: WebSocket connection failed

**Solutions**:
- Check your internet connection
- Verify ClearNode URL: `wss://testnet-clearnode.nitrolite.org`
- Try again in a few minutes (ClearNode might be down)

### "Insufficient funds for gas"

**Problem**: Wallets don't have enough MATIC

**Solutions**:
- Fund wallets from faucet (Step 3)
- Need at least 0.1 MATIC per wallet
- Wait a few minutes after requesting from faucet

### "Channel creation failed"

**Problem**: Can't create state channel

**Possible causes**:
- Contract addresses not set
- Insufficient gas
- Not enough token balance
- Missing server signature

**Solutions**:
- Verify contract addresses in `.env`
- Check wallet balances
- Review Yellow SDK documentation

### "Authentication failed"

**Problem**: Can't authenticate with ClearNode

**Solutions**:
- Verify wallet has valid private key
- Check network configuration (chain ID 80002)
- Try regenerating wallets

## 📚 Additional Resources

### Yellow Network
- [Yellow SDK Docs](https://erc7824.org)
- [Nitrolite GitHub](https://github.com/erc7824/nitrolite)
- [ERC-7824 Specification](https://erc7824.org/erc-7824)

### Polygon Amoy
- [Polygon Faucet](https://faucet.polygon.technology/)
- [Amoy Explorer](https://amoy.polygonscan.com/)
- [RPC Endpoint](https://rpc-amoy.polygon.technology)

### Community
- [Yellow Discord](https://discord.gg/yellownetwork)
- [Yellow Telegram](https://t.me/yellow_org)
- [Yellow Twitter](https://x.com/Yellow)

## 🎯 Next Steps

Once setup is complete:

1. **Test game simulation** - Verify all logic works
2. **Integrate Yellow SDK** - Connect to real ClearNode
3. **Create state channel** - First on-chain transaction
4. **Run full game** - End-to-end test with real state updates

## ❓ Need Help?

If you encounter issues:

1. Check this troubleshooting section
2. Review Yellow SDK documentation
3. Ask in Yellow community channels
4. Check GitHub issues

---

**Ready to play?** Run `bun run src/game.ts` and watch the magic happen! 🎮✨
