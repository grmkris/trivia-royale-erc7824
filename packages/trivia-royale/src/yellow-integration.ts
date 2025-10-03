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
  parseAnyRPCResponse,
  createAuthVerifyMessageFromChallenge,
  createEIP712AuthMessageSigner,
  createAppSessionMessage,
  createApplicationMessage,
  createCloseAppSessionMessage,
  type CreateAppSessionRequestParams,
  type StateSigner,
  WalletStateSigner,
  RPCMethod,
  type AuthChallengeResponse,
  type AuthVerifyResponse,
  type PartialEIP712AuthMessage,
  type EIP712AuthDomain,
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

// ==================== CONSTANTS ====================

/**
 * EIP-712 domain for ClearNode authentication
 * Note: Must match app_name in auth request
 */
const AUTH_DOMAIN: EIP712AuthDomain = {
  name: "Trivia Royale",
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
      const expire = (Math.floor(Date.now() / 1000) + 3600).toString();

      // Step 1: Send auth request with address and session_key
      const authRequest = await createAuthRequestMessage({
        address: walletAddress,
        session_key: walletAddress, // Using wallet as session key
        app_name: "Trivia Royale",
        expire,
        scope: "game",
        application: walletAddress,
        allowances: [],
      });

      ws.send(authRequest);
      console.log(`  📤 Sent auth request for ${walletAddress}`);

      // Step 2: Wait for challenge and authenticate
      const handleMessage = async (event: MessageEvent) => {
        try {
          // Parse response using SDK parser for type safety
          const response = parseAnyRPCResponse(event.data);
          console.log(`  📨 Received ${response.method}:`, response.params);

          // Handle auth challenge
          if (response.method === RPCMethod.AuthChallenge) {
            const challengeMessage = response.params.challengeMessage;

            console.log(`  📥 Received auth challenge: ${challengeMessage}`);

            // Create partial EIP-712 message (SDK will add challenge and wallet)
            // Note: expire should be number for EIP-712 uint256, but SDK types say string
            const partialMessage: PartialEIP712AuthMessage = {
              scope: "game",
              application: walletAddress,
              participant: walletAddress, // Using wallet as participant
              expire: (Math.floor(Date.now() / 1000) + 3600).toString(), // number for EIP-712 uint256
              allowances: [],
            };

            console.log(`  🔐 Creating EIP-712 signer...`);

            // Create EIP-712 message signer (SDK handles signing)
            const signer = createEIP712AuthMessageSigner(
              wallet,
              partialMessage,
              AUTH_DOMAIN
            );

            console.log(`  ✍️  Signing auth verification...`);

            // Send auth verification using SDK's helper
            const authVerify = await createAuthVerifyMessageFromChallenge(
              signer,
              challengeMessage // Just the UUID string
            );

            console.log(`  📤 Sending auth verify message:`, authVerify);
            ws.send(authVerify);
            console.log(`  📤 Sent auth verification`);
          }

          // Handle auth success
          if (response.method === RPCMethod.AuthVerify) {
            const verifyResponse = response as AuthVerifyResponse;

            if (verifyResponse.params.success) {
              ws.removeEventListener("message", handleMessage);
              console.log(`  ✅ Authentication successful`);

              // Store JWT if provided
              if (verifyResponse.params.jwtToken) {
                console.log(`  🎟️  Received JWT token`);
                // TODO: Store JWT for future sessions
              }

              resolve();
            } else {
              ws.removeEventListener("message", handleMessage);
              reject(new Error("Authentication failed"));
            }
          }

          // Handle errors
          if (response.method === RPCMethod.Error) {
            console.error("  ❌ ClearNode error:", response);
            ws.removeEventListener("message", handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
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
