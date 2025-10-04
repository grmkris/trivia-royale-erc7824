/**
 * Get Channel With Broker Action
 *
 * Find an existing open channel between the wallet and broker via RPC.
 * Returns the channel ID if found, null otherwise.
 *
 * Adapted from: backend/utils/clearnode.ts:451
 */

import {
	createGetChannelsMessage,
	parseGetChannelsResponse,
	RPCMethod,
	RPCChannelStatus,
} from "@erc7824/nitrolite";
import type { WalletClient, Address, Hex } from "viem";
import { createMessageSigner } from "../../utils/messageSigner";
import { sendRPCRequest } from "../../utils/rpcHelper";

/**
 * Get existing channel with broker
 *
 * @param ws - Active WebSocket connection (must be authenticated)
 * @param wallet - Wallet client
 * @param brokerAddress - Broker address to find channel with
 * @returns Channel ID if found, null otherwise
 */
export async function getChannelWithBroker(
	ws: WebSocket,
	wallet: WalletClient,
	brokerAddress: Address,
): Promise<Hex | null> {
	const walletAddress = wallet.account?.address;
	if (!walletAddress) {
		throw new Error("No wallet address found");
	}

	const signer = createMessageSigner(wallet);

	// Send RPC request
	const response = await sendRPCRequest(
		ws,
		createGetChannelsMessage(signer, walletAddress, RPCChannelStatus.Open),
		RPCMethod.GetChannels,
		{
			timeout: 10000,
			errorHandler: (errorResponse) => {
				console.error("❌ Error getting channels:", errorResponse.params);
				throw new Error(
					`Failed to get channels: ${JSON.stringify(errorResponse.params)}`,
				);
			},
		},
	);

	// Parse response
	const parsedResponse = parseGetChannelsResponse(response);
	const channels = parsedResponse.params.channels || [];
	console.log(`📊 Found ${channels.length} open channel(s)`);

	if (channels.length > 0) {
		const channel = channels[0];
		if (channel.channelId) {
			console.log(`✅ Using channel ${channel.channelId.slice(0, 10)}...`);
			return channel.channelId as Hex;
		} else {
			console.error("❌ Channel missing channelId:", channel);
			return null;
		}
	} else {
		console.log("ℹ️ No open channels found");
		return null;
	}
}
