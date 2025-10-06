import { generateMnemonic, english, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import type { Account, WalletClient, PublicClient, Address } from 'viem';
import { createWalletClient, createPublicClient, http, stringToHex, keccak256 } from 'viem';
import { sepolia } from 'viem/chains';
import { NitroliteClient, type MessageSigner } from '@erc7824/nitrolite';
import { SessionKeyStateSigner } from '@erc7824/nitrolite/dist/client/signer';
import { SEPOLIA_CONFIG } from './contracts';
import type { SessionKeyManager } from './key-manager';

// Note: Test wallet utilities (loadWallets, WALLET_NAMES, etc.) moved to scripts/testWallets.ts

/**
 * Session signer encapsulates session key operations
 */
export interface SessionSigner {
  address: Address;
  sign: MessageSigner;  // For RPC messages to ClearNode
  createStateSigner: () => SessionKeyStateSigner;  // For on-chain state signing
}

/**
 * Create a session signer from a session private key
 */
export function createSessionSigner(privateKey: `0x${string}`): SessionSigner {
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address,

    // RPC message signer (for WebSocket messages to ClearNode)
    sign: async (payload) => {
      const message = stringToHex(
        JSON.stringify(payload, (_, v) => typeof v === 'bigint' ? v.toString() : v)
      );
      const hash = keccak256(message);
      return await account.sign({ hash });
    },

    // State signer factory (for on-chain transactions)
    createStateSigner: () => new SessionKeyStateSigner(privateKey)
  };
}

export interface Wallet {
  name: string;
  index: number;
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
  address: Address;
  // Session signer for ClearNode operations (signing states, RPC messages)
  sessionSigner: SessionSigner;
}

// Note: Wallets interface moved to scripts/testWallets.ts

/**
 * Create a wallet from an account
 *
 * @param account - Viem account (from privateKeyToAccount, mnemonicToAccount, etc.)
 * @param sessionKeyManager - KeyManager for session key management (required)
 *
 * Useful for backends and frontends that manage their own keys
 */
export function createWallet(
  props: {
    walletClient: WalletClient,
    publicClient: PublicClient,
    sessionKeyManager: SessionKeyManager
  }
): Wallet {
  const { walletClient, publicClient, sessionKeyManager } = props;
  if (!walletClient.account?.address) {
    throw new Error('Wallet client account is required');
  }
  // Get existing session key or generate new one via KeyManager
  const sessionKeypair = sessionKeyManager.getSessionKey(walletClient.account.address)
    ?? sessionKeyManager.generateSessionKey(walletClient.account.address);

  return {
    name: 'backend',
    index: -1,
    account: walletClient.account,
    walletClient,
    publicClient,
    address: walletClient.account.address,
    sessionSigner: createSessionSigner(sessionKeypair.privateKey),
  };
}

// Note: loadWallets() moved to scripts/testWallets.ts

/**
 * Create public client for reading blockchain
 */
export function createPublicRpcClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(),
  });
}

/**
 * Generate new mnemonic
 */
export function generateNewMnemonic(): string {
  return generateMnemonic(english);
}

/**
 * Derive address from mnemonic and index (without creating full wallet)
 */
export function deriveAddress(mnemonic: string, index: number): `0x${string}` {
  const account = mnemonicToAccount(mnemonic, { accountIndex: index });
  return account.address;
}

/**
 * Create NitroliteClient for a wallet
 *
 * Uses SessionKeyStateSigner to sign states with the wallet's session key.
 * This matches ClearNode's expectation that states are signed by the session key
 * address provided during authentication and channel creation.
 */
export function createNitroliteClient(
  wallet: Wallet,
  brokerAddress: Address
): NitroliteClient {
  const stateSigner = wallet.sessionSigner.createStateSigner();

  return new NitroliteClient({
    // @ts-expect-error - viem version mismatch between dependencies
    publicClient: wallet.publicClient,
    // @ts-expect-error - viem version mismatch between dependencies
    walletClient: wallet.walletClient,
    stateSigner,
    challengeDuration: 3600n,
    addresses: {
      custody: SEPOLIA_CONFIG.contracts.custody,
      adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
      guestAddress: brokerAddress,
    },
    chainId: SEPOLIA_CONFIG.chainId,
  });
}
