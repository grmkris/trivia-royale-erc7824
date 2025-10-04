/**
 * End-to-End Flow - Money Tracking with State History
 *
 * Demonstrates complete flow with proof state tracking:
 * 1. Channel creation (record initial state)
 * 2. Game play via app sessions (record game states)
 * 3. Check balances (ledger vs channel)
 * 4. Resize channel (allocate ledger → channel, using proofs)
 * 5. Close channel (using proofs)
 * 6. Withdraw (custody → wallet)
 *
 * Usage: bun run e2e-flow
 */

import { loadWallets, createPublicRpcClient, type Wallet } from './utils/wallets';
import { SEPOLIA_CONFIG } from './utils/contracts';
import { connectToClearNode, authenticateClearNode } from './yellow-integration';
import {
  getLedgerBalances,
  getChannelWithBroker,
  createChannelViaRPC,
  transferViaLedger,
} from './utils/clearnode';
import { getUSDCBalance, formatUSDC, parseUSDC } from './utils/erc20';
import { createNitroliteClient } from './utils/channels';
import {
  createStateTracker,
  createFileSystemStorage,
  type StateTracker,
} from './utils/state-tracker';
import type { Hex, Address, WalletClient } from 'viem';
import type { State } from '@erc7824/nitrolite';
import { createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createMessageSigner } from './yellow-integration';
import {
  createResizeChannelMessage,
  createCloseChannelMessage,
  parseResizeChannelResponse,
  parseCloseChannelResponse,
  parseAnyRPCResponse,
  RPCMethod,
} from '@erc7824/nitrolite';

/**
 * Step 1: Check or create channel
 */
async function ensureChannel(
  ws: WebSocket,
  wallet: Wallet,
  tracker: StateTracker
): Promise<Hex> {
  console.log('\n🔗 STEP 1: Ensure Channel\n');

   let channelId = await getChannelWithBroker(
     ws,
     wallet,
     SEPOLIA_CONFIG.contracts.brokerAddress as Address
   );

  

  if (channelId) {
    console.log(`   ✅ Found existing channel ${channelId.slice(0, 10)}...\n`);

    // Get current state from blockchain
    const nitroliteClient = createNitroliteClient(
      wallet,
      SEPOLIA_CONFIG.contracts.brokerAddress as Address
    );
    const channelData = await nitroliteClient.getChannelData(channelId);

    // Record the last known state
    tracker.recordState(channelId, channelData.lastValidState);
  } else {
    console.log(`   ⏳ Creating new channel...\n`);
    channelId = await createChannelViaRPC(
      ws,
      wallet,
      SEPOLIA_CONFIG.game.channelDeposit
    );
    console.log(`   ✅ Channel created ${channelId.slice(0, 10)}...\n`);

    // Get and record initial state
    const nitroliteClient = createNitroliteClient(
      wallet,
      SEPOLIA_CONFIG.contracts.brokerAddress as Address
    );
    const channelData = await nitroliteClient.getChannelData(channelId);
    tracker.recordState(channelId, channelData.lastValidState);
  }

  return channelId;
}

/**
 * Step 2: Check all balances
 */
async function checkBalances(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex
): Promise<{
  walletBalance: bigint;
  ledgerBalance: string;
  custodyBalance: bigint;
  channelBalance: bigint;
}> {
  console.log('\n💰 STEP 2: Check Balances\n');

  const publicClient = createPublicRpcClient();
  const nitroliteClient = createNitroliteClient(
    wallet,
    SEPOLIA_CONFIG.contracts.brokerAddress as Address
  );

  const walletBalance = await getUSDCBalance(wallet, wallet.address);
  const ledgerBalances = await getLedgerBalances(ws, wallet);
  const ledgerBalance =
    ledgerBalances.find((b) => b.asset === SEPOLIA_CONFIG.game.asset)?.amount ||
    '0';
  const custodyBalance = await nitroliteClient.getAccountBalance(
    SEPOLIA_CONFIG.contracts.tokenAddress as Address
  );
  const channelBalance = await nitroliteClient.getChannelBalance(
    channelId,
    SEPOLIA_CONFIG.contracts.tokenAddress as Address
  );

  console.log(`   Wallet:  ${formatUSDC(walletBalance)} USDC (on-chain)`);
  console.log(`   Ledger:  ${ledgerBalance} USDC (off-chain with ClearNode)`);
  console.log(`   Custody: ${formatUSDC(custodyBalance)} USDC (on-chain escrow)`);
  console.log(`   Channel: ${formatUSDC(channelBalance)} USDC (locked in channel)\n`);

  return { walletBalance, ledgerBalance, custodyBalance, channelBalance };
}

/**
 * Step 2.5: Simulate Alice sending money to another wallet (via ledger transfer)
 */
