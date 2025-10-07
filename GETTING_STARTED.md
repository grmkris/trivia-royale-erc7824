# Getting Started with Trivia Royale

This guide walks you through setting up and running the Trivia Royale demo, a multiplayer trivia game built with Yellow SDK that showcases instant, gasless transactions using state channels.

## Prerequisites

Before you begin, ensure you have:

- **Bun** (v1.2.21+): Install with `curl -fsSL https://bun.sh/install | bash`
- **Docker & Docker Compose**: For running the ClearNode broker
- **Ethereum Wallet**: A wallet with Sepolia testnet ETH and USDC
  - Get Sepolia ETH from [Alchemy faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
  - Get Sepolia USDC from [faucet](https://faucet.circle.com/)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/grmkris/trivia-royale-erc7824.git
cd trivia-royale-erc7824
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Required: Your 12-word mnemonic phrase
MNEMONIC=your twelve word mnemonic phrase goes here

# Required: Ethereum RPC URL
# Get free API key from https://infura.io or https://alchemy.com
ETHEREUM_SEPOLIA_BLOCKCHAIN_RPC=wss://sepolia.infura.io/ws/v3/YOUR_API_KEY

# Required: Broker private key (derived from mnemonic index 1)
# Generate this by running: bun run packages/trivia-royale/scripts/testWallets.ts
BROKER_PRIVATE_KEY=0x...
```

**Important**: The broker private key must be derived from index 1 of your mnemonic. The funding wallet (index 0) is separate.

## Running the Demo

### Option 1: Full Stack (Web UI + Server)

This runs the complete application with a web interface:

```bash
# Start ClearNode (Yellow's transaction processor)
bun run clearnode:start

# In a new terminal, start the game server
bun run dev:server

# In another terminal, start the web app
bun run dev:web
```

Open http://localhost:3000 to play the game in your browser.

### Option 2: Server Only (API + Tests)

Run the backend and test suite without the web UI:

```bash
# Start ClearNode
bun run clearnode:start

# Run the server
bun run dev:server

# In another terminal, run the test suite
cd packages/trivia-royale
bun test
```

### Option 3: Docker Deployment

Deploy the server using Docker:

```bash
# Build and run
docker run -d \
  -p 3002:3002 \
  --env-file .env \
  --name trivia-royale-server \
  kristjangrm/trivia-royale-server:latest
```

## How Authentication Works

Yellow SDK uses **session keys** separate from your main wallet:

1. **Main Wallet**: Holds your funds (ETH, USDC) on Sepolia
2. **Session Key**: Signs channel state transitions (generated automatically)
3. **Broker**: ClearNode validates signatures and coordinates updates

When you first connect, the SDK:
- Generates a session key (persisted to localStorage/filesystem)
- Authenticates with ClearNode
- Creates a payment channel for your wallet

This separation keeps your main wallet secure while allowing the application to sign channel updates automatically.

## Understanding the Demo

### What You'll See

1. **Lobby**: Players join and stake 0.01 USDC entry fee
2. **Trivia Rounds**: 3 questions, fastest correct answers win
3. **Prize Distribution**: 50/30/20 split to top 3 players
4. **Instant Updates**: All score changes happen off-chain (zero gas!)
5. **Final Settlement**: Prizes return to player wallets

### Behind the Scenes

When you play:
- Entry fees move to an application session (off-chain ledger)
- All questions/answers are WebSocket messages (no blockchain)
- Scores update instantly in the session
- Only the final prize distribution touches Ethereum

This demonstrates the core value of state channels: unlimited off-chain interactions for just two on-chain transactions.

## Next Steps

- **Read the Docs**: Full guides at https://trivia-royale-erc7824-docs.vercel.app
- **Explore the Code**:
  - [`packages/trivia-royale/src/client.ts`](https://github.com/grmkris/trivia-royale-erc7824/blob/main/packages/trivia-royale/src/client.ts) - Yellow SDK integration
  - [`apps/server/src/index.ts`](https://github.com/grmkris/trivia-royale-erc7824/blob/main/apps/server/src/index.ts) - Game server logic
- **Run Tests**: `cd packages/trivia-royale && bun test` to see all patterns

## Troubleshooting

**ClearNode won't start**: Ensure Docker is running and port 8000/4242 are available
**Authentication fails**: Check your mnemonic is correct and has Sepolia ETH
**Insufficient funds**: Ensure wallet (index 0) has both ETH (for gas) and USDC (for playing)
**Connection issues**: Verify ETHEREUM_SEPOLIA_BLOCKCHAIN_RPC is a valid WebSocket URL

For more detailed help, see the [FAQ](https://trivia-royale-erc7824-docs.vercel.app/docs/trivia-royale/faq) or open an issue on GitHub.
