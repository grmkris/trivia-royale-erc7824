import { SEPOLIA_CONFIG } from "./core/contracts";
import { NitroliteClient, SessionKeyStateSigner, createResizeChannelMessage, parseCloseAppSessionResponse, parseResizeChannelResponse, parseAnyRPCResponse, RPCMethod, createCloseAppSessionMessage, parseMessageResponse } from "@erc7824/nitrolite";
import type { Wallet } from "./core/wallets";
import type { Address, Chain, Hex } from "viem";
import { connectToClearNode, authenticateClearNode } from "./rpc/connection";
import { getUSDCBalance, parseUSDC, formatUSDC, ensureAllowance } from "./core/erc20";
import { getLedgerBalances, getChannelWithBroker, createChannelViaRPC } from "./rpc/channels";
import type { NitroliteRPCMessage } from "@erc7824/nitrolite";
import { logTxSubmitted } from "./core/logger";
import { createApplicationMessage } from '@erc7824/nitrolite';
import { transferViaLedger } from './rpc/ledger';
import { NitroliteRPC } from '@erc7824/nitrolite';
import { z } from "zod";

export interface MessageSchema {
  [key: string]: {
    data: any;
  };
}

// Type helper for message handler
export type MessageHandler<T extends MessageSchema> = <K extends keyof T>(
  type: K,
  sessionId: Hex,
  data: T[K]['data']
) => void | Promise<void>;

// Session invite type
export interface SessionInvite {
  sessionId: Hex;
  initiator: Address;
  participants: Address[];
  allocation?: {
    asset: string;
    amount: string;
  };
}

export type BetterNitroliteClient<T extends MessageSchema = any> = {
  /**
   *
   * @returns balances in custody contract, channel, ledger, and wallet
   */
  getBalances: () => Promise<{
    custodyContract: bigint; // balance in custody contract
    channel: bigint; // balance in channel
    ledger: bigint; // offchain balance in clearnode
    wallet: bigint; // balance in wallet
  }>;
  /**
   * Withdraws funds from the custody OR ledger OR channel to the wallet, depending on the amount requested
   * @param amount - amount to withdraw
   */
  withdraw: (amount: bigint) => Promise<void>;
  /**
   * Deposits funds from the wallet to the channel directly.. if there is balance in the custody contract, it will be also used
   * @param amount - amount to deposit
   */
  deposit: (amount: bigint) => Promise<void>;
  /**
   * Sends funds offchain from the wallet to another address
   * @param props - props to send funds
   */
  send: (props: {
    to: Address;
    amount: bigint;
  }) => Promise<void>;
  /**
   * Returns the status of the client
   * @returns status of the client
   */
  status: () => Promise<'connected' | 'disconnected' | 'error'>;
  /**
   * Connects to the clearnode
   */
  connect: () => Promise<void>;
  /**
   * Disconnects from the clearnode
   */
  disconnect: () => Promise<void>;
  /**
   * Prepares an unsigned session request
   * @param params - Session parameters
   * @returns Unsigned session request object
   */
  prepareSession: (params: {
    participants: Address[];
    allocations: Array<{
      participant: Address;
      asset: string;
      amount: string;
    }>;
  }) => NitroliteRPCMessage;

  /**
   * Signs a session request
   * @param request - Session request to sign
   * @returns Signature string
   */
  signSessionRequest: (request: NitroliteRPCMessage) => Promise<string>;

  /**
   * Creates a new app session with collected signatures
   * @param request - Signed session request
   * @param signatures - Array of signatures from all participants
   * @returns Session ID
   */
  createSession: (request: NitroliteRPCMessage, signatures: `0x${string}`[]) => Promise<Hex>;
  /**
   * Sends a message within an active session
   * @param sessionId - The session to send the message to
   * @param type - Message type
   * @param data - Message data
   */
  sendMessage: <K extends keyof T>(
    sessionId: Hex,
    type: K,
    data: T[K]['data']
  ) => Promise<void>;
  /**
   * Get list of active session IDs
   */
  getActiveSessions: () => Hex[];
  /**
   * Closes an active app session
   * @param sessionId - The session to close
   * @param finalAllocations - Final allocations for all participants
   */
  closeSession: (
    sessionId: Hex,
    finalAllocations: Array<{
      participant: Address;
      asset: string;
      amount: string;
    }>
  ) => Promise<void>;
  /**
   * Message handler for app messages (can be set dynamically)
   */
  onAppMessage?: MessageHandler<T>;
}


