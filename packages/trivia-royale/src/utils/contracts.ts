export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
  clearNodeUrl: 'wss://clearnet.yellow.com/ws', // Yellow Network ClearNet

  contracts: {
    custody: '0x019B65A265EB3363822f2752141b3dF16131b262' as const, // Latest: 2025-08-27
    adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as const, // Latest: 2025-08-27
    tokenAddress: '0x0000000000000000000000000000000000000000' as const, // Native ETH
  },

  funding: {
    masterAmount: '0.5',      // Fund master with 0.5 ETH from faucet
    distributionAmount: '0.08', // Each wallet gets 0.08 ETH
  },

  game: {
    entryFee: '0.0001',       // 0.0001 ETH per player (testing amount)
    prizePool: '0.0005',      // 5 × 0.0001 ETH
    maxPlayers: 5,
    rounds: 3,
    commitTimeoutMs: 5000,
    revealTimeoutMs: 10000,
  },
} as const;
