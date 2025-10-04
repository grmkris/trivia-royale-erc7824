/**
 * Session Key Management
 *
 * Generate ephemeral session keypairs for ClearNode authentication.
 * Keys are generated fresh on each authentication and stored in memory.
 */

import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface SessionKeypair {
	privateKey: Hex;
	address: Hex;
}

/**
 * Generate ephemeral session keypair using Web Crypto API
 *
 * Browser-compatible (no Node crypto dependency).
 * Properly derives address from private key using viem.
 */
export function generateSessionKeypair(): SessionKeypair {
	// Generate 32 random bytes for private key
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);

	// Convert to hex string
	const privateKey = `0x${Array.from(array)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}` as Hex;

	// Derive address from private key using viem
	const account = privateKeyToAccount(privateKey);

	return {
		privateKey,
		address: account.address,
	};
}
