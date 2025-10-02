/**
 * Yellow SDK Integration Helpers
 *
 * This module provides helper functions for integrating with Yellow Network's
 * Nitrolite SDK, including:
 * - Creating NitroliteClient instances
 * - Connecting to ClearNode (WebSocket)
 * - Authenticating with ClearNode
 * - Creating state channels
 * - Managing application sessions
 * - Sending game messages
 */

import {
  NitroliteClient,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAppSessionMessage,
  createApplicationMessage,
  createCloseAppSessionMessage,
  type CreateAppSessionRequestParams,
  type StateSigner,
  WalletStateSigner,
} from "@erc7824/nitrolite";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type WalletClient,
  type PublicClient,
  type Hex,
  type Transport,
  type Account,
  type Chain,
  type ParseAccount,
} from "viem";
import { sepolia } from "viem/chains";

// ==================== TYPES ====================

export interface YellowConfig {
  chainId: number;
  rpcUrl: string;
  clearNodeUrl: string;
  contractAddresses: {
    custody: Address;
    adjudicator: Address;
    token: Address;
    guestAddress: Address;
  };
}

export interface ClearNodeConnection {
  ws: WebSocket;
  authenticated: boolean;
  address: Address;
}

export interface ChannelInfo {
  channelId: Hex;
  participants: Address[];
  allocations: Array<{
    destination: Address;
    token: Address;
    amount: bigint;
  }>;
}

export interface AppSessionInfo {
  sessionId: Hex;
  status: "pending" | "open" | "closed";
}

// ==================== CLIENT CREATION ====================

type RequiredWalletClient = WalletClient<Transport, Chain, ParseAccount<Account>>


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
 * Authenticate with ClearNode
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
      // Step 1: Send auth request
      const authRequest = await createAuthRequestMessage({
        address: account.address,
        session_key: account.address,
        app_name: "Trivia Royale",
        expire: (Math.floor(Date.now() / 1000) + 3600).toString(),
        scope: "game",
        application: account.address,
        allowances: [],
      });

      ws.send(authRequest);
      console.log(`  📤 Sent auth request for ${account.address}`);

      // Step 2: Wait for challenge
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);

          // Check if it's an auth challenge
          if (response.method === "auth_challenge") {
            const challenge = response.params;
            console.log(`  📥 Received auth challenge`);

            // Step 3: Sign challenge and send verification
            const authVerify = await createAuthVerifyMessage(
              async (message) => {
                // MessageSigner implementation
                return await wallet.signMessage({
                  account,
                  message: typeof message === "string" ? message : JSON.stringify(message),
                });
              },
              challenge
            );

            ws.send(authVerify);
            console.log(`  📤 Sent auth verification`);
          }

          // Check if auth succeeded
          if (response.method === "auth_success") {
            ws.removeEventListener("message", handleMessage);
            console.log(`  ✅ Authentication successful`);
            resolve();
          }

          // Check if auth failed
          if (response.method === "auth_failure") {
            ws.removeEventListener("message", handleMessage);
            reject(new Error("Authentication failed"));
          }
        } catch (error) {
          console.error("  ❌ Error handling auth message:", error);
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

// ==================== CHANNEL MANAGEMENT ====================

/**
 * Create a state channel on-chain
 * Note: This requires all participants to have deposited funds
 */
export async function createStateChannel(
  client: NitroliteClient,
  participants: Address[],
  adjudicator: Address,
  initialAllocations: Array<{
    destination: Address;
    token: Address;
    amount: bigint;
  }>
): Promise<ChannelInfo> {
  console.log("\n  📝 Creating state channel...");
  console.log(`  Participants: ${participants.length}`);

  // TODO: Get server signature from ClearNode
  // This is a placeholder
  const serverSignature = "0x" as Hex;

  const { channelId, initialState, txHash } = await client.createChannel({
    channel: {
      participants,
      adjudicator,
      challenge: 86400n,
      nonce: BigInt(Date.now()),
    },
    unsignedInitialState: {
      intent: 1, // INITIALIZE
      version: 0n,
      data: "0x",
      allocations: initialAllocations,
    },
    serverSignature,
  });

  console.log(`  ✅ Channel created: ${channelId}`);
  console.log(`  Transaction: ${txHash}`);

  return {
    channelId,
    participants,
    allocations: initialAllocations,
  };
}

/**
 * Deposit funds to custody contract
 */
export async function depositFunds(
  client: NitroliteClient,
  tokenAddress: Address,
  amount: bigint
): Promise<Hex> {
  console.log(`  💰 Depositing ${amount} tokens...`);
  const txHash = await client.deposit(tokenAddress, amount);
  console.log(`  ✅ Deposit complete: ${txHash}`);
  return txHash;
}

// ==================== APPLICATION SESSIONS ====================

/**
 * Create an application session for the game
 */
export async function createGameSession(
  ws: WebSocket,
  signer: any, // MessageSigner
  participants: Address[],
  initialAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>
): Promise<AppSessionInfo> {
  return new Promise(async (resolve, reject) => {
    console.log("\n  🎮 Creating game session...");

    try {
      const sessionMsg = await createAppSessionMessage(signer, {
        definition: {
          protocol: "nitroliterpc",
          participants,
          weights: participants.map(() => 100), // Equal weights
          quorum: 100, // All must agree
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
          const response = JSON.parse(event.data);

          if (response.method === "create_app_session") {
            ws.removeEventListener("message", handleMessage);

            const sessionId = response.params.app_session_id;
            console.log(`  ✅ Session created: ${sessionId}`);

            resolve({
              sessionId,
              status: "open",
            });
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
  signer: any,
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
  signer: any,
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
export function createMessageSigner(wallet: WalletClient) {
  return async (message: any) => {
    if (!wallet.account) throw new Error("No account in wallet");

    return await wallet.signMessage({
      message: typeof message === "string" ? message : JSON.stringify(message),
      account: wallet.account,
    });
  };
}

/**
 * Wait for WebSocket message matching a condition
 */
export function waitForMessage(
  ws: WebSocket,
  condition: (data: any) => boolean,
  timeout: number = 30000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (condition(data)) {
          ws.removeEventListener("message", handleMessage);
          resolve(data);
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    ws.addEventListener("message", handleMessage);

    setTimeout(() => {
      ws.removeEventListener("message", handleMessage);
      reject(new Error("Message wait timeout"));
    }, timeout);
  });
}
