/**
 * ClearNode WebSocket Management
 *
 * Functional helpers for managing multiple WebSocket connections
 * to Yellow Network's ClearNode service.
 */

import { connectToClearNode, authenticateClearNode } from '../yellow-integration';
import { SEPOLIA_CONFIG } from './contracts';
import type { Wallet } from './wallets';

/**
 * Connect and authenticate all participants to ClearNode
 */
export async function connectAllParticipants(
  wallets: Wallet[]
): Promise<Map<string, WebSocket>> {
  const connections = new Map<string, WebSocket>();

  for (const wallet of wallets) {
    console.log(`   🔗 ${wallet.name}: Connecting...`);

    const ws = await connectToClearNode(SEPOLIA_CONFIG.clearNodeUrl);
    await authenticateClearNode(ws, wallet.client);

    connections.set(wallet.name, ws);
    console.log(`   ✅ ${wallet.name}: Authenticated`);
  }

  return connections;
}

/**
 * Close all WebSocket connections
 */
export function disconnectAll(connections: Map<string, WebSocket>): void {
  for (const [name, ws] of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
  console.log(`   🔌 Disconnected all (${connections.size} connections)`);
}
