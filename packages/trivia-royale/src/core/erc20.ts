/**
 * ERC20 Token Utilities
 *
 * Helpers for working with ERC20 tokens (USDC) in the Trivia Royale game.
 * Uses Nitrolite SDK's Erc20Service for token operations.
 */

import { Erc20Service } from '@erc7824/nitrolite';
import { parseUnits, formatUnits, type Address, type Hash } from 'viem';
import { sepolia } from 'viem/chains';
import { SEPOLIA_CONFIG } from './contracts';
import type { Wallet } from './wallets';
import { createPublicRpcClient } from './wallets';
import { logTxSubmitted } from './logger';

/**
 * Parse USDC amount (6 decimals) to wei
 */
export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, SEPOLIA_CONFIG.token.decimals);
}

/**
 * Format USDC wei amount to human-readable string
 */
export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, SEPOLIA_CONFIG.token.decimals);
}

/**
 * Create Erc20Service instance for a wallet
 */
export function createErc20Service(wallet: Wallet): Erc20Service {
  const publicClient = createPublicRpcClient();
  // @ts-expect-error - viem version mismatch between dependencies
  return new Erc20Service(wallet.publicClient, wallet.walletClient, wallet.account);
}

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(wallet: Wallet): Promise<bigint> {
  const erc20Service = createErc20Service(wallet);
  return await erc20Service.getTokenBalance(SEPOLIA_CONFIG.contracts.tokenAddress, wallet.address);
}

/**
 * Ensure wallet has approved spender for the required amount
 *
 * Checks current allowance and approves if insufficient.
 * This must be called before any ERC20 deposit operation.
 */
export async function ensureAllowance(
  wallet: Wallet,
  spender: Address,
  amount: bigint
): Promise<void> {
  const erc20Service = createErc20Service(wallet);

  // Check current allowance
  const currentAllowance = await erc20Service.getTokenAllowance(
    SEPOLIA_CONFIG.contracts.tokenAddress,
    wallet.address,
    spender
  );

  // If allowance is insufficient, approve the exact amount needed
  if (currentAllowance < amount) {
    console.log(`  🔐 ${wallet.name}: Approving ${formatUSDC(amount)} USDC for ${spender.slice(0, 10)}...`);

    const txHash = await erc20Service.approve(
      SEPOLIA_CONFIG.contracts.tokenAddress,
      spender,
      amount
    );

    logTxSubmitted(`${wallet.name}: USDC approval`, txHash);

    // Wait for confirmation
    const publicClient = createPublicRpcClient();
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`  ✅ ${wallet.name}: Approval confirmed`);
  } else {
    console.log(`  ✓  ${wallet.name}: Sufficient allowance already exists`);
  }
}

/**
 * Transfer USDC from one wallet to another
 *
 * Used for funding distribution (master → players/server)
 */
export async function transferUSDC(
  fromWallet: Wallet,
  to: Address,
  amount: string
): Promise<Hash> {
  const amountWei = parseUSDC(amount);

  // Use wallet client to call ERC20 transfer function
  const hash = await fromWallet.walletClient.writeContract({
    address: SEPOLIA_CONFIG.contracts.tokenAddress,
    abi: [
      {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
      }
    ],
    functionName: 'transfer',
    args: [to, amountWei],
    account: fromWallet.account,
    chain: sepolia,
  });

  return hash;
}
