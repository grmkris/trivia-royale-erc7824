/**
 * Session Keypair Management
 *
 * Manages ephemeral session keypairs for ClearNode authentication.
 * Similar to Mivio's keyManager but adapted for Bun/Node.js (file-based storage).
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const KEYS_DIR = '.trivia-keys';
const SESSION_KEY_FILE = 'session-keypair.json';

export interface SessionKeypair {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Load existing session keypair or generate a new one
 */
export function loadOrGenerateSessionKeypair(): SessionKeypair {
  const keyPath = join(process.cwd(), KEYS_DIR, SESSION_KEY_FILE);

  // Try to load existing keypair
  if (existsSync(keyPath)) {
    console.log('  📂 Loading existing session keypair...');
    const saved = JSON.parse(readFileSync(keyPath, 'utf-8'));
    console.log(`  ✅ Session wallet: ${saved.address}`);
    return saved;
  }

  console.log('  🔑 Generating new session keypair...');

  // Generate new ephemeral keypair
  const privateKey = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const keypair: SessionKeypair = {
    privateKey,
    address: account.address,
  };

  // Save to file
  if (!existsSync(join(process.cwd(), KEYS_DIR))) {
    mkdirSync(join(process.cwd(), KEYS_DIR), { recursive: true });
  }
  writeFileSync(keyPath, JSON.stringify(keypair, null, 2));

  console.log(`  ✅ Session wallet created: ${keypair.address}`);
  console.log(`  💾 Saved to ${keyPath}`);

  return keypair;
}

/**
 * Create a wallet client from session keypair
 */
export function createSessionWalletClient(keypair: SessionKeypair) {
  const account = privateKeyToAccount(keypair.privateKey);

  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });
}
