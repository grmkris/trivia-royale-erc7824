import { createBetterNitroliteClient } from "./better-nitrolite";
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

  it.only('should handle complete flow: deposit, receive, withdraw', async () => {
    const wallets = loadWallets();

    // Use test10 as main wallet (should have funds)
    // Use alice as sender (should have channel and can send)
    const testWallet = wallets.test32;
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
});