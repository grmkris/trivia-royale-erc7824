/**
 * Simple Hono server for Trivia Royale
 *
 * Purpose: Expose server wallet address for testing send operations
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createBetterNitroliteClient, createWallet } from '@trivia-royale/game';
import { mnemonicToAccount } from 'viem/accounts';

// Create server wallet from mnemonic (index 2)
const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error('MNEMONIC is required in .env');
}

const account = mnemonicToAccount(mnemonic, { accountIndex: 2 });
const serverWallet = createWallet(account.privateKey);

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
