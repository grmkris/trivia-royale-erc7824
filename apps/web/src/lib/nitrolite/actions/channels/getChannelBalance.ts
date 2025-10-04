/**
 * Get Channel Balance Action
 *
 * Get on-chain balance for a specific channel.
 * This shows how much of a specific token is allocated to the wallet
 * within the channel's current state.
 *
 * Adapted from: backend/status.ts:172
 */

import type { Address, Hex } from "viem";
import type { NitroliteClient } from "@erc7824/nitrolite";

/**
 * Get channel balance for a wallet
 *
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param channelId - Channel ID
 * @param token - Token address (e.g., USDC)
 * @returns Balance in token's smallest unit
 */
export async function getChannelBalance(
	nitroliteClient: NitroliteClient,
	channelId: Hex,
	token: Address,
): Promise<bigint> {
	// Get channel balance
	const balance = await nitroliteClient.getChannelBalance(channelId, token);

	return balance;
}
