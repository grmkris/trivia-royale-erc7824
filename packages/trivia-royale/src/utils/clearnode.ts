/**
 * ClearNode WebSocket Management
 *
 * Functional helpers for managing multiple WebSocket connections
 * to Yellow Network's ClearNode service.
 */


// @ts-expect-error BigInt.prototype["toJSON"] is not defined
BigInt.prototype["toJSON"] = function () {
  return this.toString();
};

import {
  connectToClearNode,
  authenticateClearNode,
  createMessageSigner,
} from '../yellow-integration';
import {
  createGetLedgerBalancesMessage,
  createCreateChannelMessage,
  createGetChannelsMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createTransferMessage,
  parseAnyRPCResponse,
  parseCreateChannelResponse,
  parseGetChannelsResponse,
  parseResizeChannelResponse,
  parseCloseChannelResponse,
  convertRPCToClientChannel,
  convertRPCToClientState,
  RPCMethod,
  type CreateChannelRequestParams,
  type UnsignedState,
  RPCChannelStatus,
  parseChannelUpdateResponse,
} from '@erc7824/nitrolite';
import { SEPOLIA_CONFIG } from './contracts';
import type { Wallet } from './wallets';
import type { Address, Hex } from 'viem';
import { createWalletClient, http, parseUnits } from 'viem';
import { createNitroliteClient } from './channels';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { parseUSDC, ensureAllowance } from './erc20';

/**
 * Connect and authenticate all participants to ClearNode
 */
export async function connectAllParticipants(
  wallets: Wallet[]
): Promise<Map<string, WebSocket>> {
  const connections = new Map<string, WebSocket>();

  for (const wallet of wallets) {
    console.log(`   🔗 ${wallet.name}: Connecting...`);

    const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
    await authenticateClearNode(ws, wallet);

    connections.set(wallet.name, ws);
    console.log(`   ✅ ${wallet.name}: Authenticated`);
  }

  return connections;
}

/**
 * Create a channel via ClearNode RPC
 *
 * This creates a channel AND registers it with ClearNode for ledger tracking.
 * The channel will be between the wallet and ClearNode (as broker/counterparty).
 *
 * Flow:
 * 1. Deposit funds to custody contract
 * 2. Send RPC request to ClearNode → Get broker-signed state
 * 3. Parse response to extract channel, state, serverSignature
 * 4. Create NitroliteClient and submit blockchain transaction
 * 5. Wait for transaction confirmation
 * 6. ClearNode detects ChannelCreated event → populates ledger balances
 */
