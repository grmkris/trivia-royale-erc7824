/**
 * Resize Channel Action
 *
 * Add more funds to an existing channel via ClearNode RPC.
 * Process:
 * 1. Approve additional USDC
 * 2. Deposit to custody contract
 * 3. Send resize request to ClearNode
 * 4. Wait for broker-signed resize state
 * 5. Submit blockchain transaction
 *
 * Adapted from: backend/utils/clearnode.ts:238
 */

import {
	createResizeChannelMessage,
	parseResizeChannelResponse,
	RPCMethod,
	type NitroliteClient,
} from "@erc7824/nitrolite";
import type { WalletClient, Address, Hex } from "viem";
import { parseUnits } from "viem";
import { createMessageSigner } from "../../utils/messageSigner";
import { sendRPCRequest } from "../../utils/rpcHelper";
import { NITROLITE_CONFIG } from "../../nitrolite-config";

/**
 * Resize a channel (add more funds)
 *
 * @param ws - Active WebSocket connection (must be authenticated)
 * @param nitroliteClient - SDK NitroliteClient instance
 * @param wallet - Wallet client
 * @param params.channelId - Channel ID to resize
 * @param params.additionalAmount - Amount to ADD in USDC (e.g., "5")
 * @param params.brokerAddress - Broker address
 * @param params.sessionPrivateKey - Session private key for state signing
 * @returns void (resolves when complete)
 */
export async function resizeChannel(
	ws: WebSocket,
	nitroliteClient: NitroliteClient,
	wallet: WalletClient,
	params: {
		channelId: Hex;
		additionalAmount: string;
		brokerAddress: Address;
		sessionPrivateKey: Hex;
	},
): Promise<void> {
	const walletAddress = wallet.account?.address;
	if (!walletAddress) {
		throw new Error("No wallet address found");
	}

	console.log(`💰 Resizing channel by ${params.additionalAmount} USDC...`);

	const amountWei = parseUnits(params.additionalAmount, 6);

	// TODO: Approve custody contract
	// await ensureAllowance(wallet, NITROLITE_CONFIG.contracts.custody, amountWei);
	console.log("⚠️ TODO: Implement USDC approval");

	// Deposit funds to custody contract
	console.log(`💳 Depositing ${params.additionalAmount} USDC to custody...`);
	const depositTxHash = await nitroliteClient.deposit(
		NITROLITE_CONFIG.contracts.tokenAddress,
		amountWei,
	);
	const depositReceipt =
		await nitroliteClient.publicClient.waitForTransactionReceipt({
			hash: depositTxHash,
		});

	if (depositReceipt.status === "reverted") {
		throw new Error("Deposit transaction reverted");
	}

	console.log("✅ Deposit confirmed");

	// Wait a bit for ClearNode to detect the deposit
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const signer = createMessageSigner(wallet);

	// Send RPC request
	const response = await sendRPCRequest(
		ws,
		createResizeChannelMessage(signer, {
			channel_id: params.channelId,
			resize_amount: amountWei,
			allocate_amount: BigInt(0),
			funds_destination: walletAddress,
		}),
		RPCMethod.ResizeChannel,
		{ timeout: 60000 },
	);

	// Parse response
	const parsedResponse = parseResizeChannelResponse(response);
	const { channelId: resizedChannelId, state, serverSignature } =
		parsedResponse.params;

	if (!state || !serverSignature) {
		throw new Error("Incomplete resize response");
	}

	// Submit resize transaction
	const txHash = await nitroliteClient.resizeChannel({
		resizeState: {
			channelId: resizedChannelId as Hex,
			intent: state.intent,
			version: BigInt(state.version),
			data: state.stateData as Hex,
			allocations: state.allocations,
			serverSignature,
		},
		proofStates: [],
	});

	console.log(`📤 Resize tx submitted: ${txHash.slice(0, 10)}...`);

	await nitroliteClient.publicClient.waitForTransactionReceipt({
		hash: txHash,
	});

	console.log("✅ Channel resized successfully");
}
