import { createBetterNitroliteClient } from "./better-nitrolite";
import { loadWallets } from "./utils/wallets";
import { expect } from "bun:test";
import { describe, it } from "bun:test";


describe('BetterNitrolite', () => {
  it('should be able to get balances', async () => {
    const wallets = loadWallets();
    const client = createBetterNitroliteClient({ wallet: wallets.test17 });
    await client.connect();
    const balances = await client.getBalances();
    expect(balances).toBeDefined();
    console.log(`Balances:`, balances);
    await client.disconnect();
  });

  it('should be able to deposit', async () => {
    const wallets = loadWallets();
    const client = createBetterNitroliteClient({ wallet: wallets.test17 });
    await client.connect();
    await client.deposit(100n);
    await client.deposit(100n);
    await client.deposit(100n);
    await client.deposit(100n);
    // await client.deposit(100n);
    // await client.deposit(100n);
    const balances = await client.getBalances();
    expect(balances).toBeDefined();
    console.log(`Balances:`, balances);
    await client.disconnect();
  }, 200000);
});