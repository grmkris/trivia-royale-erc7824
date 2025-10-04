import { SEPOLIA_CONFIG } from "./utils/contracts";
import { NitroliteClient, SessionKeyStateSigner } from "@erc7824/nitrolite";
import type { Wallet } from "./utils/wallets";
import type { Address, Hex } from "viem";
import { connectToClearNode, authenticateClearNode } from "./yellow-integration";
import { getUSDCBalance, parseUSDC } from "./utils/erc20";
import { getLedgerBalances, getChannelWithBroker } from "./utils/clearnode";

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

  // Placeholder implementations for other methods
  const withdraw = async (amount: bigint): Promise<void> => {
    // TODO: Implement withdrawal logic
    throw new Error("withdraw not implemented yet");
  };

  const deposit = async (amount: bigint): Promise<void> => {
    // TODO: Implement deposit logic
    throw new Error("deposit not implemented yet");
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
