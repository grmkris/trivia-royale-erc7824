/**
 * Get Channel Data Action
 *
 * Get full on-chain data for a specific channel, including:
 * - Channel status
 * - Participants
 * - Latest state version
 * - Channel parameters
 *
 * Adapted from: backend/status.ts:171
 */

import type { Address, Hex } from "viem";
import type { NitroliteClient } from "@erc7824/nitrolite";

export interface ChannelData {
	status: number; // 0=VOID, 1=INITIAL, 2=ACTIVE, 3=DISPUTE, 4=FINAL
	participants: Address[];
	version: bigint;
	challenge: bigint;
	adjudicator: Address;
}

/**
 * Get full channel data
 *
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param channelId - Channel ID
 * @returns Channel data
 */
export async function getChannelData(
	nitroliteClient: NitroliteClient,
	channelId: Hex,
): Promise<ChannelData> {
	// Get channel data from contract
	const data = await nitroliteClient.getChannelData(channelId);

	return {
		status: data.status,
		participants: data.channel.participants as Address[],
		version: data.lastValidState.version,
		challenge: data.channel.challenge,
		adjudicator: data.channel.adjudicator as Address,
	};
}
