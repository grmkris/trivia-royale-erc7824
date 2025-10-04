/**
 * Get Ledger Balances Action
 *
 * Get off-chain ledger balances from ClearNode.
 * These are the balances managed by ClearNode off-chain.
 * They update in real-time as application sessions open/close.
 *
 * Adapted from: backend/utils/clearnode.ts:552
 */

import { createGetLedgerBalancesMessage, RPCMethod } from "@erc7824/nitrolite";
import type { WalletClient } from "viem";
import { createMessageSigner } from "../../utils/messageSigner";
import { sendRPCRequest } from "../../utils/rpcHelper";

export interface LedgerBalance {
	asset: string;
	amount: string;
}

/**
 * Get off-chain ledger balances from ClearNode
 *
 * @param ws - Active WebSocket connection (must be authenticated)
 * @param wallet - Wallet client
 * @returns Array of ledger balances { asset, amount }
 */
export async function getLedgerBalances(
	ws: WebSocket,
	wallet: WalletClient,
): Promise<LedgerBalance[]> {
	const signer = createMessageSigner(wallet);
	const walletAddress = wallet.account?.address;

	if (!walletAddress) {
		throw new Error("No wallet address found");
	}

	// Send RPC request
	const response = await sendRPCRequest(
		ws,
		createGetLedgerBalancesMessage(signer, walletAddress),
		RPCMethod.GetLedgerBalances,
		{ timeout: 10000 },
	);

	// Extract and return ledger balances
	console.log("📥 Received ledger balances:", response.params.ledgerBalances);
	return response.params.ledgerBalances || [];
}
