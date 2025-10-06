/**
 * Simple Hono server for Trivia Royale
 *
 * Purpose: Expose server wallet address for testing send operations
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createBetterNitroliteClient,
  createWallet,
  createFileSystemKeyManager,
  parseUSDC,
  formatUSDC
} from '@trivia-royale/game';
import { mnemonicToAccount } from 'viem/accounts';
import { z } from 'zod';

// Create server wallet from mnemonic (index 2 = server wallet, same as loadWallets().server)
const envSchema = z.object({
  MNEMONIC: z.string(),
});
const env = envSchema.parse(Bun.env);

const account = mnemonicToAccount(env.MNEMONIC, { accountIndex: 2 });

// Use FileSystem key manager for persistent session keys across server restarts
const keyManager = createFileSystemKeyManager('./data');

// @ts-expect-error - account is a valid Account
const serverWallet = createWallet(account, keyManager);

// Create server client using factory pattern
const createServerClient = () => {
  return createBetterNitroliteClient({
    wallet: serverWallet,
    sessionAllowance: '0.1',
    onAppMessage: (type, sessionId, data) => {
      console.log('📬 Server received message:', type, data);
    }
  });
};

const serverClient = createServerClient();

// Connect to ClearNode on startup
console.log('🚀 Starting server...');
console.log(`📍 Server address: ${serverWallet.address}`);

await serverClient.connect()
  .then(() => console.log('✅ Connected to ClearNode'))
  .catch(err => console.error('❌ Failed to connect:', err));

// Check and initialize channel
const MIN_CHANNEL_BALANCE = parseUSDC('10'); // 10 USDC minimum
const balances = await serverClient.getBalances();

console.log('💰 Server balances:');
console.log(`  Wallet: ${formatUSDC(balances.wallet)} USDC`);
console.log(`  Custody: ${formatUSDC(balances.custodyContract)} USDC`);
console.log(`  Channel: ${formatUSDC(balances.channel)} USDC`);
console.log(`  Ledger: ${formatUSDC(balances.ledger)} USDC`);

if (balances.channel === 0n) {
  console.log(`📊 No channel found, creating with ${formatUSDC(MIN_CHANNEL_BALANCE)} USDC...`);
  await serverClient.deposit(MIN_CHANNEL_BALANCE);
  console.log('✅ Channel created');
} else if (balances.channel < MIN_CHANNEL_BALANCE) {
  throw new Error(
    `Insufficient channel balance: ${formatUSDC(balances.channel)} ` +
    `(need ${formatUSDC(MIN_CHANNEL_BALANCE)})`
  );
} else {
  console.log(`✅ Channel exists with ${formatUSDC(balances.channel)} USDC`);
}

// Create Hono app
const app = new Hono();

// Enable CORS for frontend
app.use('/*', cors({
  origin: 'https://localhost:3001', // Next.js dev server with HTTPS
  credentials: true,
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get server address (for testing sends)
app.get('/server-address', (c) => {
  return c.json({
    address: serverWallet.address,
    sessionAddress: serverWallet.sessionAddress
  });
});

// Get server balances
app.get('/server-balances', async (c) => {
  try {
    const balances = await serverClient.getBalances();
    return c.json({
      wallet: balances.wallet.toString(),
      custody: balances.custodyContract.toString(),
      channel: balances.channel.toString(),
      ledger: balances.ledger.toString()
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch balances' }, 500);
  }
});

console.log('🎮 Server running on http://localhost:3002');

export default {
  port: 3002,
  fetch: app.fetch
};
