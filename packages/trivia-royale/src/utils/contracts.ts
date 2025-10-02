export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
  clearNodeUrl: 'wss://testnet-clearnode.nitrolite.org',

  contracts: {
    custody: '0x2C0b7CbD3B3638b64DC4B349b38a25F234E0FF3c' as const,
    adjudicator: '0x6D3B5EFa1f81f65037cD842F48E44BcBCa48CBEF' as const,
    tokenAddress: '0x0000000000000000000000000000000000000000' as const, // Native ETH
  },

  funding: {
    masterAmount: '0.5',      // Fund master with 0.5 ETH from faucet
    distributionAmount: '0.08', // Each wallet gets 0.08 ETH
  },

  game: {
    entryFee: '0.02',         // 0.02 ETH per player
    prizePool: '0.1',         // 5 × 0.02 ETH
    maxPlayers: 5,
    rounds: 3,
    commitTimeoutMs: 5000,
    revealTimeoutMs: 10000,
  },
} as const;
