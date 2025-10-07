# Trivia Royale Server

Hono-based game server for Trivia Royale, built with Bun.

## Quick Start

### Local Development
```bash
bun install
bun run dev
```

## Docker

### Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your mnemonic to `.env`:
   ```
   MNEMONIC=your twelve word mnemonic phrase here
   ```

### Build & Run

**Build the image:**
```bash
bun run docker:build
```

**Run:**
```bash
bun run docker:run
```

**View logs:**
```bash
bun run docker:logs
```

**Stop:**
```bash
bun run docker:stop
```

### Manual Docker Run

```bash
docker run -d \
  -p 3002:3002 \
  --env-file .env \
  -v ./data:/app/apps/server/data \
  --name trivia-royale-server \
  kristjangrm/trivia-royale-server:latest
```

### Push to Docker Hub

```bash
docker login
bun run docker:push
```

## Environment Variables

- `MNEMONIC` - Required. 12-word mnemonic phrase for server wallet generation.

## Endpoints

- `GET /health` - Health check
- `GET /server-address` - Get server wallet address
- `GET /server-balances` - Get server balances
- `POST /join-game` - Join game lobby
- `GET /lobby-state` - Get current lobby state
- `POST /submit-signature` - Submit session signature
- `GET /game-state` - Get current game state

## Data Persistence

Session keys are stored in `./data` directory. Mount this as a volume to persist across container restarts.
