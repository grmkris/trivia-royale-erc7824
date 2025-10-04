/**
 * Get Custody Balance Action
 *
 * Get on-chain balance deposited in the custody contract.
 * This is the total amount of funds the user has deposited to the custody contract,
 * available for creating/resizing channels.
 *
 * Adapted from: backend/status.ts:158
 */

import type { Address } from "viem";
import type { NitroliteClient } from "@erc7824/nitrolite";

/**
 * Get custody balance for a wallet
 *
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param token - Token address (e.g., USDC)
 * @returns Balance in token's smallest unit (e.g., USDC has 6 decimals)
 */
export async function getCustodyBalance(
	nitroliteClient: NitroliteClient,
	token: Address,
): Promise<bigint> {
	// Get custody balance
	const balance = await nitroliteClient.getAccountBalance(token);

	return balance;
}
