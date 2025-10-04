import { createBetterNitroliteClient } from "./better-nitrolite";
import { loadWallets } from "./utils/wallets";
import { expect } from "bun:test";
import { describe, it } from "bun:test";


describe('BetterNitrolite', () => {
  it('should be able to get balances', async () => {
    const wallets = loadWallets();
    for (const wallet of Object.values(wallets)) {
      if (!wallet.name) continue;
      console.log(`Getting balances for ${wallet.name}`);
      const client = createBetterNitroliteClient({ wallet });
      await client.connect();
      const balances = await client.getBalances();
      expect(balances).toBeDefined();
      console.log(`Balances:`, balances);
    }
  });
});