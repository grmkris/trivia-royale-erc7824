/**
 * Session Key Management
 *
 * Provides storage and retrieval of session keypairs for ClearNode authentication.
 * Session keys persist across app restarts, maintaining access to channels and sessions.
 *
 * This module is browser-compatible. For Node.js filesystem persistence,
 * import from './key-manager-fs' instead.
 */

import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface SessionKeypair {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Generate ephemeral session keypair (internal use only - use KeyManager instead)
 * Uses Web Crypto API (browser-compatible)
 */
export function generateSessionKeypair(): SessionKeypair {
  // Use Web Crypto API (works in browser and Node.js 15+)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const privateKey = `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
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
export interface SessionKeyManager {
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
export function createInMemoryKeyManager(): SessionKeyManager {
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
export function createLocalStorageKeyManager(): SessionKeyManager {
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

