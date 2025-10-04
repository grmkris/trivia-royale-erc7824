export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia',
  clearNodeUrl: 'ws://localhost:8000/ws', // Local ClearNode

  contracts: {
    custody: '0x019B65A265EB3363822f2752141b3dF16131b262' as const, // Latest: 2025-08-27
    adjudicator: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as const, // Latest: 2025-08-27
    tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const, // USDC on Sepolia
    // ClearNode broker address (Broker wallet - index 1)
    // This address must match the BROKER_PRIVATE_KEY in docker-compose.yml
    // Derived from mnemonic index 1
    brokerAddress: '0x71DB80a0eaB6Ef826B95acB29a5E8E86e9a95cF9' as const, // UPDATE THIS after deriving from index 1
  },

  token: {
    symbol: 'USDC',
    decimals: 6,
  },

  funding: {
    // Funding wallet reserves (received from faucets)
    fundingGasReserve: '1',      // 1 ETH for Funding wallet
    fundingGameReserve: '200',   // 200 USDC for Funding wallet

    // Distribution amounts per wallet
    gasAmount: '0.1',            // ETH for gas (to Broker, Server, Players)
    gameAmount: '20',            // USDC for game (to Server and Players only)
  },

  game: {
    asset: 'USDC',
    channelDeposit: '10',     // Channel deposit: 10 USDC (~100 games worth)
    entryFee: '0.1',          // 0.1 USDC per player (testing amount)
    prizePool: '0.5',         // 5 × 0.1 USDC
    maxPlayers: 5,
    rounds: 3,
    commitTimeoutMs: 5000,
    revealTimeoutMs: 10000,
  },
} as const;
