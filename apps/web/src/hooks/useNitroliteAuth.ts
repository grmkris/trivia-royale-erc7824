"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWalletClient, usePublicClient } from "wagmi";
import {
	createWallet,
	createBetterNitroliteClient,
	createLocalStorageKeyManager,
	SEPOLIA_CONFIG,
	type BetterNitroliteClient
} from "@trivia-royale/game";

export type AuthStatus =
	| "idle"
	| "connecting"
	| "authenticating"
	| "authenticated"
	| "error";

export interface UseNitroliteAuthResult {
	status: AuthStatus;
	error: string | null;
	client: BetterNitroliteClient | null;
	sessionKey: string | null;
	connectAndAuthenticate: () => void;
	disconnect: () => void;
}

export function useNitroliteAuth(): UseNitroliteAuthResult {
	const walletClient = useWalletClient();
	const publicClient = usePublicClient();
	const [client, setClient] = useState<BetterNitroliteClient | null>(null);
	const [intermediateStatus, setIntermediateStatus] = useState<
		"connecting" | "authenticating" | null
	>(null);

	const mutation = useMutation({
		mutationFn: async () => {
			if (!walletClient.data?.account) {
				throw new Error("Wallet not connected");
			}
			if (!publicClient) {
				throw new Error("Public client not available");
			}

			// Use localStorage for persistent session keys
			const keyManager = createLocalStorageKeyManager();

			// Create Wallet object with persistent session keys
			const wallet = createWallet({
				walletClient: walletClient.data,
				publicClient,
				sessionKeyManager: keyManager
			});

			// Create BetterNitroliteClient
			const nitroliteClient = createBetterNitroliteClient({
				wallet,
				sessionAllowance: SEPOLIA_CONFIG.game.entryFee, // Allow for game sessions
			});

			// Connect (handles WebSocket + authentication internally)
			setIntermediateStatus("connecting");
			await nitroliteClient.connect();
			setIntermediateStatus("authenticating");

			setIntermediateStatus(null);
			setClient(nitroliteClient);

			return nitroliteClient;
		},
		onError: () => {
			setIntermediateStatus(null);
			// Cleanup on error
			if (client) {
				client.disconnect().catch(console.error);
				setClient(null);
			}
		},
	});

	// Derive final status from mutation state + intermediate status
	const status: AuthStatus = mutation.isSuccess
		? "authenticated"
		: mutation.isError
			? "error"
			: mutation.isPending && intermediateStatus
				? intermediateStatus
				: "idle";

	const disconnect = () => {
		if (client) {
			client.disconnect().catch(console.error);
			setClient(null);
		}
		setIntermediateStatus(null);
		mutation.reset();
	};

	return {
		status,
		error:
			mutation.error instanceof Error
				? mutation.error.message
				: mutation.error
					? String(mutation.error)
					: null,
		client,
		sessionKey: client ? walletClient.data?.account?.address || null : null,
		connectAndAuthenticate: () => mutation.mutate(),
		disconnect,
	};
}
