import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts';
import type { Account, WalletClient, PublicClient, Address } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { NitroliteClient } from '@erc7824/nitrolite';
import { SessionKeyStateSigner } from '@erc7824/nitrolite/dist/client/signer';
import { SEPOLIA_CONFIG } from './contracts';
import type { KeyManager } from './key-manager';

// Note: Test wallet utilities (loadWallets, WALLET_NAMES, etc.) moved to scripts/testWallets.ts

export interface Wallet {
  name: string;
  index: number;
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient; 
  address: Address;
  // Session keypair for ClearNode operations (signing states, RPC messages)
  sessionPrivateKey: `0x${string}`;
  sessionAddress: Address;
}

// Note: Wallets interface moved to scripts/testWallets.ts

/**
 * Create a wallet from an account
 *
 * @param account - Viem account (from privateKeyToAccount, mnemonicToAccount, etc.)
 * @param keyManager - KeyManager for session key management (required)
 *
 * Useful for backends and frontends that manage their own keys
 */
export function createWallet(
  account: Account,
  keyManager: KeyManager
): Wallet {
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  // Get existing session key or generate new one via KeyManager
  const sessionKeypair = keyManager.getSessionKey(account.address)
    ?? keyManager.generateSessionKey(account.address);

  return {
    name: 'backend',
    index: -1,
    account,
    walletClient,
    publicClient,
    address: account.address,
    sessionPrivateKey: sessionKeypair.privateKey,
    sessionAddress: sessionKeypair.address,
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
  const stateSigner = new SessionKeyStateSigner(wallet.sessionPrivateKey);

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
