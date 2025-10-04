import { mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import type { Account, WalletClient, Chain, Transport, ParseAccount, PublicClient, Address } from 'viem';
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
  'Test',      // index 8 - Test wallet (clean slate for e2e tests)
  'Test2',     // index 9 - Test2 wallet (clean slate for e2e tests)
  'Test3',     // index 10 - Test3 wallet (clean slate for e2e tests)
  'Test4',     // index 11 - Test4 wallet (clean slate for e2e tests)
  'Test5',     // index 12 - Test5 wallet (clean slate for e2e tests)
  'Test6',     // index 13 - Test6 wallet (clean slate for e2e tests)
  'Test7',     // index 14 - Test7 wallet (clean slate for e2e tests)
  'Test8',     // index 15 - Test8 wallet (clean slate for e2e tests)
  'Test9',     // index 16 - Test9 wallet (clean slate for e2e tests)
  'Test10',    // index 17 - Test10 wallet (clean slate for e2e tests)
] as const;

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
  test: Wallet;
  test2: Wallet;
  test3: Wallet;
  test4: Wallet;
  test5: Wallet;
  test6: Wallet;
  test7: Wallet;
  test8: Wallet;
  test9: Wallet;
  test10: Wallet;
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
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    });
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(),
    });

    // Generate ephemeral session keypair for ClearNode operations
    const sessionKeypair = generateSessionKeypair();

    return {
      name,
      index,
      account,
      walletClient,
      publicClient,
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
    test: walletArray[8]!,
    test2: walletArray[9]!,
    test3: walletArray[10]!,
    test4: walletArray[11]!,
    test5: walletArray[12]!,
    test6: walletArray[13]!,
    test7: walletArray[14]!,
    test8: walletArray[15]!,
    test9: walletArray[16]!,
    test10: walletArray[17]!,
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
