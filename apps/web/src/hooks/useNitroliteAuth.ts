"use client";

import { useState, useCallback } from "react";
import { useWalletClient } from "wagmi";
import type { Hex } from "viem";
import { connectToClearNode, authenticateClearNode } from "@/lib/nitrolite";

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
	connectAndAuthenticate: () => Promise<void>;
	disconnect: () => void;
}

export function useNitroliteAuth(): UseNitroliteAuthResult {
	const { data: walletClient } = useWalletClient();
	const [status, setStatus] = useState<AuthStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [jwtToken, setJwtToken] = useState<string | null>(null);
	const [sessionKey, setSessionKey] = useState<Hex | null>(null);
	const [ws, setWs] = useState<WebSocket | null>(null);

	const connectAndAuthenticate = useCallback(async () => {
		if (!walletClient) {
			setError("Wallet not connected");
			setStatus("error");
			return;
		}

		try {
			setError(null);
			setStatus("connecting");

			// Step 1: Connect to ClearNode
			console.log("Connecting to ClearNode...");
			const websocket = await connectToClearNode();
			setWs(websocket);

			setStatus("signing");

			// Step 2: Authenticate (will trigger wallet signature)
			console.log("Authenticating with ClearNode...");
			setStatus("authenticating");

			if (!walletClient) throw new Error("Wallet client not found");
			const result = await authenticateClearNode(websocket, walletClient);

			if (result.success) {
				setJwtToken(result.jwtToken || null);
				setSessionKey(result.sessionKey || null);
				setStatus("authenticated");
				console.log("✅ Successfully authenticated with ClearNode");
			} else {
				throw new Error("Authentication failed");
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			setError(errorMessage);
			setStatus("error");
			console.error("Authentication error:", errorMessage);

			// Cleanup on error
			if (ws) {
				ws.close();
				setWs(null);
			}
		}
	}, [walletClient, ws]);

	const disconnect = useCallback(() => {
		if (ws) {
			ws.close();
			setWs(null);
		}
		setStatus("idle");
		setJwtToken(null);
		setSessionKey(null);
		setError(null);
	}, [ws]);

	return {
		status,
		error,
		jwtToken,
		sessionKey,
		ws,
		connectAndAuthenticate,
		disconnect,
	};
}
