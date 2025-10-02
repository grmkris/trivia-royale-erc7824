import { mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import type { Account, WalletClient, Chain, Transport, ParseAccount } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

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
}

/**
 * Load all wallets from MNEMONIC in .env
 */
export function loadWallets(): Wallet[] {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error('MNEMONIC not found in .env - run `bun run prepare` first');
  }

  return WALLET_NAMES.map((name, index) => {
    const account = mnemonicToAccount(mnemonic, { accountIndex: index });
    const client = createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    });

    return {
      name,
      index,
      account,
      client,
      address: account.address,
    };
  });
}

/**
 * Get specific wallet by name
 */
export function getWallet(wallets: Wallet[], name: string): Wallet {
  const wallet = wallets.find(w => w.name === name);
  if (!wallet) {
    throw new Error(`Wallet ${name} not found`);
  }
  return wallet;
}

/**
 * Get master wallet (funding source)
 */
export function getMasterWallet(wallets: Wallet[]): Wallet {
  return getWallet(wallets, 'Master');
}

/**
 * Get player wallets (Alice, Bob, Charlie, Diana, Eve)
 */
export function getPlayerWallets(wallets: Wallet[]): Wallet[] {
  return wallets.filter(w =>
    ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'].includes(w.name)
  );
}

/**
 * Get server wallet
 */
export function getServerWallet(wallets: Wallet[]): Wallet {
  return getWallet(wallets, 'Server');
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
