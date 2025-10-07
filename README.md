# Trivia Royale

A multiplayer trivia game built with Yellow SDK. Shows how to build applications with instant, gasless transactions using state channels.

Three players answer questions, fastest correct answers win. Prize pool splits 50/30/20. All transactions happen off-chain until the game ends and prizes get distributed.

**Use this as a guide** to understand Yellow protocol's core features - balance management, sessions, and message passing.

📄 **[SUMMARY.md](./SUMMARY.md)** - What Yellow SDK does and why Trivia Royale is the perfect demo
🚀 **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Step-by-step setup guide (5 minutes to running)

[Documentation](https://trivia-royale-erc7824-docs.vercel.app/docs) | [GitHub](https://github.com/grmkris/trivia-royale-erc7824) | [Docker Hub](https://hub.docker.com/r/kristjangrm/trivia-royale-server)

---

## Quick Start

```bash
# 1. Start ClearNode (Yellow's transaction processor)
docker-compose up -d

# 2. Start game server
bun run dev:server

# 3. Start web app
bun run dev:web
```

Open http://localhost:3000 (or visit [deployed docs](https://trivia-royale-erc7824-docs.vercel.app))

---

## What's Here

```
trivia-royale/
├── apps/server/          # Game API using Yellow SDK
├── apps/web/            # Next.js frontend
├── apps/docs/           # Full implementation guide
├── packages/trivia-royale/  # Yellow SDK integration
└── docker-compose.yml    # ClearNode infrastructure
```

**Server** - Hono API handling lobby, game logic, and Yellow SDK operations
**Web** - React frontend for playing
**Core Package** - Wraps Yellow SDK with game-specific types
**Docs** - Complete guides on balance model, sessions, messaging patterns

---

## Tech Stack

- [Yellow SDK](https://github.com/erc7824/nitrolite) - State channel framework (ERC-7824)
- Bun + TypeScript
- Hono (server), Next.js (web)
- Docker (ClearNode + Postgres)

---

## Documentation

Run the docs site locally:

```bash
bun run dev:docs
```

Visit https://trivia-royale-erc7824-docs.vercel.app/docs (or http://localhost:3000/docs locally) to learn:
- How the 4-layer balance system works
- Coordinating multi-party sessions
- Message passing patterns
- Fund management flows

---

## Deployment

Server is available as a Docker image:

```bash
docker pull kristjangrm/trivia-royale-server:latest
docker run -d -p 3002:3002 --env-file .env kristjangrm/trivia-royale-server
```

See `apps/server/README.md` for configuration.

---

## Setup

Full setup instructions in the [documentation](https://trivia-royale-erc7824-docs.vercel.app/docs), but quick version:

1. Install Bun: `curl -fsSL https://bun.sh/install | bash`
2. Copy `.env.example` to `.env` and configure:
   - Add your 12-word mnemonic phrase
   - Add your Infura or Alchemy RPC URL (get free API key at [infura.io](https://infura.io) or [alchemy.com](https://alchemy.com))
   - Update `BROKER_PRIVATE_KEY` to match index 1 from your mnemonic
3. Start ClearNode: `bun run clearnode:start`
4. Fund your wallet on Sepolia testnet
5. Run `bun install`

---

## Learn More

- [Yellow SDK Documentation](https://github.com/erc7824/nitrolite)
- [ERC-7824 Specification](https://erc7824.org)