"use client";

import { formatUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';

export function BalanceDisplay() {
  const { balances, status } = useNitrolite();

  if (status === 'connecting') {
    return (
      <div className="grid gap-3 p-4 border rounded-lg">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded" />
          <Skeleton className="h-16 rounded" />
          <Skeleton className="h-16 rounded" />
          <Skeleton className="h-16 rounded" />
        </div>
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (status !== 'connected') {
    return (
      <div className="p-4 border rounded-lg">
        <h3 className="font-semibold mb-2">Balances</h3>
        <div className="text-sm text-gray-500">
          Connect wallet to see balances
        </div>
      </div>
    );
  }

  const total = (balances?.channel ?? 0n) + (balances?.ledger ?? 0n) + (balances?.custodyContract ?? 0n);

  return (
    <div className="grid gap-3 p-4 border rounded-lg">
      <h3 className="font-semibold">Balances</h3>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="p-2 bg-blue-50 rounded">
          <div className="text-xs text-gray-600">💰 Wallet</div>
          <div className="font-mono">{formatUSDC(balances?.wallet ?? 0n)} USDC</div>
        </div>

        <div className="p-2 bg-purple-50 rounded">
          <div className="text-xs text-gray-600">🏦 Custody</div>
          <div className="font-mono">{formatUSDC(balances?.custodyContract ?? 0n)} USDC</div>
        </div>

        <div className="p-2 bg-green-50 rounded">
          <div className="text-xs text-gray-600">🔗 Channel</div>
          <div className="font-mono">{formatUSDC(balances?.channel ?? 0n)} USDC</div>
        </div>

        <div className="p-2 bg-orange-50 rounded">
          <div className="text-xs text-gray-600">📊 Ledger</div>
          <div className="font-mono">{formatUSDC(balances?.ledger ?? 0n)} USDC</div>
        </div>
      </div>

      <div className="pt-2 border-t text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Available:</span>
          <span className="font-mono font-semibold">
            {formatUSDC(total)} USDC
          </span>
        </div>
      </div>
    </div>
  );
}
