import { NitroliteClient, WalletStateSigner, getChannelId } from '@erc7824/nitrolite';
import { SessionKeyStateSigner } from '@erc7824/nitrolite/dist/client/signer';
import { parseEther } from 'viem';
import { SEPOLIA_CONFIG } from './contracts';
import { createPublicRpcClient, type Wallet } from './wallets';

/**
 * Create NitroliteClient for a wallet
 *
 * Uses SessionKeyStateSigner to sign states with the wallet's session key.
 * This matches ClearNode's expectation that states are signed by the session key
 * address provided during authentication and channel creation.
 */
export function createNitroliteClient(
  playerWallet: Wallet,
  serverAddress: `0x${string}`
): NitroliteClient {
  const publicClient = createPublicRpcClient();

  // Use session key for state signing (matches SDK integration tests pattern)
  const stateSigner = new SessionKeyStateSigner(playerWallet.sessionPrivateKey);

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
 */
export async function findChannel(
  playerAddress: `0x${string}`,
  serverAddress: `0x${string}`,
  playerNitroliteClient: NitroliteClient,
): Promise<string | null> {
  try {
    const publicClient = createPublicRpcClient();

    // Get all open channels for the player
    const channelIds = await playerNitroliteClient.getOpenChannels();

    // Check each channel to see if it's between player and server
    for (const channelId of channelIds) {
      const channelData = await playerNitroliteClient.getChannelData(channelId);
      const participants = channelData.channel.participants;

      // Check if both player and server are participants
      const hasPlayer = participants.some(
        (addr) => addr.toLowerCase() === playerAddress.toLowerCase()
      );
      const hasServer = participants.some(
        (addr) => addr.toLowerCase() === serverAddress.toLowerCase()
      );

      if (hasPlayer && hasServer) {
        return channelId;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding channel:', error);
    return null;
  }
}

/**
 * Create channel for player → server
 */
export async function createChannel(
  playerWallet: Wallet,
  serverWallet: Wallet,
  amount: string
): Promise<string> {
  const playerClient = createNitroliteClient(playerWallet, serverWallet.address);
  const serverClient = createNitroliteClient(serverWallet, playerWallet.address);
  const amountWei = parseEther(amount);

  console.log(`  💰 ${playerWallet.name}: Depositing ${amount} ETH...`);

  // Build channel parameters
  const channelParams = {
    participants: [playerWallet.address, serverWallet.address],
    adjudicator: SEPOLIA_CONFIG.contracts.adjudicator,
    challenge: 3600n,
    nonce: BigInt(Date.now()),
  };

  // Build unsigned initial state
  const unsignedInitialState = {
    intent: 1, // INITIALIZE
    version: 0n,
    data: '0x' as const,
    allocations: [
      {
        destination: playerWallet.address,
        token: SEPOLIA_CONFIG.contracts.tokenAddress,
        amount: amountWei,
      },
      {
        destination: serverWallet.address,
        token: SEPOLIA_CONFIG.contracts.tokenAddress,
        amount: 0n,
      },
    ],
  };

  // Compute channel ID
  const channelId = getChannelId(channelParams, SEPOLIA_CONFIG.chainId);

  // Server signs the initial state
  // Convert unsigned state to State with empty sigs for signing
  const stateToSign = {
    ...unsignedInitialState,
    sigs: [] as `0x${string}`[],
  };

  const serverSigner = new WalletStateSigner(serverWallet.client);
  const serverSignature = await serverSigner.signState(
    channelId,
    stateToSign
  );

  // Player creates channel with server's signature
  const result = await playerClient.depositAndCreateChannel(
    SEPOLIA_CONFIG.contracts.tokenAddress,
    amountWei,
    {
      channel: channelParams,
      unsignedInitialState,
      serverSignature,
    }
  );

  console.log(`  ✅ ${playerWallet.name}: Channel created (${result.channelId.slice(0, 10)}...)`);
  return result.channelId;
}

/**
 * Ensure channel exists, create if needed
 */
export async function ensureChannel(
  props: {
    playerNitroliteClient: NitroliteClient,
  playerWallet: Wallet,
  serverWallet: Wallet,
  amount: string
  }
): Promise<string> {
  const { playerNitroliteClient, playerWallet, serverWallet, amount } = props;
  // Check existing
  const existing = await findChannel(playerWallet.address, serverWallet.address, playerNitroliteClient);

  if (existing) {
    console.log(`  ✅ ${playerWallet.name}: Channel exists (${existing.slice(0, 10)}...)`);
    return existing;
  }

  // Create new
  return createChannel(playerWallet, serverWallet, amount);
}