const createMessageHandler = <T extends MessageSchema>(props: {
  client: NitroliteClient,
  wallet: Wallet,
  onAppMessage?: MessageHandler<T>,
  onSessionClosed?: (sessionId: Hex, finalAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>) => void,
  activeSessions: Set<Hex>,
  ws: WebSocket | null,
}) => {
  return async (event: MessageEvent) => {
    console.log('🔍 [WS] Message received:', event.data.substring(0, 100) + '...');
    try {
      const response = parseAnyRPCResponse(event.data);
      console.log('🔍 [WS] Parsed method:', response.method);
      switch (response.method) {
        case RPCMethod.Message:
          const MessageResponseSchema = z.object({
            app_session_id: z.custom<Hex>(),
            message: z.object({
              type: z.string(),
              data: z.unknown(),
            }),
          });
          const parsedResponse = MessageResponseSchema.safeParse(response.params);
          if (!parsedResponse.success) {
            console.error('🔍 [WS] Invalid message schema:', parsedResponse.error);
            console.error('🔍 [WS] Expected: { app_session_id, message: { type, data } }');
            console.error('🔍 [WS] Got:', response.params);
            break;
          }
          console.log('🔍 [WS] Message schema valid:', parsedResponse.data);
          // Handle application messages
          if (parsedResponse.success) {
            const { app_session_id, message } = parsedResponse.data;
            if (message && app_session_id) {
              const messageType = message.type;
              const messageData = message.data || {};
              console.log(`🔍 [WS] Processing message type="${messageType}" sessionId=${app_session_id.slice(0, 10)}...`);
              // Auto-join session when receiving first message
              if (!props.activeSessions.has(app_session_id)) {
                props.activeSessions.add(app_session_id);
              }

              // Call handler if provided (for backward compatibility)
              if (props.onAppMessage) {
                console.log('🔍 [WS] Calling onAppMessage handler');
                await props.onAppMessage(messageType, app_session_id, messageData);
                console.log('🔍 [WS] onAppMessage completed');
              } else {
                console.log('🔍 [WS] No handler provided, message processed');
              }
            }
          }
          break;
        case RPCMethod.CloseAppSession:
          const closeAppResponse = parseCloseAppSessionResponse(event.data);
          // Handle session close notifications
          if (closeAppResponse.params?.appSessionId) {
            const sessionId = closeAppResponse.params.appSessionId;

            // Remove from active sessions
            props.activeSessions.delete(sessionId);

            // Notify user if callback provided
            if (props.onSessionClosed) {
              const finalAllocations = (closeAppResponse.params as any).allocations || [];
              props.onSessionClosed(sessionId, finalAllocations);
            }

            console.log(`  🔒 Session ${sessionId.slice(0, 10)}... closed (notified)`);
          }
          break;
        case RPCMethod.CreateAppSession:
          // Auto-join session when ClearNode broadcasts creation
          if (response.params?.appSessionId) {
            props.activeSessions.add(response.params.appSessionId as Hex);
          }
          break;
        case RPCMethod.Error:
          console.error('ClearNode error:', response.params);
          break;
        default:
          // Silently ignore other messages unless debugging
          break;
      }
    } catch (error) {
      // Not all messages are RPC messages, ignore parse errors
    }
  };
};

