/**
 * Message Signer Helper
 * Creates message signer function for ClearNode RPC messages
 */

import type { WalletClient, Hex } from "viem";

/**
 * Message signer function type
 * Used for signing ClearNode messages (RPC requests)
 */
export type MessageSigner = (message: unknown) => Promise<Hex>;

/**
 * Create a message signer from a wallet
 *
 * The signer function takes any message and returns a signature.
 * Used for signing RPC requests to ClearNode.
 */
export function createMessageSigner(wallet: WalletClient): MessageSigner {
	return async (message: unknown) => {
		if (!wallet.account) {
			throw new Error("No account in wallet");
		}

		return await wallet.signMessage({
			message:
				typeof message === "string" ? message : JSON.stringify(message),
			account: wallet.account,
		});
	};
}