export async function createChannelViaRPC(
  ws: WebSocket,
  wallet: Wallet,
  amount: string = '10' // Default amount in USDC
): Promise<Hex> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Approve custody contract to spend USDC
      const amountWei = parseUSDC(amount);
      await ensureAllowance(wallet, SEPOLIA_CONFIG.contracts.custody, amountWei);

      // Step 2: Deposit funds to custody contract
      // Create NitroliteClient with broker as counterparty for the 2-party state channel
      const nitroliteClient = createNitroliteClient(wallet, SEPOLIA_CONFIG.contracts.brokerAddress);

      // Step 2: Prepare RPC request
      const sessionSigner = createMessageSigner(createWalletClient({
        account: privateKeyToAccount(wallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      }));

      // sessionKey and sessionSigner should be the same
      if (wallet.sessionAddress !== privateKeyToAccount(wallet.sessionPrivateKey).address) {
        reject(new Error('Session key and session signer do not match'));
        return;
      }

      // Prepare channel creation parameters
      const params: CreateChannelRequestParams = {
        chain_id: SEPOLIA_CONFIG.chainId,
        token: SEPOLIA_CONFIG.contracts.tokenAddress,
        amount: amountWei, // BigInt - signer will handle serialization,
        session_key: wallet.sessionAddress
      };

      // Create message handler for RPC response
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.CreateChannel) {
            ws.removeEventListener('message', handleMessage);
            try {
              // Parse RPC response to extract channel parameters and broker signature
              const parsedResponse = parseCreateChannelResponse(event.data);
              const { channel, state, serverSignature } = parsedResponse.params;

              if (!channel || !state || !serverSignature) {
                reject(new Error('Incomplete RPC response: missing channel, state, or signature'));
                return;
              }

              console.log(`  🔍 ${wallet.name}: Using convertRPCToClientState (matches SDK test pattern)`);

              // Step 2: Create channel with broker's signature
              // SDK will:
              // 1. Sign the state with wallet's key
              // 2. Combine both signatures (wallet + server)
              // 3. Call custody contract's depositAndCreate() with both signatures
              const { channelId, txHash } = await nitroliteClient.depositAndCreateChannel(
                SEPOLIA_CONFIG.contracts.tokenAddress,
                amountWei,
                {
                  channel: convertRPCToClientChannel(channel),
                  unsignedInitialState: convertRPCToClientState(state, serverSignature),
                  serverSignature,                             // Passed separately
                });

              console.log(`  📤 ${wallet.name}: Transaction submitted (${txHash.slice(0, 10)}...)`);
              console.log(`  ⏳ ${wallet.name}: Waiting for confirmation...`);

              // listen for channel update event
              const handleChannelUpdate = (event: MessageEvent) => {
                const response = parseChannelUpdateResponse(event.data);
                const { channelId: updatedChannelId, status } = response.params;
                if (updatedChannelId === channelId && status === RPCChannelStatus.Open) {
                  ws.removeEventListener('message', handleChannelUpdate);
                  clearTimeout(timeoutId);
                  console.log(`  ✅ ${wallet.name}: Channel update received`);
                  resolve(channelId);
                }
              };
              const timeoutId = setTimeout(() => {
                ws.removeEventListener('message', handleChannelUpdate);
                reject(new Error('Timeout waiting for channel update'));
              }, 60000);
              console.log(`  ⏳ ${wallet.name}: Waiting for channel update...`);
            
              ws.addEventListener('message', handleChannelUpdate);

              // Wait for transaction to be mined
              await nitroliteClient.publicClient.waitForTransactionReceipt({ hash: txHash });

              
              console.log(`  ✅ ${wallet.name}: Transaction confirmed`);
              console.log(`  📡 ${wallet.name}: ClearNode will detect event and populate ledger`);

              resolve(channelId);
            } catch (error) {
              console.error(`  ❌ ${wallet.name}: Error submitting channel transaction: ${JSON.stringify(error)}`);
              reject(new Error(`Failed to submit channel transaction: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
          } else if (response.method === RPCMethod.Error) {
            ws.removeEventListener('message', handleMessage);

            // Handle "channel already exists" error by extracting the existing channel ID
            const errorMsg = response.params?.error || '';
            const channelExistsMatch = errorMsg.match(/an open channel with broker already exists: (0x[a-fA-F0-9]+)/);

            if (channelExistsMatch) {
              const existingChannelId = channelExistsMatch[1] as Hex;
              console.log(`  ℹ️  ${wallet.name}: Channel already exists, using ${existingChannelId.slice(0, 10)}...`);
              resolve(existingChannelId);
            } else {
              console.error(`  ❌ ${wallet.name}: ClearNode error:`, response.params);
              reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
            }
          }
        } catch (error) {
          // Ignore parsing errors, might be other messages
        }
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for channel creation'));
      }, 60000); // 60 second timeout (includes blockchain confirmation)

      // Add message handler
      ws.addEventListener('message', handleMessage);

      // Create and send RPC request
      const message = await createCreateChannelMessage(sessionSigner, params);
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}



/**
 * Resize a channel via ClearNode RPC (add more funds)
 *
 * This adds funds to an existing channel and updates ClearNode's ledger tracking.
 *
 * Flow:
 * 1. Send resize request to ClearNode → Get broker-signed resize state
 * 2. Parse response to extract resize state and serverSignature
 * 3. Create NitroliteClient and submit blockchain transaction
 * 4. Wait for transaction confirmation
 * 5. ClearNode detects event → updates ledger balances
 */
export async function resizeChannelViaRPC(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex,
  additionalAmount: string // Amount to ADD in USDC
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`  💰 ${wallet.name}: Resizing channel by ${additionalAmount} USDC...`);

      const nitroliteClient = createNitroliteClient(wallet, SEPOLIA_CONFIG.contracts.brokerAddress);
      const amountWei = parseUSDC(additionalAmount);

      const sessionSigner = createMessageSigner(createWalletClient({
        account: privateKeyToAccount(wallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      }));

      // Create message handler for RPC response
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.ResizeChannel) {
            ws.removeEventListener('message', handleMessage);
            try {
              const parsedResponse = parseResizeChannelResponse(event.data);
              const { channelId: resizedChannelId, state, serverSignature } = parsedResponse.params;

              if (!state || !serverSignature) {
                reject(new Error('Incomplete resize response'));
                return;
              }
              // Submit resize transaction
              const txHash = await nitroliteClient.resizeChannel({
                resizeState: {
                  channelId: resizedChannelId as Hex,
                  intent: state.intent,
                  version: BigInt(state.version),
                  data: state.stateData as Hex,
                  allocations: state.allocations,
                  serverSignature,
                },
                proofStates: [],
              });

              console.log(`  📤 ${wallet.name}: Resize tx submitted (${txHash.slice(0, 10)}...)`);

              await nitroliteClient.publicClient.waitForTransactionReceipt({ hash: txHash });

              console.log(`  ✅ ${wallet.name}: Channel resized successfully`);
              resolve();
            } catch (error) {
              console.error(`  ❌ ${wallet.name}: Error resizing channel:`, error);
              reject(error);
            }
          } else if (response.method === RPCMethod.Error) {
            console.error(`  ❌ ClearNode error:`, response.params);
            ws.removeEventListener('message', handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for resize response'));
      }, 60000);

      ws.addEventListener('message', handleMessage);

      // Send resize request
      const message = await createResizeChannelMessage(sessionSigner, {
        channel_id: channelId,
        resize_amount: amountWei,
        allocate_amount: 0n,
        funds_destination: wallet.address,
      });
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Close a channel via ClearNode RPC
 *
 * This closes a channel and returns funds to custody.
 *
 * Flow:
 * 1. Send close request to ClearNode → Get broker-signed close state
 * 2. Parse response to extract close state and serverSignature
 * 3. Create NitroliteClient and submit blockchain transaction
 * 4. Wait for transaction confirmation
 * 5. Funds return to custody
 */
export async function closeChannelViaRPC(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`  🔒 ${wallet.name}: Closing channel ${channelId.slice(0, 10)}...`);

      const nitroliteClient = createNitroliteClient(wallet, SEPOLIA_CONFIG.contracts.brokerAddress);

      const sessionSigner = createMessageSigner(createWalletClient({
        account: privateKeyToAccount(wallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      }));

      // Create message handler for RPC response
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.CloseChannel) {
            ws.removeEventListener('message', handleMessage);
            try {
              const parsedResponse = parseCloseChannelResponse(event.data);
              const { channelId: closedChannelId, state, serverSignature } = parsedResponse.params;

              if (!state || !serverSignature) {
                reject(new Error('Incomplete close response'));
                return;
              }

              // Submit close transaction
              const txHash = await nitroliteClient.closeChannel({
                finalState: {
                  channelId: closedChannelId as Hex,
                  intent: state.intent,
                  version: BigInt(state.version),
                  data: state.stateData as Hex,
                  allocations: state.allocations,
                  serverSignature,
                },
                stateData: state.stateData as Hex,
              });

              console.log(`  📤 ${wallet.name}: Close tx submitted (${txHash.slice(0, 10)}...)`);

              await nitroliteClient.publicClient.waitForTransactionReceipt({ hash: txHash });

              console.log(`  ✅ ${wallet.name}: Channel closed successfully`);
              resolve();
            } catch (error) {
              console.error(`  ❌ ${wallet.name}: Error closing channel:`, error);
              reject(error);
            }
          } else if (response.method === RPCMethod.Error) {
            console.error(`  ❌ ClearNode error:`, response.params);
            ws.removeEventListener('message', handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for close response'));
      }, 60000);

      ws.addEventListener('message', handleMessage);

      // Send close request
      const message = await createCloseChannelMessage(
        sessionSigner,
        channelId,
        wallet.address
      );
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get existing channel with broker for a wallet
 *
 * Returns the channel ID if an open channel exists, null otherwise.
 *
 * Note: Since get_channels is filtered by wallet.address and RPCChannelStatus.Open,
 * it should only return the broker channel. We return the first channel found.
 */
export async function getChannelWithBroker(
  ws: WebSocket,
  wallet: Wallet,
  brokerAddress: Address
): Promise<Hex | null> {
  return new Promise(async (resolve, reject) => {
    try {
      const sessionSigner = createMessageSigner(createWalletClient({
        account: privateKeyToAccount(wallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      }));

      // Set up timeout
      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout getting channels'));
      }, 10000);

      // Create message handler
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.GetChannels) {
            clearTimeout(timeoutId);
            ws.removeEventListener('message', handleMessage);

            const parsedResponse = parseGetChannelsResponse(event.data);
            const channels = parsedResponse.params.channels || [];
            console.log(`  🔍 ${wallet.name}: Found ${channels.length} open channel(s)`);

            if (channels.length > 0) {
              const channel = channels[0];
              // Return first channel - should be the broker channel
              if (channel.channelId) {
                console.log(`  ✅ ${wallet.name}: Using channel ${channel.channelId.slice(0, 10)}...`);
                resolve(channel.channelId);
              } else {
                console.error(`  ❌ ${wallet.name}: Channel missing channelId:`, channel);
                resolve(null);
              }
            } else {
              console.log(`  ℹ️  ${wallet.name}: No open channels found`);
              resolve(null);
            }
          } else if (response.method === RPCMethod.Error) {
            clearTimeout(timeoutId);
            console.error(`  ❌ ${wallet.name}: Error getting channels:`, response.params);
            ws.removeEventListener('message', handleMessage);
            reject(new Error(`Failed to get channels: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          console.error(`  ❌ ${wallet.name}: Error in getChannelWithBroker handler:`, error);
          // Don't ignore errors - they might be important
        }
      };

      // Add message handler
      ws.addEventListener('message', handleMessage);

      // Create and send request
      const message = await createGetChannelsMessage(
        sessionSigner,
        wallet.address,
        RPCChannelStatus.Open
      );
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Re-authenticate with allowances for app session
 *
 * Before creating an app session with non-zero allocations, each participant
 * must re-authenticate with allowances to authorize ClearNode to use their
 * ledger funds for the session.
 *
 * @param ws - Active WebSocket connection (already authenticated once)
 * @param wallet - Wallet to re-authenticate
 * @param allowances - Allowances to authorize (e.g., entry fee for game)
 */
export async function authenticateForAppSession(
  ws: WebSocket,
  wallet: Wallet,
  allowances: Array<{ asset: string; amount: string }>
): Promise<void> {
  console.log(`  🔐 ${wallet.name}: Re-authenticating with allowances...`);
  await authenticateClearNode(ws, wallet, allowances);
  console.log(`  ✅ ${wallet.name}: Allowances authorized`);
}

/**
 * Get off-chain ledger balances from ClearNode
 *
 * These are the balances managed by ClearNode off-chain.
 * They update in real-time as application sessions open/close.
 */
export async function getLedgerBalances(
  ws: WebSocket,
  wallet: Wallet
): Promise<Array<{ asset: string; amount: string }>> {
  return new Promise(async (resolve, reject) => {
    try {
      const signer = createMessageSigner(wallet.client);

      // Create message handler
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.GetLedgerBalances) {
            console.log(`  🔍 ${wallet.name}: Received ledger balances`, response.params.ledgerBalances);
            ws.removeEventListener('message', handleMessage);
            // Response format: params is the array of balances
            resolve(response.params.ledgerBalances || []);
          }
        } catch (error) {
          console.error(`  🔍 ${wallet.name}: Error parsing ledger balances`, error);
          // Ignore parsing errors, might be other messages
        }
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for ledger balances'));
      }, 10000);

      // Add message handler
      ws.addEventListener('message', handleMessage);

      // Create and send request
      const message = await createGetLedgerBalancesMessage(signer, wallet.address);
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Ensure wallet has sufficient ledger balance for a game
 *
 * Checks current ledger balance and resizes channel if needed.
 * This prevents "insufficient funds" errors when creating app sessions.
 */
export async function ensureSufficientBalance(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex,
  requiredAmount: string, // In ETH
  asset: string = 'ETH'
): Promise<void> {
  console.log(`  🔍 ${wallet.name}: Checking balance...`);

  // Get current ledger balance
  const balances = await getLedgerBalances(ws, wallet);
  const balance = balances.find(b => b.asset === asset);

  if (!balance) {
    console.log(`  ⚠️  ${wallet.name}: No ${asset} balance found, needs resize`);
    await resizeChannelViaRPC(ws, wallet, channelId, requiredAmount);
    return;
  }

  const requiredWei = parseUSDC(requiredAmount);
  const currentWei = BigInt(parseUnits(balance.amount, SEPOLIA_CONFIG.token.decimals));

  if (currentWei < requiredWei) {
    const deficit = requiredWei - currentWei;
    const deficitUsdc = (Number(deficit) / 10 ** SEPOLIA_CONFIG.token.decimals).toFixed(SEPOLIA_CONFIG.token.decimals);
    console.log(`  ⚠️  ${wallet.name}: Insufficient balance (need ${deficitUsdc} more USDC)`);
    await resizeChannelViaRPC(ws, wallet, channelId, deficitUsdc);
  } else {
    console.log(`  ✅ ${wallet.name}: Sufficient balance`);
  }
}

/**
 * Transfer funds via ClearNode ledger (off-chain)
 *
 * Transfers funds between participants' ledger balances off-chain.
 * This updates ClearNode's internal ledger without touching channels or blockchain.
 *
 * @param ws - WebSocket connection of the sender
 * @param fromWallet - Wallet sending the funds
 * @param toAddress - Address receiving the funds
 * @param amount - Amount to transfer (in USDC, e.g., "0.3")
 * @param asset - Asset identifier (e.g., "usdc")
 */
export async function transferViaLedger(
  ws: WebSocket,
  fromWallet: Wallet,
  toAddress: Address,
  amount: string,
  asset: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`  💸 ${fromWallet.name}: Transferring ${amount} ${asset.toUpperCase()} to ${toAddress.slice(0, 10)}...`);

      const sessionSigner = createMessageSigner(createWalletClient({
        account: privateKeyToAccount(fromWallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      }));

      // Create message handler for RPC response
      const handleMessage = async (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.Transfer) {
            ws.removeEventListener('message', handleMessage);
            console.log(`  ✅ ${fromWallet.name}: Transfer complete`);
            resolve();
          } else if (response.method === RPCMethod.Error) {
            console.error(`  ❌ ClearNode error:`, response.params);
            ws.removeEventListener('message', handleMessage);
            reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      const timeoutId = setTimeout(() => {
        ws.removeEventListener('message', handleMessage);
        reject(new Error('Timeout waiting for transfer response'));
      }, 30000);

      ws.addEventListener('message', handleMessage);

      // Send transfer request
      const message = await createTransferMessage(sessionSigner, {
        destination: toAddress,
        allocations: [{
          amount: amount,
          asset: asset,
        }],
      });
      ws.send(message);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Close all WebSocket connections
 */
export function disconnectAll(connections: Map<string, WebSocket>): void {
  for (const [name, ws] of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
  console.log(`   🔌 Disconnected all (${connections.size} connections)`);
}
