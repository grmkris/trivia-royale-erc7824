/**
 * @trivia-royale/game - Public API
 *
 * Clean SDK for ERC7824 state channels with Yellow Network
 */

// Client factory + types
export { createBetterNitroliteClient } from './client';
export type { BetterNitroliteClient, MessageSchema, SessionInvite } from './client';

// Wallet helper for backends
export { createWallet } from './core/wallets';
export type { Wallet } from './core/wallets';

// USDC utilities
export { parseUSDC, formatUSDC } from './core/erc20';
