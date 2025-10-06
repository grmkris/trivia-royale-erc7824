/**
 * Session Key Management
 *
 * Provides storage and retrieval of session keypairs for ClearNode authentication.
 * Session keys persist across app restarts, maintaining access to channels and sessions.
 */

import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import { randomBytes } from 'crypto';

export interface SessionKeypair {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Generate ephemeral session keypair (internal use only - use KeyManager instead)
 */
function generateSessionKeypair(): SessionKeypair {
  const privateKey = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  return {
    privateKey,
    address: account.address,
  };
}

/**
 * Interface for managing session keypairs
 * Fully encapsulated - handles generation internally
 */
export interface KeyManager {
  /**
   * Get session key for a wallet address
   * @returns Session keypair or undefined if no key exists
   */
  getSessionKey(walletAddress: Address): SessionKeypair | undefined;

  /**
   * Generate and store new session key for a wallet address
   * Overwrites existing key if present
   * @returns The newly generated keypair
   */
  generateSessionKey(walletAddress: Address): SessionKeypair;

  /**
   * Clear session key (for logout/reset)
   */
  clearSessionKey(walletAddress: Address): void;
}

/**
 * In-memory key manager (ephemeral, for tests/temporary use)
 */
export function createInMemoryKeyManager(): KeyManager {
  const keys = new Map<Address, SessionKeypair>();

  return {
    getSessionKey(walletAddress: Address): SessionKeypair | undefined {
      return keys.get(walletAddress);
    },

    generateSessionKey(walletAddress: Address): SessionKeypair {
      const keypair = generateSessionKeypair();
      keys.set(walletAddress, keypair);
      return keypair;
    },

    clearSessionKey(walletAddress: Address): void {
      keys.delete(walletAddress);
    },
  };
}

/**
 * LocalStorage key manager (browser persistence)
 */
export function createLocalStorageKeyManager(): KeyManager {
  const STORAGE_PREFIX = 'nitrolite:session-key:';

  return {
    getSessionKey(walletAddress: Address): SessionKeypair | undefined {
      const key = `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
      const stored = localStorage.getItem(key);

      if (!stored) return undefined;

      const privateKey = stored as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      return {
        privateKey,
        address: account.address
      };
    },

    generateSessionKey(walletAddress: Address): SessionKeypair {
      const keypair = generateSessionKeypair();
      const key = `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
      localStorage.setItem(key, keypair.privateKey);
      return keypair;
    },

    clearSessionKey(walletAddress: Address): void {
      const key = `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
      localStorage.removeItem(key);
    },
  };
}

/**
 * FileSystem key manager (Node.js server persistence)
 */
export function createFileSystemKeyManager(dataDir: string = '.'): KeyManager {
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
