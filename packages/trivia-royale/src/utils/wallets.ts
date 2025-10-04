import { mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import type { Account, WalletClient, Chain, Transport, ParseAccount } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { env } from '../env';
import { generateSessionKeypair } from './keyManager';

const WALLET_NAMES = [
  'Master',    // index 0 - Funding source
  'Alice',     // index 1
  'Bob',       // index 2
  'Charlie',   // index 3
  'Diana',     // index 4
  'Eve',       // index 5
  'Server',    // index 6
] as const;

export interface Wallet {
  name: string;
  index: number;
  account: Account;
  client: WalletClient<Transport, Chain, ParseAccount<Account>>;
  address: `0x${string}`;
  // Session keypair for ClearNode operations (signing states, RPC messages)
  sessionPrivateKey: `0x${string}`;
  sessionAddress: `0x${string}`;
}

/**
 * Wallets object with named properties for type safety and autocomplete
 */
export interface Wallets {
  master: Wallet;
  alice: Wallet;
  bob: Wallet;
  charlie: Wallet;
  diana: Wallet;
  eve: Wallet;
  server: Wallet;
  all: Wallet[];
  players: Wallet[];
}

/**
 * Load all wallets from MNEMONIC in .env
 */
export function loadWallets(): Wallets {
  const mnemonic = env.MNEMONIC;

  if (!mnemonic) {
    throw new Error('MNEMONIC is required - run `bun run prepare` first');
  }

  const walletArray = WALLET_NAMES.map((name, index) => {
    const account = mnemonicToAccount(mnemonic, { accountIndex: index });
    const client = createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    });

    // Generate ephemeral session keypair for ClearNode operations
    const sessionKeypair = generateSessionKeypair();

    return {
      name,
      index,
      account,
      client,
      address: account.address,
      sessionPrivateKey: sessionKeypair.privateKey,
      sessionAddress: sessionKeypair.address,
    };
  });

  // Create object with named properties
  return {
    master: walletArray[0]!,
    alice: walletArray[1]!,
    bob: walletArray[2]!,
    charlie: walletArray[3]!,
    diana: walletArray[4]!,
    eve: walletArray[5]!,
    server: walletArray[6]!,
    all: walletArray,
    players: [walletArray[1]!, walletArray[2]!, walletArray[3]!, walletArray[4]!, walletArray[5]!],
  };
}

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
