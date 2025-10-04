/**
 * Nitrolite Client Factory
 *
 * Creates a client object that wraps all channel actions with injected dependencies.
 * This provides a clean API where callers don't need to pass ws, wallet, sessionPrivateKey repeatedly.
 *
 * Usage:
 *   const client = createNitroliteClient(ws, wallet, sessionPrivateKey);
 *   await client.createChannel("10");
 *   await client.getLedgerBalances();
 */

import type { WalletClient, Address, Hex } from "viem";
import { NITROLITE_CONFIG } from "./nitrolite-config";
import { createNitroliteClient as createSDKClient } from "./utils/nitroliteClient";

// Import all actions
import { getLedgerBalances } from "./actions/channels/getLedgerBalances";
import { getCustodyBalance } from "./actions/channels/getCustodyBalance";
import { getChannelBalance } from "./actions/channels/getChannelBalance";
import { getChannelData } from "./actions/channels/getChannelData";
import { getChannelWithBroker } from "./actions/channels/getChannelWithBroker";
import { createChannel } from "./actions/channels/createChannel";
import { resizeChannel } from "./actions/channels/resizeChannel";
import { closeChannel } from "./actions/channels/closeChannel";

/**
 * Create a Nitrolite client with injected dependencies
 *
 * @param ws - WebSocket connection to ClearNode
 * @param wallet - Wallet client
 * @param sessionPrivateKey - Session private key for state signing
 * @returns Client object with methods for all channel operations
 */
export function createNitroliteClient(
	ws: WebSocket,
	wallet: WalletClient,
	sessionPrivateKey: Hex,
) {
	// Create SDK NitroliteClient once (defaults to broker as counterparty)
	const sdkClient = createSDKClient(
		wallet,
		NITROLITE_CONFIG.contracts.brokerAddress,
		sessionPrivateKey,
	);

	return {
		// ==================== READ OPERATIONS ====================

		/**
		 * Get off-chain ledger balances from ClearNode
		 */
		getLedgerBalances: () => getLedgerBalances(ws, wallet),

		/**
		 * Get on-chain custody balance
		 * @param token - Token address (defaults to USDC from config)
		 */
		getCustodyBalance: (token: Address = NITROLITE_CONFIG.contracts.tokenAddress) =>
			getCustodyBalance(sdkClient, token),

		/**
		 * Get balance for a specific channel
		 * @param channelId - Channel ID
		 * @param token - Token address (defaults to USDC from config)
		 */
		getChannelBalance: (
			channelId: Hex,
			token: Address = NITROLITE_CONFIG.contracts.tokenAddress,
		) => getChannelBalance(sdkClient, channelId, token),

		/**
		 * Get full channel data (status, participants, version)
		 * @param channelId - Channel ID
		 */
		getChannelData: (channelId: Hex) => getChannelData(sdkClient, channelId),

		/**
		 * Find existing open channel with broker via RPC
		 * @param brokerAddress - Broker address (defaults to broker from config)
		 */
		getChannelWithBroker: (
			brokerAddress: Address = NITROLITE_CONFIG.contracts.brokerAddress,
		) => getChannelWithBroker(ws, wallet, brokerAddress),

		// ==================== WRITE OPERATIONS ====================

		/**
		 * Create a new channel with broker
		 * @param amount - Amount in USDC (e.g., "10")
		 * @param brokerAddress - Broker address (defaults to broker from config)
		 */
		createChannel: (
			amount: string,
			brokerAddress: Address = NITROLITE_CONFIG.contracts.brokerAddress,
		) =>
			createChannel(ws, sdkClient, wallet, {
				amount,
				brokerAddress,
				sessionPrivateKey,
			}),

		/**
		 * Add more funds to an existing channel
		 * @param channelId - Channel ID to resize
		 * @param additionalAmount - Amount to ADD in USDC (e.g., "5")
		 * @param brokerAddress - Broker address (defaults to broker from config)
		 */
		resizeChannel: (
			channelId: Hex,
			additionalAmount: string,
			brokerAddress: Address = NITROLITE_CONFIG.contracts.brokerAddress,
		) =>
			resizeChannel(ws, sdkClient, wallet, {
				channelId,
				additionalAmount,
				brokerAddress,
				sessionPrivateKey,
			}),

		/**
		 * Close a channel and return funds to custody
		 * @param channelId - Channel ID to close
		 * @param brokerAddress - Broker address (defaults to broker from config)
		 */
		closeChannel: (
			channelId: Hex,
			brokerAddress: Address = NITROLITE_CONFIG.contracts.brokerAddress,
		) =>
			closeChannel(ws, sdkClient, wallet, {
				channelId,
				brokerAddress,
				sessionPrivateKey,
			}),

		// ==================== UTILITIES ====================

		/**
		 * Close the WebSocket connection
		 */
		disconnect: () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		},
	};
}

/**
 * Type for the client object returned by createNitroliteClient
 */
export type NitroliteClient = ReturnType<typeof createNitroliteClient>;
