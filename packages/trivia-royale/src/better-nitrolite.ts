import { SEPOLIA_CONFIG } from "./utils/contracts";
import { NitroliteClient, SessionKeyStateSigner, createResizeChannelMessage, parseResizeChannelResponse, parseAnyRPCResponse, RPCMethod } from "@erc7824/nitrolite";
import type { Wallet } from "./utils/wallets";
import type { Address, Chain, Hex } from "viem";
import { connectToClearNode, authenticateClearNode, createMessageSigner } from "./yellow-integration";
import { getUSDCBalance, parseUSDC, formatUSDC, ensureAllowance } from "./utils/erc20";
import { getLedgerBalances, getChannelWithBroker, createChannelViaRPC } from "./utils/clearnode";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { State } from "@erc7824/nitrolite";
import fs from "fs";

type BetterNitroliteClient = {
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
   * TODO more methods if needed
   */
    // TODO more methods if needed
}

type StateStorage = {
  getChannelState: (channelId: Hex) => Promise<State[]>;
  appendChannelState: (channelId: Hex, state: State) => Promise<void>;
};

const createInMemoryStateStorage = (): StateStorage => {
  const channelStates: Map<Hex, State[]> = new Map();
  return {
    getChannelState: async (channelId: Hex) => {
      const states = channelStates.get(channelId);
      if (!states) {
        throw new Error(`Channel state not found for channel ${channelId}`);
      }
      return states;
    },
    appendChannelState: async (channelId: Hex, state: State) => {
      const states = channelStates.get(channelId);
      if (!states) {
        channelStates.set(channelId, [state]);
        return;
      }
      states.push(state);
      channelStates.set(channelId, states);
    },
  };
};

// BigInt JSON serialization helpers
const replacerBigInt = (key: string, value: any): any => {
  return typeof value === 'bigint' ? value.toString() + 'n' : value;
};

const reviverBigInt = (key: string, value: any): any => {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
};

const createFileSystemStateStorage = (): StateStorage => {
  const STATE_FILE = 'state.json';

  // Initialize file if it doesn't exist
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, '{}', 'utf8');
  }

  return {
    getChannelState: async (channelId: Hex) => {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'), reviverBigInt);
      return data[channelId] || [];
    },
    appendChannelState: async (channelId: Hex, state: State) => {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'), reviverBigInt);
      if (!data[channelId]) {
        data[channelId] = [];
      }
      data[channelId].push(state);
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, replacerBigInt, 2));
    },
  };
};

export const createBetterNitroliteClient = (props: {
  wallet: Wallet
}): BetterNitroliteClient => {
  const client = new NitroliteClient({
    // @ts-expect-error - wallet.publicClient is a PublicClient
    publicClient: props.wallet.publicClient,
    // @ts-expect-error - wallet.walletClient is a WalletClient
    walletClient: props.wallet.walletClient,
    stateSigner: new SessionKeyStateSigner(props.wallet.sessionPrivateKey),
    challengeDuration: 3600n,
    addresses: {
      custody: SEPOLIA_CONFIG.contracts.custody,
      adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
      guestAddress: props.wallet.address,
    },
    chainId: SEPOLIA_CONFIG.chainId,
  });
  const stateStorage = createFileSystemStateStorage();

  let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
  let ws: WebSocket | null = null;

  const connect = async () => {
    ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
    await authenticateClearNode(ws, props.wallet);
    status = 'connected';
  };

  const disconnect = async () => {
    if (ws) {
      ws.close();
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

    const sessionSigner = createMessageSigner(
      createWalletClient({
        account: privateKeyToAccount(props.wallet.sessionPrivateKey),
        chain: sepolia,
        transport: http(),
      })
    );

    // Create resize message to move custody → channel
    const message = await createResizeChannelMessage(sessionSigner, {
      channel_id: channelId,
      resize_amount: amount,           // Positive = custody → channel
      allocate_amount: 0n,              // No ledger movement
      funds_destination: props.wallet.address,
    });

    // Send and wait for response
    return new Promise<void>((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        try {
          console.log(`Received message:`, event.data);
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.ResizeChannel) {
            ws!.removeEventListener('message', handleMessage);
            // const reversedProofStates = proofStates.reverse();

            // const channelData1 = await client.getChannelData(channelId);
            // console.log(`Channel data:`, channelData1);
            // const lastValidState = channelData1.lastValidState;
            // const lastValidState = proofStates[0];
            // const firstProofState = proofStates[0];
            // if (!firstProofState) throw new Error('No proof states');
            // const combinedProofStates = [lastValidState, {
            //   ...firstProofState,
            //   version: BigInt(firstProofState.version),
            // }];

            const proofStates = (await stateStorage.getChannelState(channelId)).reverse();
            const parsedResponse = parseResizeChannelResponse(event.data);
            const { state, serverSignature } = parsedResponse.params;
            console.log(`Resize channel response:`, state, serverSignature, proofStates);

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
            console.log(`Resize channel receipt:`, receipt);
            // get the state from the receipt
            const channelData2 = await client.getChannelData(channelId);
            console.log(`Channel data:`, channelData2);
            console.log(`State from receipt:`, receipt.logs.find(log => log.address === SEPOLIA_CONFIG.contracts.custody)?.data);
            await stateStorage.appendChannelState(channelId, channelData2.lastValidState);
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

  // Placeholder implementations for other methods
  const withdraw = async (amount: bigint): Promise<void> => {
    // TODO: Implement withdrawal logic
    throw new Error("withdraw not implemented yet");
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
      const channelId = await createChannelViaRPC(ws, props.wallet, formatUSDC(amount), stateStorage);
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
      await client.deposit(
        SEPOLIA_CONFIG.contracts.tokenAddress as Address,
        walletToUse
      );
      console.log(`  ✅ Deposited ${formatUSDC(walletToUse)} to custody`);
    }

    // Now resize channel to include all custody funds
    if (totalResizeAmount > 0n) {
      // Get proof states for resize
      const proofStates = await stateStorage.getChannelState(channelId);
      console.log(`  📚 Using ${proofStates.length} proof state(s) for resize`, proofStates);
      await resizeChannelWithCustodyFunds(channelId, totalResizeAmount);
      console.log(`✅ Added ${formatUSDC(totalResizeAmount)} USDC to channel`);
    }
  };

  const send = async (props: { to: Address; amount: bigint }): Promise<void> => {
    // TODO: Implement send logic
    throw new Error("send not implemented yet");
  };

  return {
    status: async () => status,
    connect,
    disconnect,
    getBalances,
    withdraw,
    deposit,
    send,
  };
};
