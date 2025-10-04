/**
 * Close Channel Action
 *
 * Close an existing channel and return funds to custody via ClearNode RPC.
 * Process:
 * 1. Send close request to ClearNode
 * 2. Wait for broker-signed close state
 * 3. Submit blockchain transaction
 * 4. Funds return to custody balance
 *
 * Adapted from: backend/utils/clearnode.ts:357
 */

import {
	createCloseChannelMessage,
	parseCloseChannelResponse,
	RPCMethod,
	type NitroliteClient,
} from "@erc7824/nitrolite";
import type { WalletClient, Address, Hex } from "viem";
import { createMessageSigner } from "../../utils/messageSigner";
import { sendRPCRequest } from "../../utils/rpcHelper";

/**
 * Close a channel
 *
 * @param ws - Active WebSocket connection (must be authenticated)
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param wallet - Wallet client
 * @param params.channelId - Channel ID to close
 * @param params.brokerAddress - Broker address
 * @param params.sessionPrivateKey - Session private key for state signing
 * @returns void (resolves when complete)
 */
export async function closeChannel(
	ws: WebSocket,
	nitroliteClient: NitroliteClient,
	wallet: WalletClient,
	params: {
		channelId: Hex;
		brokerAddress: Address;
		sessionPrivateKey: Hex;
	},
): Promise<void> {
	const walletAddress = wallet.account?.address;
	if (!walletAddress) {
		throw new Error("No wallet address found");
	}

	console.log(`🔒 Closing channel ${params.channelId.slice(0, 10)}...`);

	const signer = createMessageSigner(wallet);

	// Send RPC request
	const response = await sendRPCRequest(
		ws,
		createCloseChannelMessage(signer, params.channelId, walletAddress),
		RPCMethod.CloseChannel,
		{ timeout: 60000 },
	);

	// Parse response
	const parsedResponse = parseCloseChannelResponse(response);
	const { channelId: closedChannelId, state, serverSignature } =
		parsedResponse.params;

	if (!state || !serverSignature) {
		throw new Error("Incomplete close response");
	}

	// Submit close transaction
	const txHash = await nitroliteClient.closeChannel({
		finalState: {
			channelId: closedChannelId as Hex,
			intent: state.intent,
			version: BigInt(state.version),
			data: state.stateData as Hex,
			allocations: state.allocations,
			serverSignature,
		},
		stateData: state.stateData as Hex,
	});

	console.log(`📤 Close tx submitted: ${txHash.slice(0, 10)}...`);

	await nitroliteClient.publicClient.waitForTransactionReceipt({
		hash: txHash,
	});

	console.log("✅ Channel closed successfully");
}
