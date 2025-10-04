/**
 * Create Channel Action
 *
 * Create a new channel with broker via ClearNode RPC.
 * This is the most complex action as it involves:
 * 1. Approving token allowance
 * 2. Sending RPC request to ClearNode
 * 3. Waiting for broker-signed state
 * 4. Submitting blockchain transaction
 * 5. Waiting for confirmation
 *
 * Adapted from: backend/utils/clearnode.ts:82
 */

import {
	createCreateChannelMessage,
	parseAnyRPCResponse,
	parseCreateChannelResponse,
	parseChannelUpdateResponse,
	convertRPCToClientChannel,
	convertRPCToClientState,
	RPCMethod,
	RPCChannelStatus,
	type CreateChannelRequestParams,
	type NitroliteClient,
} from "@erc7824/nitrolite";
import type { WalletClient, Address, Hex } from "viem";
import { createPublicClient, http, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { createMessageSigner } from "../../utils/messageSigner";
import { sendRPCRequest } from "../../utils/rpcHelper";
import { NITROLITE_CONFIG } from "../../nitrolite-config";

/**
 * Create a channel via ClearNode RPC
 *
 * @param ws - Active WebSocket connection (must be authenticated)
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param wallet - Wallet client
 * @param params.amount - Amount in USDC (e.g., "10")
 * @param params.brokerAddress - Broker address
 * @param params.sessionPrivateKey - Session private key for state signing
 * @returns Channel ID
 */
export async function createChannel(
	ws: WebSocket,
	nitroliteClient: NitroliteClient,
	wallet: WalletClient,
	params: {
		amount: string;
		brokerAddress: Address;
		sessionPrivateKey: Hex;
	},
): Promise<Hex> {
	const walletAddress = wallet.account?.address;
	if (!walletAddress) {
		throw new Error("No wallet address found");
	}

	// Convert amount to wei (USDC has 6 decimals)
	const amountWei = parseUnits(params.amount, 6);

	// TODO: Approve USDC for custody contract
	// This requires ERC20 approve transaction
	// await ensureAllowance(wallet, NITROLITE_CONFIG.contracts.custody, amountWei);
	console.log("⚠️ TODO: Implement USDC approval");

	// Create message signer for RPC
	const signer = createMessageSigner(wallet);

	// Prepare channel creation parameters
	const channelParams: CreateChannelRequestParams = {
		chain_id: sepolia.id,
		token: NITROLITE_CONFIG.contracts.tokenAddress,
		amount: amountWei,
		session_key: walletAddress, // TODO: Use actual session key address
	};

	// Send RPC request
	const response = await sendRPCRequest(
		ws,
		createCreateChannelMessage(signer, channelParams),
		RPCMethod.CreateChannel,
		{
			timeout: 60000,
			errorHandler: (errorResponse) => {
				// Handle "channel already exists" error
				const errorMsg = errorResponse.params?.error || "";
				const channelExistsMatch = errorMsg.match(
					/an open channel with broker already exists: (0x[a-fA-F0-9]+)/,
				);

				if (channelExistsMatch) {
					const existingChannelId = channelExistsMatch[1] as Hex;
					console.log(
						`ℹ️ Channel already exists: ${existingChannelId.slice(0, 10)}...`,
					);
					// Return fake response that will be detected later
					return {
						method: RPCMethod.CreateChannel,
						params: {
							channelId: existingChannelId,
							exists: true,
						},
					} as any;
				}

				// Throw to use default error handling
				throw new Error(`ClearNode error: ${JSON.stringify(errorResponse.params)}`);
			},
		},
	);

	// Check if channel already existed
	if ((response.params as any).exists) {
		return (response.params as any).channelId;
	}

	// Parse response
	const parsedResponse = parseCreateChannelResponse(response);
	const { channel, state, serverSignature } = parsedResponse.params;

	if (!channel || !state || !serverSignature) {
		throw new Error(
			"Incomplete RPC response: missing channel, state, or signature",
		);
	}

	console.log("🔍 Submitting channel creation transaction...");

	// Submit blockchain transaction
	const { channelId, txHash } = await nitroliteClient.depositAndCreateChannel(
		NITROLITE_CONFIG.contracts.tokenAddress,
		amountWei,
		{
			channel: convertRPCToClientChannel(channel),
			unsignedInitialState: convertRPCToClientState(state, serverSignature),
			serverSignature,
		},
	);

	console.log(`📤 Transaction submitted: ${txHash.slice(0, 10)}...`);
	console.log("⏳ Waiting for confirmation...");

	// Listen for channel update event and wait for transaction
	return new Promise((resolve, reject) => {
		const handleChannelUpdate = (event: MessageEvent) => {
			try {
				const response = parseAnyRPCResponse(event.data);
				if (response.method === RPCMethod.ChannelUpdate) {
					const updateResponse = parseChannelUpdateResponse(event.data);
					const { channelId: updatedChannelId, status } = updateResponse.params;
					if (
						updatedChannelId === channelId &&
						status === RPCChannelStatus.Open
					) {
						ws.removeEventListener("message", handleChannelUpdate);
						clearTimeout(updateTimeoutId);
						console.log("✅ Channel update received");
						resolve(channelId);
					}
				}
			} catch (error) {
				// Ignore parsing errors
			}
		};

		const updateTimeoutId = setTimeout(() => {
			ws.removeEventListener("message", handleChannelUpdate);
			reject(new Error("Timeout waiting for channel update"));
		}, 60000);

		console.log("⏳ Waiting for channel update...");
		ws.addEventListener("message", handleChannelUpdate);

		// Wait for transaction to be mined
		const publicClient = createPublicClient({
			chain: sepolia,
			transport: http(),
		});
		publicClient
			.waitForTransactionReceipt({ hash: txHash })
			.then(() => {
				console.log("✅ Transaction confirmed");
				console.log("📡 ClearNode will detect event and populate ledger");
			})
			.catch((error) => {
				ws.removeEventListener("message", handleChannelUpdate);
				clearTimeout(updateTimeoutId);
				reject(error);
			});
	});
}