async function simulateTransfer(
  aliceWs: WebSocket,
  alice: Wallet,
  toAddress: Address
): Promise<void> {
  console.log('\n💸 STEP 2.5: Simulate Transfer (Alice → Test8)\n');

  await transferViaLedger(
    aliceWs,
    alice,
    toAddress,
    '0.3',  // Alice sends 0.3 USDC
    SEPOLIA_CONFIG.game.asset
  );

  console.log(`   ✅ Alice sent 0.3 USDC to ${toAddress.slice(0, 10)}... (ledger balance updated)\n`);
}

/**
 * Step 3: Resize channel if needed (allocate ledger → channel)
 */
async function resizeIfNeeded(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex,
  ledgerBalance: string,
  channelBalance: bigint,
  tracker: StateTracker
): Promise<void> {
  const ledgerBalanceWei = parseUSDC(ledgerBalance);
  const extraFunds = ledgerBalanceWei - channelBalance;

  if (extraFunds <= 0n) {
    console.log('\n📏 STEP 3: Resize Channel - SKIPPED (no extra funds)\n');
    return;
  }

  console.log('\n📏 STEP 3: Resize Channel\n');

  const extraUSDC = formatUSDC(extraFunds);
  console.log(`   Need to allocate ${extraUSDC} USDC from ledger to channel\n`);

  // Get proof states
  const proofStates = tracker.getProofStates(channelId);
  console.log(`   📚 Using ${proofStates.length} proof state(s)\n`);

  const nitroliteClient = createNitroliteClient(
    wallet,
    SEPOLIA_CONFIG.contracts.brokerAddress as Address
  );

  // Request resize from ClearNode
  const sessionSigner = createMessageSigner(
    createWalletClient({
      account: privateKeyToAccount(wallet.sessionPrivateKey),
      chain: sepolia,
      transport: http(),
    })
  );

  const resizeMessage = await createResizeChannelMessage(sessionSigner, {
    channel_id: channelId,
    resize_amount: -extraFunds,
    allocate_amount: -extraFunds,
    funds_destination: wallet.address,
  });

  const resizeResponse = await new Promise<any>((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const response = parseAnyRPCResponse(event.data);
        if (response.method === RPCMethod.ResizeChannel) {
          ws.removeEventListener('message', handleMessage);
          resolve(parseResizeChannelResponse(event.data));
        } else if (response.method === RPCMethod.Error) {
          ws.removeEventListener('message', handleMessage);
          reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
        }
      } catch (err) {
        // Ignore parsing errors
      }
    };

    ws.addEventListener('message', handleMessage);
    ws.send(resizeMessage);

    setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      reject(new Error('Timeout waiting for resize response'));
    }, 30000);
  });

  console.log(`   ✅ Got resize state from ClearNode (v${resizeResponse.params.state.version})\n`);

  console.log({
    msg: 'resizeResponse',
    proofStates,

  });

  // Submit resize transaction with proof states
  const txHash = await nitroliteClient.resizeChannel({
    resizeState: {
      channelId: resizeResponse.params.channelId as Hex,
      intent: resizeResponse.params.state.intent,
      version: BigInt(resizeResponse.params.state.version),
      data: resizeResponse.params.state.stateData as Hex,
      allocations: resizeResponse.params.state.allocations,
      serverSignature: resizeResponse.params.serverSignature,
    },
    proofStates,
  });

  console.log(`   📤 Resize tx submitted: ${txHash.slice(0, 10)}...`);

  const publicClient = createPublicRpcClient();
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`   ✅ Resize confirmed!\n`);

  // Record the new state
  const newChannelData = await nitroliteClient.getChannelData(channelId);
  tracker.recordState(channelId, newChannelData.lastValidState);
}

/**
 * Step 4: Close channel
 */
