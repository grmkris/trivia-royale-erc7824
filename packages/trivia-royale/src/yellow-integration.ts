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
  createAppSessionMessage,
  createApplicationMessage,
  createCloseAppSessionMessage,
  RPCMethod,
  type PartialEIP712AuthMessage,
  type EIP712AuthDomain,
} from "@erc7824/nitrolite";
import {
  type Address,
  type WalletClient,
  type Hex,
} from "viem";
import { generateSessionKeypair } from "./utils/keyManager";

// ==================== TYPES ====================

/**
 * Message signer function type
 * Used for signing ClearNode messages (application sessions, game messages)
 */
export type MessageSigner = (message: any) => Promise<Hex>;

export interface AppSessionInfo {
  sessionId: Hex;
  status: "pending" | "open" | "closed";
}

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
 */
export async function authenticateClearNode(
  ws: WebSocket,
  wallet: WalletClient
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
      // Generate ephemeral session keypair (separate from main wallet)
      const sessionKeypair = generateSessionKeypair();
      console.log(`  🔑 Main wallet: ${walletAddress}`);
      console.log(`  🔐 Session key: ${sessionKeypair.address}`);

      // Step 1: Send auth request with main wallet and session key
      const authRequest = await createAuthRequestMessage({
        address: walletAddress,             // Main wallet address
        session_key: sessionKeypair.address, // Session wallet address (different!)
        app_name: "Test Domain",
        expire, // Pass as string
        scope: "console",
        application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // random address, no use for now
        allowances: [],
      });

      console.log(`  📤 Sending auth request:`, authRequest);
      ws.send(authRequest);
      console.log(`  📤 Sent auth request for ${walletAddress}`);

      // Step 2: Wait for challenge and authenticate
      const handleMessage = async (event: MessageEvent) => {
        try {
          // Parse response using SDK parser for type safety
          const response = parseAnyRPCResponse(event.data);
          console.log(`  📨 Received ${response.method}:`, response.params);

          switch (response.method) {
            case RPCMethod.AuthChallenge:
              console.log(`  📥 Received auth challenge: ${response.params.challengeMessage}`);

              // Create partial EIP-712 message (SDK will add challenge and wallet)
              // Note: expire as STRING matches official SDK tests
              const partialMessage = {
                scope: "console",
                application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
                participant: sessionKeypair.address, // Session wallet address (not main!)
                expire, // STRING (matches official SDK integration tests)
                allowances: [],
              } satisfies PartialEIP712AuthMessage;

              console.log(`  🔐 Creating EIP-712 signer...`);

              // Create EIP-712 message signer (SDK handles signing)
              const signer = createEIP712AuthMessageSigner(
                wallet,
                partialMessage,
                AUTH_DOMAIN
              );

              console.log(`  ✍️  Signing auth verification...`);

              // Send auth verification with full challenge response object
              const authVerify = await createAuthVerifyMessage(
                signer,
                response, // Full challenge response object
              );

              console.log(`  📤 Sending auth verify message:`, authVerify);
              ws.send(authVerify);
              console.log(`  📤 Sent auth verification`);
              break;

            case RPCMethod.AuthVerify:
              if (response.params.success) {
                ws.removeEventListener("message", handleMessage);
                console.log(`  ✅ Authentication successful`);

                // Store JWT if provided
                if (response.params.jwtToken) {
                  console.log(`  🎟️  Received JWT token`);
                  // TODO: Store JWT for future sessions
                }

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

/**
 * Create an application session for the game
 * Game Master pattern: server controls game, players have no voting power
 */
export async function createGameSession(
  ws: WebSocket,
  signer: MessageSigner,
  participants: Address[],
  initialAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>,
  serverAddress: Address,
  protocol: string = 'NitroRPC/0.4'
): Promise<AppSessionInfo> {
  return new Promise(async (resolve, reject) => {
    console.log("\n  🎮 Creating game session...");

    try {
      // Game Master pattern: players have weight 0, server has weight 100
      const weights = participants.map(p =>
        p.toLowerCase() === serverAddress.toLowerCase() ? 100 : 0
      );

      const sessionMsg = await createAppSessionMessage(signer, {
        definition: {
          protocol,
          participants,
          weights, // Server: 100, Players: 0
          quorum: 100, // Only server needs to agree
          challenge: 0,
          nonce: Date.now(),
        },
        allocations: initialAllocations,
      });

      // Send message
      ws.send(sessionMsg);
      console.log("  📤 Sent session creation request");

      // Wait for response
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          switch (response.method) {
            case RPCMethod.CreateAppSession:
              ws.removeEventListener("message", handleMessage);

              const sessionId = response.params.appSessionId;
              console.log(`  ✅ Session created: ${sessionId}`);

              resolve({
                sessionId,
                status: "open",
              });
              break;

            case RPCMethod.Error:
              console.error("  ❌ ClearNode error:", response.params);
              ws.removeEventListener("message", handleMessage);
              reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
              break;
          }
        } catch (error) {
          console.error("  ❌ Error parsing session response:", error);
        }
      };

      ws.addEventListener("message", handleMessage);

      // Timeout
      setTimeout(() => {
        ws.removeEventListener("message", handleMessage);
        reject(new Error("Session creation timeout"));
      }, 30000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send a game message via ClearNode
 */
export async function sendGameMessage(
  ws: WebSocket,
  signer: MessageSigner,
  sessionId: Hex,
  messageData: any
): Promise<void> {
  const message = await createApplicationMessage(signer, sessionId, messageData);
  ws.send(message);
}

/**
 * Close an application session
 */
export async function closeGameSession(
  ws: WebSocket,
  signer: MessageSigner,
  sessionId: Hex,
  finalAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>
): Promise<void> {
  console.log("\n  🔒 Closing game session...");

  const closeMsg = await createCloseAppSessionMessage(signer, {
    app_session_id: sessionId,
    allocations: finalAllocations,
  });

  ws.send(closeMsg);
  console.log("  ✅ Session close request sent");
}

// ==================== UTILITIES ====================

/**
 * Create a message signer from a wallet
 */
export function createMessageSigner(wallet: WalletClient): MessageSigner {
  return async (message: any) => {
    if (!wallet.account) throw new Error("No account in wallet");

    return await wallet.signMessage({
      message: typeof message === "string" ? message : JSON.stringify(message),
      account: wallet.account,
    });
  };
}
