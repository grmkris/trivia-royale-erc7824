/**
 * Session Keypair Management
 *
 * Generates ephemeral session keypairs for ClearNode authentication.
 * Keys are not persisted - generated fresh on each authentication.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';

export interface SessionKeypair {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Generate ephemeral session keypair (not persisted)
 */
export function generateSessionKeypair(): SessionKeypair {
  const privateKey = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  return {
    privateKey,
    address: account.address,
  };
}
