import { createBetterNitroliteClient, type MessageSchema } from "./better-nitrolite";
import { loadWallets } from "./utils/wallets";
import { expect } from "bun:test";
import { describe, it } from "bun:test";
// Import needed utilities
import { formatUSDC } from "./utils/erc20";

describe('BetterNitrolite', () => {
  it('should be able to get balances', async () => {
    const wallets = loadWallets();
    const client = createBetterNitroliteClient({ wallet: wallets.test18 });
    await client.connect();
    const balances = await client.getBalances();
    expect(balances).toBeDefined();
    console.log(`Balances:`, balances);
    await client.disconnect();
  });

  it('should handle complete flow: deposit, receive, withdraw', async () => {
    const wallets = loadWallets();

    // Use test10 as main wallet (should have funds)
    // Use alice as sender (should have channel and can send)
    const testWallet = wallets.test33;
    const sender = wallets.alice;


    // Create client for test wallet
    const testClient = createBetterNitroliteClient({ wallet: testWallet });
    const senderClient = createBetterNitroliteClient({ wallet: sender });

    try {
      console.log('\n🎮 BetterNitrolite - Complete Flow Test\n');
      console.log(`Test wallet: ${testWallet.address}`);
      console.log(`Sender wallet: ${sender.address}\n`);

      // Step 1: Connect and check initial state
      console.log('📊 STEP 1: Connect and check initial balances\n');
      await testClient.connect();
      await senderClient.connect();

      const senderBalances = await senderClient.getBalances();
      const testBalances = await testClient.getBalances();
      console.log('Initial test wallet balances:', {
        wallet: formatUSDC(testBalances.wallet),
        custody: formatUSDC(testBalances.custodyContract),
        channel: formatUSDC(testBalances.channel),
        ledger: formatUSDC(testBalances.ledger)
      });
      console.log('Initial sender wallet balances:', {
        wallet: formatUSDC(senderBalances.wallet),
        custody: formatUSDC(senderBalances.custodyContract),
        channel: formatUSDC(senderBalances.channel),
        ledger: formatUSDC(senderBalances.ledger)
      });

      // Step 2: Deposit to create/ensure channel for sender and test wallet
      if(senderBalances.channel === 0n && senderBalances.wallet >= 1000n) {
        await senderClient.deposit(1000n);
        console.log(`Deposited 1000 USDC to sender wallet`);
      } else {
        console.log('Sender wallet already has funds, skipping deposit');
      }
      if(testBalances.channel === 0n && testBalances.wallet >= 1000n) {
        await testClient.deposit(1000n);
        console.log(`Deposited 1000 USDC to test wallet`);
      } else {
        console.log('Test wallet already has funds, skipping deposit');
      }

      // Step 3: Simulate receiving payment (sender → test wallet via ledger)
      console.log('\n💸 STEP 3: Receive payment from sender\n');

      const paymentAmount = 300n; // 300 micro-USDC
      await senderClient.send({ to: testWallet.address, amount: paymentAmount });
      console.log(`Received ${paymentAmount} USDC from sender`);

      // Step 4: Check balances after receiving payment
      console.log('\n📊 STEP 4: Check balances after payment\n');

      const testAfterPayment = await testClient.getBalances();
      const senderAfterPayment = await senderClient.getBalances();
      console.log('After payment:', {
        wallet: formatUSDC(testAfterPayment.wallet),
        custody: formatUSDC(testAfterPayment.custodyContract),
        channel: formatUSDC(testAfterPayment.channel),
        ledger: formatUSDC(testAfterPayment.ledger)
      });

      console.log('Sender after payment:', {
        wallet: formatUSDC(senderAfterPayment.wallet),
        custody: formatUSDC(senderAfterPayment.custodyContract),
        channel: formatUSDC(senderAfterPayment.channel),
        ledger: formatUSDC(senderAfterPayment.ledger)
      });

      // Verify ledger balance increased
      expect(testAfterPayment.ledger).toBeGreaterThan(testBalances.ledger);
      console.log(`✅ Ledger balance increased by ${formatUSDC(testAfterPayment.ledger - testBalances.ledger)} USDC`);

      // Step 5: Withdraw everything
      console.log('\n💸 STEP 5: Withdraw all funds\n');

      const totalAvailable = testAfterPayment.channel + testAfterPayment.ledger + testAfterPayment.custodyContract;

      if (totalAvailable > 0n) {
        const walletBefore = testAfterPayment.wallet;
        console.log(`Withdrawing ${formatUSDC(totalAvailable)} USDC...`);

        await testClient.withdraw(totalAvailable);

        // Step 6: Verify withdrawal
        console.log('\n✅ STEP 6: Verify withdrawal\n');

        const finalTestBalances = await testClient.getBalances();
        const finalSenderBalances = await senderClient.getBalances();
        console.log('Final balances:', {
          wallet: formatUSDC(finalTestBalances.wallet),
          custody: formatUSDC(finalTestBalances.custodyContract),
          channel: formatUSDC(finalTestBalances.channel),
          ledger: formatUSDC(finalTestBalances.ledger)
        });

        // Verify wallet balance increased
        expect(finalTestBalances.wallet).toBeGreaterThan(walletBefore);
        console.log(`✅ Wallet increased from ${formatUSDC(walletBefore)} to ${formatUSDC(finalTestBalances.wallet)}`);
        console.log(`✅ Net gain: ${formatUSDC(finalTestBalances.wallet - walletBefore)} USDC`);
      } else {
        console.log('No funds available to withdraw');
      }

    } finally {
      // Cleanup
      console.log('\n🔌 Disconnecting...');
      await testClient.disconnect();
      await senderClient.disconnect();
    }
  }, 200000);


  it('should create session with distributed signatures', async () => {
    const wallets = loadWallets();

    // Create multiple clients (simulating players)
    const player1 = wallets.test24;
    const player2 = wallets.test25;
    const server = wallets.server;

    console.log('\n🎮 Testing Distributed Session Creation\n');
    console.log(`Server: ${server.address}`);
    console.log(`Player 1: ${player1.address}`);
    console.log(`Player 2: ${player2.address}\n`);

    // Define message schema for game
    interface GameSchema extends MessageSchema {
      start_game: {
        data: { round: number };
      };
      ping: {
        data: { from: string; timestamp: number };
      };
      pong: {
        data: { from: string; replyTo: number };
      };
    }

    // Track session close notifications
    const closeNotifications: { client: string; sessionId: string }[] = [];

    // Track messages received by each client
    const messagesReceived: { client: string; type: string; from: string; data: any }[] = [];

    // Create clients for each participant
    const client1 = createBetterNitroliteClient<GameSchema>({
      wallet: player1,
      sessionAllowance: '0.00001',
      onAppMessage: async (type, sessionId, data) => {
        // Players only care about pings and game events, not pongs
        if (type === 'ping' || type === 'start_game') {
          console.log(`   📬 Player 1 received '${String(type)}' message from ${data.from?.slice(0, 10)}...`);
          messagesReceived.push({ client: 'player1', type: String(type), from: data.from, data });
        }

        // Auto-respond to ping with pong
        if (type === 'ping') {
          console.log(`   📤 Player 1 sending 'pong' response`);
          await client1.sendMessage(sessionId, 'pong', {
            from: player1.address,
            replyTo: data.timestamp,
          });
        }
      },
      onSessionClosed: (sessionId) => {
        console.log(`   📬 Player 1 received close notification for ${sessionId.slice(0, 10)}...`);
        closeNotifications.push({ client: 'player1', sessionId });
      },
    });

    const client2 = createBetterNitroliteClient<GameSchema>({
      wallet: player2,
      sessionAllowance: '0.00001',
      onAppMessage: async (type, sessionId, data) => {
        // Players only care about pings and game events, not pongs
        if (type === 'ping' || type === 'start_game') {
          console.log(`   📬 Player 2 received '${String(type)}' message from ${data.from?.slice(0, 10)}...`);
          messagesReceived.push({ client: 'player2', type: String(type), from: data.from, data });
        }

        // Auto-respond to ping with pong
        if (type === 'ping') {
          console.log(`   📤 Player 2 sending 'pong' response`);
          await client2.sendMessage(sessionId, 'pong', {
            from: player2.address,
            replyTo: data.timestamp,
          });
        }
      },
      onSessionClosed: (sessionId) => {
        console.log(`   📬 Player 2 received close notification for ${sessionId.slice(0, 10)}...`);
        closeNotifications.push({ client: 'player2', sessionId });
      },
    });

    const serverClient = createBetterNitroliteClient<GameSchema>({
      wallet: server,
      onAppMessage: async (type, sessionId, data) => {
        // Server only cares about pong responses, not its own pings/start_game
        if (type === 'pong') {
          console.log(`   📬 Server received '${String(type)}' message from ${data.from?.slice(0, 10)}...`);
          messagesReceived.push({ client: 'server', type: String(type), from: data.from, data });
        }
      },
      onSessionClosed: (sessionId) => {
        console.log(`   📬 Server received close notification for ${sessionId.slice(0, 10)}...`);
        closeNotifications.push({ client: 'server', sessionId });
      },
    });

    // Connect all clients
    console.log('🔗 Connecting all participants...\n');
    await Promise.all([
      client1.connect(),
      client2.connect(),
      serverClient.connect()
    ]);
    console.log('✅ All clients connected\n');

    // === DISTRIBUTED SESSION CREATION FLOW ===

    console.log('📝 Step 1: Server prepares session request\n');
    const sessionRequest = serverClient.prepareSession({
      participants: [player1.address, player2.address, server.address],
      allocations: [
        { participant: player1.address, asset: 'USDC', amount: '0.0000001' },
        { participant: player2.address, asset: 'USDC', amount: '0.0000001' },
        { participant: server.address, asset: 'USDC', amount: '0' },
      ],
    });

    console.log('   ✅ Session request prepared');
    // In real app: server would send sessionRequest via HTTP/WS to players
    // For test: we pass it directly

    console.log('✍️  Step 2: All participants sign the request\n');

    const [sig1, sig2, sigServer] = await Promise.all([
      client1.signSessionRequest(sessionRequest),
      client2.signSessionRequest(sessionRequest),
      serverClient.signSessionRequest(sessionRequest),
    ]);

    console.log(`   ✅ Player 1 signature: ${sig1.slice(0, 20)}...`);
    console.log(`   ✅ Player 2 signature: ${sig2.slice(0, 20)}...`);
    console.log(`   ✅ Server signature: ${sigServer.slice(0, 20)}...\n`);

    // In real app: players would send signatures back to server via HTTP/WS
    // Server collects them

    console.log('🎮 Step 3: Server creates session with all signatures\n');

    // IMPORTANT: Signature order must match createGameSessionWithMultiSig pattern:
    // 1. Server signature first
    // 2. Then player signatures in allocation order (only those with non-zero amounts)
    const sessionId = await serverClient.createSession(sessionRequest, [sigServer, sig1, sig2]);

    console.log(`   ✅ Session created: ${sessionId}\n`);

    // In real app: server would broadcast sessionId to all players
    // They would add it to their active sessions
    // For test: we manually add it

    client1.getActiveSessions(); // Would add sessionId
    client2.getActiveSessions();

    console.log('📨 Step 4: Exchange messages in session\n');

    // Now they can exchange typed messages
    await serverClient.sendMessage(sessionId, 'start_game', { round: 1, from: server.address });
    console.log('   📤 Server sent start_game message\n');

    // Check active sessions
    const activeSessions = serverClient.getActiveSessions();
    expect(activeSessions).toContain(sessionId);
    console.log(`   ✅ Active sessions: ${activeSessions.length}\n`);

    // Step 4a: Ping-Pong Test - Verify message broadcasting
    console.log('🏓 Step 4a: Ping-Pong Message Broadcasting Test\n');

    const pingTimestamp = Date.now();
    console.log(`   📤 Server sending 'ping' to all participants...`);
    await serverClient.sendMessage(sessionId, 'ping', {
      from: server.address,
      timestamp: pingTimestamp,
    });

    // Wait for responses to arrive
    console.log(`   ⏳ Waiting for responses...\n`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Analyze results
    console.log('📊 Message Flow Analysis:\n');

    const pings = messagesReceived.filter(m => m.type === 'ping');
    const pongs = messagesReceived.filter(m => m.type === 'pong');
    const startGames = messagesReceived.filter(m => m.type === 'start_game');

    console.log(`   Start Game messages: ${startGames.length}`);
    startGames.forEach(m => {
      console.log(`     - ${m.client} received from ${m.from.slice(0, 10)}...`);
    });

    console.log(`\n   Ping messages: ${pings.length}`);
    pings.forEach(m => {
      console.log(`     - ${m.client} received from ${m.from.slice(0, 10)}...`);
    });

    console.log(`\n   Pong messages: ${pongs.length}`);
    pongs.forEach(m => {
      console.log(`     - ${m.client} received from ${m.from.slice(0, 10)}...`);
    });

    console.log(`\n   Total messages exchanged: ${messagesReceived.length}\n`);

    // Verify broadcasting worked
    expect(pings.length).toBe(2); // Both players should receive the ping
    expect(pongs.length).toBe(2); // Server should receive both pongs
    console.log('   ✅ Message broadcasting verified!\n');

    // Step 5: Close the session
    console.log('🔒 Step 5: Close session\n');

    // In real app: server would determine final allocations based on game outcome
    // For test: return all funds to original owners
    const finalAllocations = [
      { participant: player1.address, asset: 'USDC', amount: '0.0000001' },
      { participant: player2.address, asset: 'USDC', amount: '0.0000001' },
      { participant: server.address, asset: 'USDC', amount: '0' },
    ];

    await serverClient.closeSession(sessionId, finalAllocations);
    console.log('   ✅ Session closed by server\n');

    // Wait a bit for close notifications to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify all clients received close notification
    console.log('📬 Verifying close notifications...\n');

    // Note: ClearNode currently only notifies the requester (server)
    // Players might not receive the notification unless ClearNode broadcasts it
    console.log(`   Received ${closeNotifications.length} notification(s):`);
    closeNotifications.forEach(n => {
      console.log(`     - ${n.client}: ${n.sessionId.slice(0, 10)}...`);
    });

    // Verify session is removed from server's active sessions
    const serverActiveSessions = serverClient.getActiveSessions();
    expect(serverActiveSessions).not.toContain(sessionId);
    console.log(`   ✅ Session removed from server's active sessions`);

    // Check player sessions
    const player1Sessions = client1.getActiveSessions();
    const player2Sessions = client2.getActiveSessions();

    if (closeNotifications.length === 3) {
      // All participants were notified - verify all cleaned up
      expect(player1Sessions).not.toContain(sessionId);
      expect(player2Sessions).not.toContain(sessionId);
      console.log(`   ✅ All participants cleaned up their sessions\n`);
    } else {
      // Only server was notified (current ClearNode behavior)
      console.log(`   ℹ️  Note: Only server was notified (ClearNode doesn't broadcast close events)\n`);
    }

    // Disconnect all
    console.log('🔌 Disconnecting all clients...');
    await Promise.all([
      client1.disconnect(),
      client2.disconnect(),
      serverClient.disconnect()
    ]);
    console.log('✅ Test complete\n');

    console.log('💡 Key Insight:');
    console.log('   Coordination happens outside the protocol (HTTP/WS/direct)');
    console.log('   BetterNitroliteClient provides pure functions for session lifecycle');
    console.log('   App developers choose their coordination mechanism\n');
  }, 60000);
});