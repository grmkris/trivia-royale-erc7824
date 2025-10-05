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
  createTransferMessage,
  RPCMethod,
  type PartialEIP712AuthMessage,
  type EIP712AuthDomain,
} from "@erc7824/nitrolite";
import { NitroliteRPC } from "@erc7824/nitrolite/dist/rpc/nitrolite";
import {
  type Address,
  type WalletClient,
  type Hex,
  toHex,
  stringToHex,
  keccak256,
} from "viem";
import { DEBUG } from "./env";
import type { Wallet } from "./utils/wallets";

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

      if (DEBUG) {
        console.log(`  🔑 Main wallet: ${walletAddress}`);
        console.log(`  🔐 Session key: ${wallet.sessionAddress}`);
      }

      // Step 1: Send auth request with main wallet and session key
      const authRequest = await createAuthRequestMessage({
        address: walletAddress,                // Main wallet address
        session_key: wallet.sessionAddress,    // Session wallet address (from wallet)
        app_name: "Test Domain",
        expire, // Pass as string
        scope: "console",
        application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // random address, no use for now
        allowances,                            // Pass allowances (default: [])
      });

      if (DEBUG) {
        console.log(`  📤 Sending auth request:`, authRequest);
      }
      ws.send(authRequest);

      // Step 2: Wait for challenge and authenticate
      const handleMessage = async (event: MessageEvent) => {
        try {
          // Parse response using SDK parser for type safety
          const response = parseAnyRPCResponse(event.data);

          if (DEBUG) {
            console.log(`  📨 Received ${response.method}:`, response.params);
          }

          switch (response.method) {
            case RPCMethod.AuthChallenge:
              // Create partial EIP-712 message (SDK will add challenge and wallet)
              // Note: expire as STRING matches official SDK tests
              const partialMessage = {
                scope: "console",
                application: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
                participant: wallet.sessionAddress, // Session wallet address (not main!)
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

              if (DEBUG) {
                console.log(`  📤 Sending auth verify message:`, authVerify);
              }
              ws.send(authVerify);
              break;

            case RPCMethod.AuthVerify:
              if (response.params.success) {
                ws.removeEventListener("message", handleMessage);
                console.log(`  ✅ Authentication successful`);

                // Store JWT if provided (debug only)
                if (DEBUG && response.params.jwtToken) {
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
 * Create game session with multiple signatures (multi-party allocations)
 *
 * When creating an app session where multiple participants have non-zero allocations,
 * each participant with an allocation must sign the create_app_session request.
 *
 * This function:
 * 1. Creates the unsigned request message
 * 2. Collects signatures from server + all players with allocations
 * 3. Combines signatures into message.sig array
 * 4. Sends multi-signed message to ClearNode
 */
export async function createGameSessionWithMultiSig(
  ws: WebSocket,
  serverSigner: MessageSigner,
  playerSigners: Map<Address, MessageSigner>,
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
    console.log("\n  🎮 Creating game session with multi-sig...");

    try {
      // Game Master pattern: players have weight 0, server has weight 100
      const weights = participants.map(p =>
        p.toLowerCase() === serverAddress.toLowerCase() ? 100 : 0
      );

      // Create unsigned request
      const request = NitroliteRPC.createRequest({
        method: RPCMethod.CreateAppSession,
        params: {
          definition: {
            protocol,
            participants,
            weights,
            quorum: 100,
            challenge: 0,
            nonce: Date.now(),
          },
          allocations: initialAllocations,
        },
        signatures: [], // Start with empty signatures
      });

      // Get the payload to sign
      if (!request.req) {
        reject(new Error("Failed to create request message"));
        return;
      }
      const payload = request.req;

      // Collect signatures from all participants with allocations
      const signatures: Hex[] = [];

      // Always include server signature first
      console.log("  🔏 Collecting server signature...");
      const serverSig = await serverSigner(payload);
      signatures.push(serverSig);

      // Collect player signatures for those with allocations
      for (const allocation of initialAllocations) {
        if (allocation.amount !== '0') {
          const playerSigner = playerSigners.get(allocation.participant);
          if (!playerSigner) {
            reject(new Error(`No signer found for participant ${allocation.participant}`));
            return;
          }
          console.log(`  🔏 Collecting signature from ${allocation.participant.slice(0, 10)}...`);
          const playerSig = await playerSigner(payload);
          signatures.push(playerSig);
        }
      }

      // Attach all signatures to message
      request.sig = signatures;
      console.log(`  ✅ Collected ${signatures.length} signatures`);

      // Send multi-signed message
      ws.send(JSON.stringify(request));
      console.log("  📤 Sent multi-signed session creation request");

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
 * Send a game message via Yellow SDK's createApplicationMessage
 *
 * Uses method="message" with sid (session ID) for ClearNode routing.
 * ClearNode will broadcast to all session participants.
 */
export async function sendGameMessage(
  ws: WebSocket,
  signer: MessageSigner,
  sessionId: Hex,
  messageData: any
): Promise<void> {
  const appMessage = await createApplicationMessage(
    signer,
    sessionId,
    messageData
  );

  ws.send(appMessage);
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
  return new Promise(async (resolve, reject) => {
    try {
      console.log("\n  🔒 Closing game session...");

      const closeMsg = await createCloseAppSessionMessage(signer, {
        app_session_id: sessionId,
        allocations: finalAllocations,
      });

      // Setup listener for response
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);
          if (response.method === RPCMethod.CloseAppSession) {
            console.log("  ✅ Session closed");
            ws.removeEventListener("message", handleMessage);
            resolve();
          }
          if (response.method === RPCMethod.Error) {
            console.error("  ❌ ClearNode error:", response.params);
            ws.removeEventListener("message", handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors, might be other messages
        }
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        ws.removeEventListener("message", handleMessage);
        reject(new Error("Timeout closing session"));
      }, 10000);

      ws.addEventListener("message", handleMessage);
      ws.send(closeMsg);
      console.log("  ✅ Session close request sent");
    } catch (error) {
      reject(error);
    }
  });
}

// ==================== UTILITIES ====================

/**
 * Create a message signer from a wallet
 *
 * This creates an ECDSA signer for general RPC methods (create_channel, etc.).
 * Pattern matches SDK's createECDSAMessageSigner but uses WalletClient instead of raw private key.
 *
 * Note: Auth messages use createEIP712AuthMessageSigner, other RPC methods use raw ECDSA.
 */
export function createMessageSigner(wallet: WalletClient): MessageSigner {
  return async (payload) => {
    if (!wallet.account) throw new Error("No account in wallet");

    // Match SDK's ECDSA signer pattern:
    // 1. JSON.stringify with BigInt handling
    // 2. Convert to hex
    // 3. Hash with keccak256
    // 4. Sign the hash directly (NOT signMessage which adds prefix)
    const message = stringToHex(
      JSON.stringify(payload, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      )
    );

    const hash = keccak256(message);
    const signature = await wallet.account.sign?.({ hash });
    if (!signature) throw new Error("Failed to sign message");
    return signature;
  };
}
