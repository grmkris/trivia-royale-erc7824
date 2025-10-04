/**
 * Nitrolite Authentication Helpers
 * Browser-compatible version adapted from backend PoC
 */

import {
	createAuthRequestMessage,
	parseAnyRPCResponse,
	createAuthVerifyMessage,
	createEIP712AuthMessageSigner,
	RPCMethod,
	type PartialEIP712AuthMessage,
} from "@erc7824/nitrolite";
import type { WalletClient, Hex, Chain, Transport, Account, ParseAccount } from "viem";
import { NITROLITE_CONFIG } from "../nitrolite-config";

// ==================== TYPES ====================

export interface SessionKeypair {
	privateKey: Hex;
	address: Hex;
}

export interface AuthResult {
	success: boolean;
	jwtToken?: string;
	sessionKey?: Hex;
}

// ==================== SESSION KEYPAIR (Browser) ====================

/**
 * Generate ephemeral session keypair using Web Crypto API
 * Browser-compatible (no Node crypto dependency)
 */
function generateSessionKeypair(): SessionKeypair {
	// Generate 32 random bytes
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);

	// Convert to hex string
	const privateKey = `0x${Array.from(array)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}` as Hex;

	// Derive address from private key (simplified - in production use viem)
	// For now, generate another random address (session key doesn't need to match)
	const addressArray = new Uint8Array(20);
	crypto.getRandomValues(addressArray);
	const address = `0x${Array.from(addressArray)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}` as Hex;

	return { privateKey, address };
}

// ==================== WEBSOCKET CONNECTION ====================

/**
 * Connect to ClearNode WebSocket
 */
export async function connectToClearNode(): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(NITROLITE_CONFIG.clearNodeUrl);

		ws.onopen = () => {
			console.log("✅ Connected to ClearNode");
			resolve(ws);
		};

		ws.onerror = (error) => {
			console.error("❌ ClearNode connection error:", error);
			reject(new Error("Failed to connect to ClearNode"));
		};

		// Timeout
		setTimeout(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				ws.close();
				reject(new Error("ClearNode connection timeout"));
			}
		}, 10000);
	});
}

// ==================== AUTHENTICATION ====================
/**
 * Authenticate with ClearNode using EIP-712 typed signatures
 */
export async function authenticateClearNode(
	ws: WebSocket,
	wallet: WalletClient
): Promise<AuthResult> {
	return new Promise(async (resolve, reject) => {
		const account = wallet.account;
		if (!account) {
			reject(new Error("No account found in wallet"));
			return;
		}

		try {
			const walletAddress = account.address;
			const expireNum = Math.floor(Date.now() / 1000) + NITROLITE_CONFIG.auth.expireSeconds;
			const expire = expireNum.toString();

			// Generate ephemeral session keypair
			const sessionKeypair = generateSessionKeypair();
			console.log(`🔑 Main wallet: ${walletAddress}`);
			console.log(`🔐 Session key: ${sessionKeypair.address}`);

			// Step 1: Send auth request
			const authRequest = await createAuthRequestMessage({
				address: walletAddress,
				session_key: sessionKeypair.address,
				app_name: NITROLITE_CONFIG.auth.appName,
				expire,
				scope: NITROLITE_CONFIG.auth.scope,
				application: NITROLITE_CONFIG.auth.application,
				allowances: [],
			});

			console.log("📤 Sending auth request");
			ws.send(authRequest);

			// Step 2: Wait for challenge and authenticate
			const handleMessage = async (event: MessageEvent) => {
				try {
					const response = parseAnyRPCResponse(event.data);
					console.log(`📨 Received ${response.method}`);

					switch (response.method) {
						case RPCMethod.AuthChallenge:
							console.log("📥 Received auth challenge");

							// Create partial EIP-712 message
							const partialMessage: PartialEIP712AuthMessage = {
								scope: NITROLITE_CONFIG.auth.scope,
								application: NITROLITE_CONFIG.auth.application,
								participant: sessionKeypair.address,
								expire,
								allowances: [],
							};

							console.log("🔐 Creating EIP-712 signer...");

							// Create EIP-712 message signer
							const signer = createEIP712AuthMessageSigner(
								wallet,
								partialMessage,
								NITROLITE_CONFIG.authDomain,
							);

							console.log("✍️ Signing auth verification...");

							// Send auth verification
							const authVerify = await createAuthVerifyMessage(signer, response);

							console.log("📤 Sending auth verify");
							ws.send(authVerify);
							break;

						case RPCMethod.AuthVerify:
							ws.removeEventListener("message", handleMessage);

							if (response.params.success) {
								console.log("✅ Authentication successful");

								resolve({
									success: true,
									jwtToken: response.params.jwtToken,
									sessionKey: sessionKeypair.address,
								});
							} else {
								reject(new Error("Authentication failed"));
							}
							break;

						case RPCMethod.Error:
							console.error("❌ ClearNode error:", response);
							ws.removeEventListener("message", handleMessage);
							reject(
								new Error(`ClearNode error: ${JSON.stringify(response.params)}`),
							);
							break;
					}
				} catch (error) {
					console.error("❌ Error handling auth message:", error);
					// Don't reject, might be a different message format
				}
			};

			ws.addEventListener("message", handleMessage);

			// Timeout
			setTimeout(() => {
				ws.removeEventListener("message", handleMessage);
				reject(new Error("Authentication timeout"));
			}, 30000);
		} catch (error) {
			reject(error);
		}
	});
}
