import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import { parseEther } from 'viem';
import { SEPOLIA_CONFIG } from './contracts';
import { createPublicRpcClient, type Wallet } from './wallets';

/**
 * Create NitroliteClient for a wallet
 */
export function createNitroliteClient(
  playerWallet: Wallet,
  serverAddress: `0x${string}`
): NitroliteClient {
  const publicClient = createPublicRpcClient();

  const stateSigner = new WalletStateSigner(playerWallet.client);
  return new NitroliteClient({
    publicClient,
    walletClient: playerWallet.client,
    stateSigner,
    challengeDuration: 3600n,
    addresses: {
      custody: SEPOLIA_CONFIG.contracts.custody,
      adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
      guestAddress: serverAddress,
    },
    chainId: SEPOLIA_CONFIG.chainId,
  });
}

/**
 * Check if channel exists between player and server
 * TODO: Implement actual channel lookup logic
 */
export async function findChannel(
  playerAddress: `0x${string}`,
  serverAddress: `0x${string}`
): Promise<string | null> {
  // Query contract for existing channel
  // Return channelId or null
  // For now, return null (will always create new channels)
  return null;
}

/**
 * Create channel for player → server
 */
export async function createChannel(
  playerWallet: Wallet,
  serverAddress: `0x${string}`,
  amount: string
): Promise<string> {
  const client = createNitroliteClient(playerWallet, serverAddress);
  const amountWei = parseEther(amount);

  console.log(`  💰 ${playerWallet.name}: Depositing ${amount} ETH...`);

  const { channelId } = await client.depositAndCreateChannel(SEPOLIA_CONFIG.contracts.tokenAddress, amountWei, {
    channel: {
      participants: [playerWallet.address, serverAddress],
      adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
      challenge: 3600n,
      nonce: BigInt(Date.now()),
    },
    unsignedInitialState: {
      intent: 1, // INITIALIZE
      version: 0n,
      data: '0x',
      allocations: [
        {
          destination: playerWallet.address,
          token: SEPOLIA_CONFIG.contracts.tokenAddress,
          amount: amountWei,
        },
        {
          destination: serverAddress,
          token: SEPOLIA_CONFIG.contracts.tokenAddress,
          amount: 0n,
        },
      ],
    },
    serverSignature: '0x',
  });

  console.log(`  ✅ ${playerWallet.name}: Channel created (${channelId.slice(0, 10)}...)`);
  return channelId;
}

/**
 * Ensure channel exists, create if needed
 */
export async function ensureChannel(
  playerWallet: Wallet,
  serverWallet: Wallet,
  amount: string
): Promise<string> {
  // Check existing
  const existing = await findChannel(playerWallet.address, serverWallet.address);

  if (existing) {
    console.log(`  ✅ ${playerWallet.name}: Channel exists (${existing.slice(0, 10)}...)`);
    return existing;
  }

  // Create new
  return createChannel(playerWallet, serverWallet.address, amount);
}
