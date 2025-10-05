/**
 * Logger utility for consistent and informative logging
 */

import { getEtherscanTxLink } from './contracts';

/**
 * Log a transaction with an Etherscan link
 * @param message - The message to log before the link
 * @param txHash - The transaction hash
 */
export function logTx(message: string, txHash: string): void {
  console.log(`  ${message}: ${getEtherscanTxLink(txHash)}`);
}

/**
 * Log a transaction submission with an Etherscan link
 * @param action - The action being performed (e.g., "Withdrawal", "Approval")
 * @param txHash - The transaction hash
 */
export function logTxSubmitted(action: string, txHash: string): void {
  logTx(`📤 ${action} tx submitted`, txHash);
}

/**
 * Log a transaction confirmation
 * @param action - The action that was confirmed
 */
export function logTxConfirmed(action: string): void {
  console.log(`  ✅ ${action} confirmed`);
}