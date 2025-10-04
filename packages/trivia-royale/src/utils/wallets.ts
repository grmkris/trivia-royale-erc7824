import { mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import type { Account, WalletClient, Chain, Transport, ParseAccount } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { env } from '../env';
import { generateSessionKeypair } from './keyManager';

const WALLET_NAMES = [
  'Funding',   // index 0 - Funding source (receives from faucets, distributes to all)
  'Broker',    // index 1 - ClearNode broker (state channel counterparty)
  'Server',    // index 2 - Game server (controls game flow)
  'Alice',     // index 3 - Player
  'Bob',       // index 4 - Player
  'Charlie',   // index 5 - Player
  'Diana',     // index 6 - Player
  'Eve',       // index 7 - Player
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
  funding: Wallet;
  broker: Wallet;
  server: Wallet;
  alice: Wallet;
  bob: Wallet;
  charlie: Wallet;
  diana: Wallet;
  eve: Wallet;
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
    funding: walletArray[0]!,
    broker: walletArray[1]!,
    server: walletArray[2]!,
    alice: walletArray[3]!,
    bob: walletArray[4]!,
    charlie: walletArray[5]!,
    diana: walletArray[6]!,
    eve: walletArray[7]!,
    all: walletArray,
    players: [walletArray[3]!, walletArray[4]!, walletArray[5]!, walletArray[6]!, walletArray[7]!],
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
