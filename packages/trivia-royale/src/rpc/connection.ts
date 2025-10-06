/**
 * Yellow SDK Integration Helpers
 *
 * This module provides helper functions for integrating with Yellow Network's
 * Nitrolite SDK, including:
 * - Connecting to ClearNode (WebSocket)
 * - Authenticating with ClearNode
 * - Managing application sessions
 * - Sending game messages
 */

import {
  createAuthRequestMessage,
  parseAnyRPCResponse,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  RPCMethod,
  type PartialEIP712AuthMessage,
  type EIP712AuthDomain,
} from "@erc7824/nitrolite";
import {
  type Address,
  type WalletClient,
  type Hex,
  toHex,
  stringToHex,
  keccak256,
} from "viem";
import type { Wallet } from "../core/wallets";

// ==================== TYPES ====================

/**
 * Message signer function type
 * Used for signing ClearNode messages (application sessions, game messages)
 */
export type MessageSigner = (message: any) => Promise<Hex>;

// ==================== CONSTANTS ====================

/**
 * EIP-712 domain for ClearNode authentication
 * Note: Must match app_name in auth request
 */
const AUTH_DOMAIN: EIP712AuthDomain = {
  name: "Test Domain",
};

// ==================== CLEARNODE CONNECTION ====================

/**
 * Connect to ClearNode WebSocket
 */
export async function connectToClearNode(
  clearNodeUrl: string
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(clearNodeUrl);

    ws.onopen = () => {
      console.log("  ✅ Connected to ClearNode");
      resolve(ws);
    };

    ws.onerror = (error) => {
      console.error("  ❌ ClearNode connection error:", error);
      reject(error);
    };

    // Add timeout
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error("ClearNode connection timeout"));
      }
    }, 10000);
  });
}

/**
 * Authenticate with ClearNode using EIP-712 typed signatures
 *
 * Uses the wallet's pre-generated session key for authentication.
 * This session key will be used for signing states and messages throughout the session.
 *
 * @param allowances - Optional allowances for app session funding. When provided,
 *                     authorizes ClearNode to use these amounts from ledger balances
 *                     for creating/updating application sessions.
 */
export async function authenticateClearNode(
  ws: WebSocket,
  wallet: Wallet,
  allowances: Array<{ asset: string; amount: string }> = []
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const account = wallet.account;
    if (!account) {
      reject(new Error("No account found in wallet"));
      return;
    }

    try {
      const walletAddress = account.address;
      const expireNum = Math.floor(Date.now() / 1000) + 3600;
      const expire = expireNum.toString(); // STRING for auth request (server expects string)

      // Step 1: Send auth request with main wallet and session key
      const authRequest = await createAuthRequestMessage({
        address: walletAddress,                // Main wallet address
        session_key: wallet.sessionSigner.address,    // Session wallet address
        app_name: "Test Domain",
        expire, // Pass as string
        scope: "console",
        application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // random address, no use for now
        allowances,                            // Pass allowances (default: [])
      });

      ws.send(authRequest);

      // Step 2: Wait for challenge and authenticate
      const handleMessage = async (event: MessageEvent) => {
        try {
          // Parse response using SDK parser for type safety
          const response = parseAnyRPCResponse(event.data);

          switch (response.method) {
            case RPCMethod.AuthChallenge:
              // Create partial EIP-712 message (SDK will add challenge and wallet)
              // Note: expire as STRING matches official SDK tests
              const partialMessage = {
                scope: "console",
                application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
                participant: wallet.sessionSigner.address, // Session wallet address (not main!)
                expire, // STRING (matches official SDK integration tests)
                allowances,                         // Pass allowances (default: [])
              } satisfies PartialEIP712AuthMessage;

              // Create EIP-712 message signer (SDK handles signing)
              const signer = createEIP712AuthMessageSigner(
                // @ts-expect-error - wallet.walletClient is a WalletClient
                wallet.walletClient,
                partialMessage,
                AUTH_DOMAIN
              );

              // Send auth verification with full challenge response object
              const authVerify = await createAuthVerifyMessage(
                signer,
                response, // Full challenge response object
              );

              ws.send(authVerify);
              break;

            case RPCMethod.AuthVerify:
              if (response.params.success) {
                ws.removeEventListener("message", handleMessage);
                console.log(`  ✅ Authentication successful`);
                resolve();
              } else {
                ws.removeEventListener("message", handleMessage);
                reject(new Error("Authentication failed"));
              }
              break;

            case RPCMethod.Error:
              console.error("  ❌ ClearNode error:", response);
              ws.removeEventListener("message", handleMessage);
              reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
              break;
          }
        } catch (error) {
          console.error("  ❌ Error handling auth message:", error);
          // Don't reject here, might be a different message format
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

// ==================== APPLICATION SESSIONS ====================
// Note: Application session management is now handled by BetterNitroliteClient
// Legacy createGameSession/sendGameMessage/closeGameSession functions removed

// ==================== UTILITIES ====================
