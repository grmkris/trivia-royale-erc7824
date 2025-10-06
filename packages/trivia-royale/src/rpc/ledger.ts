/**
 * Ledger RPC Operations
 *
 * ClearNode RPC operations for off-chain ledger management:
 * - Querying ledger balances
 * - Transferring funds via ledger
 */


// @ts-expect-error BigInt.prototype["toJSON"] is not defined
BigInt.prototype["toJSON"] = function () {
  return this.toString();
};

import {
  connectToClearNode,
  authenticateClearNode,
  createMessageSigner,
} from './connection';
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
  parseChannelUpdateResponse,
} from '@erc7824/nitrolite';
import { SEPOLIA_CONFIG, getEtherscanTxLink } from '../core/contracts';
import type { Wallet } from '../core/wallets';
import { createNitroliteClient } from '../core/wallets';
import type { Address, Hex } from 'viem';
import { createWalletClient, http, parseUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { parseUSDC, ensureAllowance } from '../core/erc20';
import { logTxSubmitted } from '../core/logger';

export async function getLedgerBalances(
  ws: WebSocket,
  wallet: Wallet
): Promise<Array<{ asset: string; amount: string }>> {
  return new Promise(async (resolve, reject) => {
    try {
      const signer = createMessageSigner(wallet.walletClient);

      // Create message handler
      const handleMessage = (event: MessageEvent) => {
        try {
          const response = parseAnyRPCResponse(event.data);

          if (response.method === RPCMethod.GetLedgerBalances) {
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

// Note: ensureSufficientBalance removed - balance checking now handled in BetterNitroliteClient

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

// Note: disconnectAll removed - close individual WebSocket connections directly with ws.close()
