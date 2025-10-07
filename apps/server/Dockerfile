# Build stage
FROM oven/bun:1.2.21-slim AS builder

WORKDIR /app

# Copy root package files
COPY package.json bun.lock ./
COPY turbo.json ./

# Copy workspace packages
COPY packages/trivia-royale ./packages/trivia-royale

# Copy server app
COPY apps/server ./apps/server

# Remove prepare script temporarily to avoid build issues
RUN cd packages/trivia-royale && \
    cat package.json | bun -e "const pkg=await Bun.stdin.json();delete pkg.scripts.prepare;console.log(JSON.stringify(pkg,null,2))" > package.json.tmp && \
    mv package.json.tmp package.json

# Install dependencies
RUN bun install

# Remove workspace node_modules symlinks (all deps are in root)
RUN rm -rf /app/apps/server/node_modules /app/packages/trivia-royale/node_modules

# Production stage
FROM oven/bun:1.2.21-slim

WORKDIR /app

# Copy everything from builder (dependencies + source)
COPY --from=builder /app ./

# Create data directory for session keys
RUN mkdir -p /app/apps/server/data

# Stay in root directory for proper module resolution
WORKDIR /app

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Run the server directly (Bun can run TS files from root)
CMD ["bun", "apps/server/src/index.ts"]
