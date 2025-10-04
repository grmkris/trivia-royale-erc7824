"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Hex } from "viem";
import { connectToClearNode, authenticateClearNode } from "@/lib/nitrolite/actions/authenticateClearNode";

export type AuthStatus =
	| "idle"
	| "connecting"
	| "signing"
	| "authenticating"
	| "authenticated"
	| "error";

export interface UseNitroliteAuthResult {
	status: AuthStatus;
	error: string | null;
	jwtToken: string | null;
	sessionKey: Hex | null;
	ws: WebSocket | null;
	connectAndAuthenticate: () => void;
	disconnect: () => void;
}

export function useNitroliteAuth(): UseNitroliteAuthResult {
	const walletClient = useWalletClient();
	const [intermediateStatus, setIntermediateStatus] = useState<
		"connecting" | "signing" | "authenticating" | null
	>(null);
	const [ws, setWs] = useState<WebSocket | null>(null);

	const mutation = useMutation({
		mutationFn: async () => {
			if (!walletClient.data) {
				throw new Error("Wallet not connected");
			}

			// Step 1: Connect to ClearNode
			setIntermediateStatus("connecting");
			console.log("Connecting to ClearNode...");
			const websocket = await connectToClearNode();
			setWs(websocket);

			// Step 2: Authenticate (signing happens here)
			setIntermediateStatus("signing");
			console.log("Authenticating with ClearNode...");

			setIntermediateStatus("authenticating");
			const result = await authenticateClearNode(websocket, walletClient.data);

			if (!result.success) {
				throw new Error("Authentication failed");
			}

			setIntermediateStatus(null);
			console.log("✅ Successfully authenticated with ClearNode");

			return result;
		},
		onError: () => {
			setIntermediateStatus(null);
			// Cleanup WebSocket on error
			if (ws) {
				ws.close();
				setWs(null);
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
		if (ws) {
			ws.close();
			setWs(null);
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
		jwtToken: mutation.data?.jwtToken ?? null,
		sessionKey: mutation.data?.sessionKey ?? null,
		ws,
		connectAndAuthenticate: () => mutation.mutate(),
		disconnect,
	};
}
