export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
  clearNodeUrl: 'ws://localhost:8000/ws', // Local ClearNode

  contracts: {
    custody: '0x019B65A265EB3363822f2752141b3dF16131b262' as const, // Latest: 2025-08-27
    adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as const, // Latest: 2025-08-27
    tokenAddress: '0x0000000000000000000000000000000000000000' as const, // Native ETH
    // ClearNode broker address (Master wallet - has balance on Sepolia)
    // Derived from mnemonic index 0: 0x0af8bef0c6b3d7b0058d201b0b61deafa633442d1052e8c2fdc050a382f847ff
    brokerAddress: '0x71DB80a0eaB6Ef826B95acB29a5E8E86e9a95cF9' as const,
  },

  funding: {
    masterAmount: '0.5',      // Fund master with 0.5 ETH from faucet
    distributionAmount: '0.08', // Each wallet gets 0.08 ETH
  },

  game: {
    asset: 'ETH',
    channelDeposit: '0.01',   // Channel deposit: 0.01 ETH (~100 games worth)
    entryFee: '0.0001',       // 0.0001 ETH per player (testing amount)
    prizePool: '0.0005',      // 5 × 0.0001 ETH
    maxPlayers: 5,
    rounds: 3,
    commitTimeoutMs: 5000,
    revealTimeoutMs: 10000,
  },
} as const;
