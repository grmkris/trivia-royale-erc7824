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
  'Test11',    // index 18 - Test11 wallet (clean slate for e2e tests)
  'Test12',    // index 19 - Test12 wallet (clean slate for e2e tests)
  'Test13',    // index 20 - Test13 wallet (clean slate for e2e tests)
  'Test14',    // index 21 - Test14 wallet (clean slate for e2e tests)
  'Test15',    // index 22 - Test15 wallet (clean slate for e2e tests)
  'Test16',    // index 23 - Test16 wallet (clean slate for e2e tests)
  'Test17',    // index 24 - Test17 wallet (clean slate for e2e tests)
  'Test18',    // index 25 - Test18 wallet (clean slate for e2e tests)
  'Test19',    // index 26 - Test19 wallet (clean slate for e2e tests)
  'Test20',    // index 27 - Test20 wallet (clean slate for e2e tests)
  'Test21',    // index 28 - Test21 wallet (clean slate for e2e tests)
  'Test22',    // index 29 - Test22 wallet (clean slate for e2e tests)
  'Test23',    // index 30 - Test23 wallet (clean slate for e2e tests)
  'Test24',    // index 31 - Test24 wallet (clean slate for e2e tests)
  'Test25',    // index 32 - Test25 wallet (clean slate for e2e tests)
  'Test26',    // index 33 - Test26 wallet (clean slate for e2e tests)
  'Test27',    // index 34 - Test27 wallet (clean slate for e2e tests)
  'Test28',    // index 35 - Test28 wallet (clean slate for e2e tests)
  'Test29',    // index 36 - Test29 wallet (clean slate for e2e tests)
  'Test30',    // index 37 - Test30 wallet (clean slate for e2e tests)
  'Test31',    // index 38 - Test31 wallet (clean slate for e2e tests)
  'Test32',    // index 39 - Test32 wallet (clean slate for e2e tests)
  'Test33',    // index 40 - Test33 wallet (clean slate for e2e tests)
  'Test34',    // index 41 - Test34 wallet (clean slate for e2e tests)
  'Test35',    // index 42 - Test35 wallet (clean slate for e2e tests)
  'Test36',    // index 43 - Test36 wallet (clean slate for e2e tests)
  'Test37',    // index 44 - Test37 wallet (clean slate for e2e tests)
  'Test38',    // index 45 - Test38 wallet (clean slate for e2e tests)
  'Test39',    // index 46 - Test39 wallet (clean slate for e2e tests)
  'Test40',    // index 47 - Test40 wallet (clean slate for e2e tests)
  'Test41',    // index 48 - Test41 wallet (clean slate for e2e tests)
  'Test42',    // index 49 - Test42 wallet (clean slate for e2e tests)
  'Test43',    // index 50 - Test43 wallet (clean slate for e2e tests)
  'Test44',    // index 51 - Test44 wallet (clean slate for e2e tests)
  'Test45',    // index 52 - Test45 wallet (clean slate for e2e tests)
  'Test46',    // index 53 - Test46 wallet (clean slate for e2e tests)
  'Test47',    // index 54 - Test47 wallet (clean slate for e2e tests)
  'Test48',    // index 55 - Test48 wallet (clean slate for e2e tests)
  'Test49',    // index 56 - Test49 wallet (clean slate for e2e tests)
  'Test50',    // index 57 - Test50 wallet (clean slate for e2e tests)
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
  test11: Wallet;
  test12: Wallet;
  test13: Wallet;
  test14: Wallet;
  test15: Wallet;
  test16: Wallet;
  test17: Wallet;
  test18: Wallet;
  test19: Wallet;
  test20: Wallet;
  test21: Wallet;
  test22: Wallet;
  test23: Wallet;
  test24: Wallet;
  test25: Wallet;
  test26: Wallet;
  test27: Wallet;
  test28: Wallet;
  test29: Wallet;
  test30: Wallet;
  test31: Wallet;
  test32: Wallet;
  test33: Wallet;
  test34: Wallet;
  test35: Wallet;
  test36: Wallet;
  test37: Wallet;
  test38: Wallet;
  test39: Wallet;
  test40: Wallet;
  test41: Wallet;
  test42: Wallet;
  test43: Wallet;
  test44: Wallet;
  test45: Wallet;
  test46: Wallet;
  test47: Wallet;
  test48: Wallet;
  test49: Wallet;
  test50: Wallet;
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
    test11: walletArray[18]!,
    test12: walletArray[19]!,
    test13: walletArray[20]!,
    test14: walletArray[21]!,
    test15: walletArray[22]!,
    test16: walletArray[23]!,
    test17: walletArray[24]!,
    test18: walletArray[25]!,
    test19: walletArray[26]!,
    test20: walletArray[27]!,
    test21: walletArray[28]!,
    test22: walletArray[29]!,
    test23: walletArray[30]!,
    test24: walletArray[31]!,
    test25: walletArray[32]!,
    test26: walletArray[33]!,
    test27: walletArray[34]!,
    test28: walletArray[35]!,
    test29: walletArray[36]!,
    test30: walletArray[37]!,
    test31: walletArray[38]!,
    test32: walletArray[39]!,
    test33: walletArray[40]!,
    test34: walletArray[41]!,
    test35: walletArray[42]!,
    test36: walletArray[43]!,
    test37: walletArray[44]!,
    test38: walletArray[45]!,
    test39: walletArray[46]!,
    test40: walletArray[47]!,
    test41: walletArray[48]!,
    test42: walletArray[49]!,
    test43: walletArray[50]!,
    test44: walletArray[51]!,
    test45: walletArray[52]!,
    test46: walletArray[53]!,
    test47: walletArray[54]!,
    test48: walletArray[55]!,
    test49: walletArray[56]!,
    test50: walletArray[57]!,
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
