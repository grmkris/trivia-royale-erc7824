/**
 * FileSystem Key Manager (Node.js only)
 *
 * Provides filesystem-based session key persistence for Node.js environments.
 * DO NOT import this module in browser/React environments - use './key-manager' instead.
 */

import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import type { SessionKeyManager, SessionKeypair } from './key-manager';
import { generateSessionKeypair } from './key-manager';

/**
 * FileSystem key manager (Node.js server persistence)
 *
 * @param dataDir - Directory to store session key files (default: current directory)
 * @returns KeyManager instance that persists keys to disk
 */
export function createFileSystemKeyManager(dataDir: string = '.'): SessionKeyManager {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const getFilePath = (address: Address): string =>
    `${dataDir}/session-key-${address.toLowerCase()}.json`;

  return {
    getSessionKey(walletAddress: Address): SessionKeypair | undefined {
      const filePath = getFilePath(walletAddress);

      if (!fs.existsSync(filePath)) return undefined;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const account = privateKeyToAccount(data.privateKey as `0x${string}`);
      return {
        privateKey: data.privateKey as `0x${string}`,
        address: account.address
      };
    },

    generateSessionKey(walletAddress: Address): SessionKeypair {
      const keypair = generateSessionKeypair();
      const filePath = getFilePath(walletAddress);

      fs.writeFileSync(filePath, JSON.stringify({
        privateKey: keypair.privateKey,
        address: keypair.address,
      }, null, 2), 'utf8');

      return keypair;
    },

    clearSessionKey(walletAddress: Address): void {
      const filePath = getFilePath(walletAddress);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    },
  };
}
