/**
 * Game Utilities
 *
 * Shared helper functions for commitment protocol and game logic
 */

import { keccak256, encodePacked, type Hex, type Address } from 'viem';

// ==================== COMMITMENT PROTOCOL ====================

/**
 * Generate a cryptographically secure random secret
 */
export function generateSecret(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Create a commitment hash from answer, secret, and player address
 * Uses keccak256(abi.encodePacked(answer, secret, address))
 */
export function createCommitment(
  answer: string,
  secret: Hex,
  address: Address
): Hex {
  return keccak256(encodePacked(['string', 'bytes32', 'address'], [answer, secret, address]));
}

/**
 * Verify a commitment matches the revealed answer and secret
 */
export function verifyCommitment(
  answer: string,
  secret: Hex,
  address: Address,
  commitment: Hex
): boolean {
  const expected = createCommitment(answer, secret, address);
  return expected === commitment;
}

// ==================== TIMING ====================

/**
 * Async delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