export const createBetterNitroliteClient = <T extends MessageSchema = any>(props: {
  wallet: Wallet;
  sessionAllowance?: string; // Optional USDC amount to authorize for sessions (e.g., "0.001")
  onSessionInvite?: (invite: SessionInvite) => Promise<boolean>; // Handler for session invitations
  onAppMessage?: MessageHandler<T>; // Handler for application messages within sessions
  onSessionClosed?: (sessionId: Hex, finalAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>) => void; // Handler for session closure notifications
}): BetterNitroliteClient<T> => {
  const client = new NitroliteClient({
    // @ts-expect-error - wallet.publicClient is a PublicClient
    publicClient: props.wallet.publicClient,
    // @ts-expect-error - wallet.walletClient is a WalletClient
    walletClient: props.wallet.walletClient,
    stateSigner: props.wallet.sessionSigner.createStateSigner(),
    challengeDuration: 3600n,
    addresses: {
      custody: SEPOLIA_CONFIG.contracts.custody,
      adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
      guestAddress: props.wallet.address,
    },
    chainId: SEPOLIA_CONFIG.chainId,
  });

  let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
  let ws: WebSocket | null = null;

  // Track active sessions
  const activeSessions = new Set<Hex>();

  const connect = async () => {
    ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);

    // Prepare allowances if sessionAllowance is provided
    const allowances = props.sessionAllowance
      ? [{
          asset: SEPOLIA_CONFIG.game.asset,
          amount: parseUSDC(props.sessionAllowance).toString()
        }]
      : [];

    await authenticateClearNode(ws, props.wallet, allowances);
    status = 'connected';

    // Update the handler's ws reference
    const updatedHandler = createMessageHandler<T>({
      client,
      wallet: props.wallet,
      onAppMessage: props.onAppMessage,
      onSessionClosed: props.onSessionClosed,
      activeSessions,
      ws,
    });

    // setup listener
    ws.addEventListener('message', updatedHandler);
  };

  const disconnect = async () => {
    if (ws) {
      ws.close();
      // Note: We don't need to explicitly remove listeners since closing the connection does that
      ws = null;
      status = 'disconnected';
    }
  };

  const getBalances = async () => {
    // 1. Get wallet balance (on-chain USDC in user's wallet)
    const walletBalance = await getUSDCBalance(props.wallet);

    // 2. Get custody balance (on-chain USDC in escrow contract)
    const custodyContract = await client.getAccountBalance(
      SEPOLIA_CONFIG.contracts.tokenAddress
    );

    // 3. Get channel balance (USDC locked in state channel)
    let channel = 0n;
    if (ws && status === 'connected') {
      try {
        const channelId = await getChannelWithBroker(
          ws,
          props.wallet,
          SEPOLIA_CONFIG.contracts.brokerAddress as Address
        );

        if (channelId) {
          channel = await client.getChannelBalance(
            channelId,
            SEPOLIA_CONFIG.contracts.tokenAddress as Address
          );
        }
      } catch (error) {
        console.error('Error fetching channel balance:', error);
        // Channel might not exist yet, that's ok
      }
    }

    // 4. Get ledger balance (off-chain balance in ClearNode)
    let ledger = 0n;
    if (ws && status === 'connected') {
      try {
        const ledgerBalances = await getLedgerBalances(ws, props.wallet);
        const usdcBalance = ledgerBalances.find(
          b => b.asset === SEPOLIA_CONFIG.game.asset
        );

        if (usdcBalance) {
          const totalLedger = parseUSDC(usdcBalance.amount);
          // ledger should show just difference between the channel and totalLedger
          ledger = totalLedger - channel;
        }
      } catch (error) {
        console.error('Error fetching ledger balance:', error);
        // Ledger balance might not exist yet, that's ok
      }
    }

    return {
      custodyContract,
      channel,
      ledger,
      wallet: walletBalance,
    };
  };

  // Helper function to resize channel using custody funds
  const resizeChannelWithCustodyFunds = async (
    channelId: Hex,
    amount: bigint,
  ): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('WebSocket not connected');
    }

    // Create resize message to move custody → channel
    const message = await createResizeChannelMessage(props.wallet.sessionSigner.sign, {
      channel_id: channelId,
      resize_amount: amount,           // Positive = custody → channel
      allocate_amount: 0n,              // No ledger movement
      funds_destination: props.wallet.address,
    });

    // Send and wait for response
    return new Promise<void>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.ResizeChannel) {
            ws!.removeEventListener('message', handleMessage);

            const channelData = await client.getChannelData(channelId);
            const proofStates = [channelData.lastValidState];
            const parsedResponse = parseResizeChannelResponse(event.data);
            const { state, serverSignature } = parsedResponse.params;

            // Submit resize transaction
            const txHash = await client.resizeChannel({
              resizeState: {
                channelId,
                intent: state.intent,
                version: BigInt(state.version),
                data: state.stateData as Hex,
                allocations: state.allocations,
                serverSignature,
              },
              proofStates,
            });

            const receipt = await client.publicClient.waitForTransactionReceipt({ hash: txHash });
            resolve();
          }
          else if (response.method === RPCMethod.Error) {
            ws!.removeEventListener('message', handleMessage);
            console.error('ClearNode error:', response.params);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          console.error('Error parsing resize response:', error);
          reject(new Error('Error parsing resize response'));
        }
      };

      const timeoutId = setTimeout(() => {
        ws!.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for resize response'));
      }, 60000);

      ws!.addEventListener('message', handleMessage);
      ws!.send(message);
    });
    
  };

  // Helper to resize channel with specific resize and allocate amounts
  const resizeChannelWithAmounts = async (
    channelId: Hex,
    resizeAmount: bigint,    // custody ↔ channel movement (positive = custody → channel)
    allocateAmount: bigint,  // channel ↔ ledger movement (negative = ledger → channel)
  ): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('WebSocket not connected');
    }

    // Create resize message
    const message = await createResizeChannelMessage(props.wallet.sessionSigner.sign, {
      channel_id: channelId,
      resize_amount: resizeAmount,
      allocate_amount: allocateAmount,
      funds_destination: props.wallet.address,
    });

    // Send and wait for response
    return new Promise<void>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.ResizeChannel) {
            ws!.removeEventListener('message', handleMessage);

            const channelData = await client.getChannelData(channelId);
            const proofStates = [channelData.lastValidState];

            const parsedResponse = parseResizeChannelResponse(event.data);
            const { state, serverSignature } = parsedResponse.params;

            // Submit resize transaction
            const txHash = await client.resizeChannel({
              resizeState: {
                channelId,
                intent: state.intent,
                version: BigInt(state.version),
                data: state.stateData,
                allocations: state.allocations,
                serverSignature,
              },
              proofStates,
            });

            const receipt = await client.publicClient.waitForTransactionReceipt({ hash: txHash });
            resolve();
          }
          else if (response.method === RPCMethod.Error) {
            ws!.removeEventListener('message', handleMessage);
            console.error('ClearNode error:', response.params);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          console.error('Error parsing resize response:', error);
          reject(new Error('Error parsing resize response'));
        }
      };

      const timeoutId = setTimeout(() => {
        ws!.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for resize response'));
      }, 60000);

      ws!.addEventListener('message', handleMessage);
      ws!.send(message);
    });
  };

  const withdraw = async (amount: bigint): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    console.log(`\n💸 Withdrawing ${formatUSDC(amount)} USDC...`);

    // Get current balances
    const balances = await getBalances();

    // Total available = channel + ledger + custody
    const totalAvailable = balances.channel + balances.ledger + balances.custodyContract;

    if (amount > totalAvailable) {
      throw new Error(
        `Insufficient funds. Requested ${formatUSDC(amount)}, ` +
        `available ${formatUSDC(totalAvailable)} ` +
        `(channel: ${formatUSDC(balances.channel)}, ` +
        `ledger: ${formatUSDC(balances.ledger)}, ` +
        `custody: ${formatUSDC(balances.custodyContract)})`
      );
    }

    // Strategy: Use custody first (cheapest), then resize channel for remaining amount
    let remainingToWithdraw = amount;

    // Step 1: Check how much we can use from custody (already on-chain, no resize needed)
    const fromCustody = balances.custodyContract >= remainingToWithdraw
      ? remainingToWithdraw
      : balances.custodyContract;

    remainingToWithdraw -= fromCustody;

    // Step 2: If need more funds, pull from channel/ledger via resize
    if (remainingToWithdraw > 0n) {
      const channelId = await getChannelWithBroker(
        ws,
        props.wallet,
        SEPOLIA_CONFIG.contracts.brokerAddress as Address
      );

      if (channelId) {
        // Calculate how much to pull from ledger and channel
        const fromLedger = balances.ledger >= remainingToWithdraw
          ? remainingToWithdraw
          : balances.ledger;

        const fromChannel = remainingToWithdraw - fromLedger;

        console.log(`  📊 Resizing channel to withdraw ${formatUSDC(remainingToWithdraw)} USDC`);
        console.log(`     • From ledger: ${formatUSDC(fromLedger)}`);
        console.log(`     • From channel: ${formatUSDC(fromChannel)}`);

        // Resize: negative amount = channel → custody
        const resizeAmount = -(fromLedger + fromChannel);
        const allocateAmount = fromLedger; // deallocate ledger → channel

        await resizeChannelWithAmounts(channelId, resizeAmount, allocateAmount);
        console.log(`  ✅ Resized channel, moved ${formatUSDC(remainingToWithdraw)} to custody`);
      }
    }

    // Step 3: Withdraw requested amount from custody to wallet
    const totalInCustody = await client.getAccountBalance(
      SEPOLIA_CONFIG.contracts.tokenAddress as Address
    );

    if (totalInCustody > 0n) {
      const withdrawAmount = amount > totalInCustody ? totalInCustody : amount;
      console.log(`  💰 Withdrawing ${formatUSDC(withdrawAmount)} from custody to wallet...`);

      const txHash = await client.withdrawal(
        SEPOLIA_CONFIG.contracts.tokenAddress as Address,
        withdrawAmount
      );

      logTxSubmitted('Withdrawal', txHash);
      await client.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`  ✅ Withdrawal complete!`);
    } else {
      console.log(`  ℹ️ No funds in custody to withdraw`);
    }
  };

  const deposit = async (amount: bigint): Promise<void> => {
    // Step 1: Ensure connected
    if (status !== 'connected' || !ws) {
      throw new Error('Not connected to ClearNode. Call connect() first.');
    }

    // Step 2: Get current balances
    const balances = await getBalances();

    // Step 3: Check if channel exists
    const channelId = await getChannelWithBroker(
      ws,
      props.wallet,
      SEPOLIA_CONFIG.contracts.brokerAddress as Address
    );

    if (!channelId) {
      // No channel exists - create new channel with deposit amount
      console.log(`Creating new channel with ${formatUSDC(amount)} USDC...`);

      // Check if we have enough funds (custody + wallet)
      const totalAvailable = balances.custodyContract + balances.wallet;
      if (totalAvailable < amount) {
        throw new Error(
          `Insufficient funds. Need ${formatUSDC(amount)}, ` +
          `have ${formatUSDC(totalAvailable)} (custody: ${formatUSDC(balances.custodyContract)}, ` +
          `wallet: ${formatUSDC(balances.wallet)})`
        );
      }

      // For channel creation, we need to deposit from wallet
      // (custody funds can't be used for initial channel creation)
      if (balances.wallet < amount) {
        throw new Error(
          `Insufficient wallet balance for channel creation. ` +
          `Need ${formatUSDC(amount)}, have ${formatUSDC(balances.wallet)}`
        );
      }

      // Create channel with wallet funds
      const channelId = await createChannelViaRPC(ws, props.wallet, formatUSDC(amount));
      console.log(`✅ Channel created with ${formatUSDC(amount)} USDC`);
      return;
    }

    // Channel exists - resize it by adding more funds
    console.log(`Channel exists. Adding ${formatUSDC(amount)} USDC...`);

    // Step 4: Determine fund sources
    let remainingToDeposit = amount;
    let custodyToUse = 0n;
    let walletToUse = 0n;

    // First, try to use custody funds (already on-chain)
    if (balances.custodyContract > 0n) {
      custodyToUse = balances.custodyContract >= remainingToDeposit
        ? remainingToDeposit
        : balances.custodyContract;
      remainingToDeposit -= custodyToUse;

      if (custodyToUse > 0n) {
        console.log(`  Using ${formatUSDC(custodyToUse)} from custody balance`);
      }
    }

    // Then use wallet funds for the rest
    if (remainingToDeposit > 0n) {
      if (balances.wallet < remainingToDeposit) {
        throw new Error(
          `Insufficient wallet balance. Need ${formatUSDC(remainingToDeposit)} more, ` +
          `have ${formatUSDC(balances.wallet)}`
        );
      }
      walletToUse = remainingToDeposit;
      console.log(`  Using ${formatUSDC(walletToUse)} from wallet`);
    }

    // Step 5: Execute the resize
    // Total resize amount combines both sources
    const totalResizeAmount = custodyToUse + walletToUse;

    if (walletToUse > 0n) {
      // Need to approve and deposit from wallet first
      await ensureAllowance(props.wallet, SEPOLIA_CONFIG.contracts.custody as Address, walletToUse);

      // Deposit to custody, then resize to include custody funds
      const depositTxHash = await client.deposit(
        SEPOLIA_CONFIG.contracts.tokenAddress as Address,
        walletToUse
      );
      console.log(`  ✅ Deposited ${formatUSDC(walletToUse)} to custody`);

      // Wait for deposit transaction to be confirmed on-chain
      await client.publicClient.waitForTransactionReceipt({ hash: depositTxHash });
      console.log(`  ✅ Deposit confirmed on-chain`);
    }

    // Now resize channel to include all custody funds
    if (totalResizeAmount > 0n) {
      await resizeChannelWithCustodyFunds(channelId, totalResizeAmount);
      console.log(`✅ Added ${formatUSDC(totalResizeAmount)} USDC to channel`);
    }
  };

  const send = async (params: { to: Address; amount: bigint }): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }


    await transferViaLedger(
      ws,
      props.wallet,
      params.to,
      formatUSDC(params.amount),
      SEPOLIA_CONFIG.game.asset
    );

    console.log(`  ✅ Sent ${formatUSDC(params.amount)} USDC to ${params.to.slice(0, 10)}...`);
  };

  const prepareSession = (params: {
  participants: Address[];
    allocations: Array<{
      participant: Address;
      asset: string;
      amount: string;
    }>;
  }): NitroliteRPCMessage=> {
    // Determine weights: server (this wallet) gets 100, others get 0
    const weights = params.participants.map(p =>
      p.toLowerCase() === props.wallet.address.toLowerCase() ? 100 : 0
    );

    // Create unsigned request
    const request = NitroliteRPC.createRequest({
      method: RPCMethod.CreateAppSession,
      params: {
        definition: {
          protocol: 'NitroRPC/0.4',
          participants: params.participants,
          weights,
          quorum: 100,
          challenge: 0,
          nonce: Date.now(),
        },
        allocations: params.allocations
      },
      signatures: [], // Start with empty signatures
    });

    if(!request.req) throw new Error ("Missing request.req")

    return request;
  };

  const signSessionRequest = async (request: NitroliteRPCMessage): Promise<string> => {
    if(!request.req) throw new Error ("Missing request.req")
    const signature = await props.wallet.sessionSigner.sign(request.req);
    return signature;
  };

  const createSession = async (request: NitroliteRPCMessage, signatures: `0x${string}`[]): Promise<Hex> => {
    if (!ws || status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    request.sig = signatures;

    // Send and wait for response
    return new Promise((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.CreateAppSession) {
            ws!.removeEventListener('message', handleMessage);

            const sessionId = response.params.appSessionId as Hex;
            console.log(`  ✅ Session created: ${sessionId}`);

            // Add to active sessions
            activeSessions.add(sessionId);

            resolve(sessionId);
          } else if (response.method === RPCMethod.Error) {
            ws!.removeEventListener('message', handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      console.log('Sending signed message:', request);
      ws!.addEventListener('message', handleMessage);
      ws!.send(JSON.stringify(request));

      setTimeout(() => {
        ws!.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for session creation'));
      }, 30000);
    });
  };

  const sendMessage = async <K extends keyof T>(
    sessionId: Hex,
    type: K,
    data: T[K]['data']
  ): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    // Check if session is active
    if (!activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is not active`);
    }

    const message = await createApplicationMessage(
      props.wallet.sessionSigner.sign,
      sessionId,
      { type, data }
    );

    ws.send(message);
  };

  const getActiveSessions = (): Hex[] => {
    return Array.from(activeSessions);
  };

  const closeSession = async (
    sessionId: Hex,
    finalAllocations: Array<{
      participant: Address;
      asset: string;
      amount: string;
    }>
  ): Promise<void> => {
    if (!ws || status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    // Check if session is active
    if (!activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is not active`);
    }

    console.log(`\n  🔒 Closing session ${sessionId.slice(0, 10)}...`);

    const closeMsg = await createCloseAppSessionMessage(props.wallet.sessionSigner.sign, {
      app_session_id: sessionId,
      allocations: finalAllocations,
    });

    return new Promise((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.CloseAppSession) {
            ws!.removeEventListener('message', handleMessage);

            // Remove from active sessions
            activeSessions.delete(sessionId);

            console.log(`  ✅ Session closed`);
            resolve();
          } else if (response.method === RPCMethod.Error) {
            ws!.removeEventListener('message', handleMessage);
            console.error('  ❌ ClearNode error:', response.params);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors, might be other messages
        }
      };

      ws!.addEventListener('message', handleMessage);
      ws!.send(closeMsg);

      setTimeout(() => {
        ws!.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for session close'));
      }, 30000);
    });
  };

  return {
    status: async () => status,
    connect,
    disconnect,
    getBalances,
    withdraw,
    deposit,
    send,
    prepareSession,
    signSessionRequest,
    createSession,
    sendMessage,
    getActiveSessions,
    closeSession,
    onAppMessage: props.onAppMessage,
  };
};
