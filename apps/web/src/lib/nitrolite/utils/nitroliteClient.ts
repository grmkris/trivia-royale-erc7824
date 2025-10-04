/**
 * NitroliteClient Factory
 * Browser-compatible wrapper for creating NitroliteClient instances
 */

import { NitroliteClient } from "@erc7824/nitrolite";
import { SessionKeyStateSigner } from "@erc7824/nitrolite/dist/client/signer";
import type { WalletClient, Address, Hex } from "viem";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { NITROLITE_CONFIG } from "../nitrolite-config";

/**
 * Create NitroliteClient for a wallet
 *
 * Uses SessionKeyStateSigner to sign states with the wallet's session key.
 * This matches ClearNode's expectation that states are signed by the session key
 * address provided during authentication and channel creation.
 *
 * NOTE: In production, you need to manage session keys properly.
 * For now, this is a placeholder - session key management will be added later.
 */
export function createNitroliteClient(
	wallet: WalletClient,
	counterpartyAddress: Address,
	sessionPrivateKey?: Hex, // Optional: for when we have session key management
): NitroliteClient {
	const publicClient = createPublicClient({
		chain: sepolia,
		transport: http(),
	});

	// TODO: Implement proper session key management
	// For now, using wallet's private key as a placeholder
	// In production, this should be an ephemeral session key
	const stateSigner = sessionPrivateKey
		? new SessionKeyStateSigner(sessionPrivateKey)
		: null;

	return new NitroliteClient({
		publicClient,
		walletClient: wallet,
		stateSigner: stateSigner as any, // Null for read-only operations
		challengeDuration: 3600n,
		addresses: {
			custody: NITROLITE_CONFIG.contracts.custody,
			adjudicator: NITROLITE_CONFIG.contracts.adjudicator,
			guestAddress: counterpartyAddress,
		},
		chainId: sepolia.id,
	});
}