async function closeChannel(
  ws: WebSocket,
  wallet: Wallet,
  channelId: Hex,
  tracker: StateTracker
): Promise<void> {
  console.log('\n🔒 STEP 4: Close Channel\n');

  // Request close from ClearNode
  const sessionSigner = createMessageSigner(
    createWalletClient({
      account: privateKeyToAccount(wallet.sessionPrivateKey),
      chain: sepolia,
      transport: http(),
    })
  );

  const closeMessage = await createCloseChannelMessage(
    sessionSigner,
    channelId,
    wallet.address
  );

  const closeResponse = await new Promise<any>((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const response = parseAnyRPCResponse(event.data);
        if (response.method === RPCMethod.CloseChannel) {
          ws.removeEventListener('message', handleMessage);
          resolve(parseCloseChannelResponse(event.data));
        } else if (response.method === RPCMethod.Error) {
          ws.removeEventListener('message', handleMessage);
          reject(new Error(`ClearNode error: ${JSON.stringify(response.params)}`));
        }
      } catch (err) {
        // Ignore parsing errors
      }
    };

    ws.addEventListener('message', handleMessage);
    ws.send(closeMessage);

    setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      reject(new Error('Timeout waiting for close response'));
    }, 30000);
  });

  console.log(`   ✅ Got close state from ClearNode (v${closeResponse.params.state.version})\n`);

  // Submit close transaction (no proof states needed for close!)
  const nitroliteClient = createNitroliteClient(
    wallet,
    SEPOLIA_CONFIG.contracts.brokerAddress as Address
  );

  const txHash = await nitroliteClient.closeChannel({
    finalState: {
      channelId: closeResponse.params.channelId as Hex,
      intent: closeResponse.params.state.intent,
      version: BigInt(closeResponse.params.state.version),
      data: closeResponse.params.state.stateData as Hex,
      allocations: closeResponse.params.state.allocations,
      serverSignature: closeResponse.params.serverSignature,
    },
    stateData: closeResponse.params.state.stateData as Hex,
  });

  console.log(`   📤 Close tx submitted: ${txHash.slice(0, 10)}...`);

  const publicClient = createPublicRpcClient();
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`   ✅ Channel closed!\n`);
}

/**
 * Step 5: Withdraw from custody
 */
async function withdraw(wallet: Wallet): Promise<void> {
  console.log('\n💸 STEP 5: Withdraw from Custody\n');

  const nitroliteClient = createNitroliteClient(
    wallet,
    SEPOLIA_CONFIG.contracts.brokerAddress as Address
  );

  const custodyBalance = await nitroliteClient.getAccountBalance(
    SEPOLIA_CONFIG.contracts.tokenAddress as Address
  );

  if (custodyBalance === 0n) {
    console.log(`   ℹ️  No funds in custody to withdraw\n`);
    return;
  }

  console.log(`   Withdrawing ${formatUSDC(custodyBalance)} USDC...\n`);

  const txHash = await nitroliteClient.withdrawal(
    SEPOLIA_CONFIG.contracts.tokenAddress as Address,
    custodyBalance
  );

  console.log(`   📤 Withdraw tx submitted: ${txHash.slice(0, 10)}...`);

  const publicClient = createPublicRpcClient();
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`   ✅ Withdrawal complete!\n`);
}

/**
 * Main flow
 */
async function main() {
  console.log('\n🎮 TRIVIA ROYALE - End-to-End Flow\n');

  const wallets = loadWallets();
  const test10 = wallets.test10;  // Using clean test10 wallet!
  const alice = wallets.alice;  // Alice will send money to test10

  console.log(`Using test10 wallet: ${test10.address}`);
  console.log(`Using Alice wallet: ${alice.address}\n`);

  // Create state tracker with filesystem storage (persists across runs)
  const tracker = createStateTracker(createFileSystemStorage('.state-tracker'));

  // Connect BOTH test10 and Alice to ClearNode
  console.log('🔗 Connecting to ClearNode...\n');
  const test10Ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
  await authenticateClearNode(test10Ws, test10);

  const aliceWs = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
  await authenticateClearNode(aliceWs, alice);

  // withdraw 0.3 USDC from test10
  await withdraw(test10);

  return

  try {
    // Step 1: Ensure channel exists
    const channelId = await ensureChannel(test10Ws, test10, tracker);

    // Step 2: Check initial balances
    const initialBalances = await checkBalances(test10Ws, test10, channelId);

    // Step 2.5: Simulate Alice → test10 transfer
    await simulateTransfer(aliceWs, alice, test10.address);

    // Check balances after transfer (ledger should show +0.3 USDC)
    const afterTransfer = await checkBalances(test10Ws, test10, channelId);

    // Step 3: Resize if needed (allocate extra ledger funds → channel)
    await resizeIfNeeded(
      test10Ws,
      test10,
      channelId,
      afterTransfer.ledgerBalance,
      afterTransfer.channelBalance,
      tracker
    );

    // Print state history
    tracker.printStateHistory(channelId);

    // Step 4: Close channel
    await closeChannel(test10Ws, test10, channelId, tracker);

    // Step 5: Withdraw
    await withdraw(test10);

    // Final balances
    const finalWalletBalance = await getUSDCBalance(test10, test10.address);
    console.log(`\n🎉 COMPLETE!\n`);
    console.log(`   Initial wallet: ${formatUSDC(initialBalances.walletBalance)} USDC`);
    console.log(`   Final wallet:   ${formatUSDC(finalWalletBalance)} USDC`);
    console.log(`   Profit:         ${formatUSDC(finalWalletBalance - initialBalances.walletBalance)} USDC\n`);
  } finally {
    test10Ws.close();
    aliceWs.close();
  }
}

main().catch(console.error);
