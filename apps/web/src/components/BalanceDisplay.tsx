"use client";

import { formatUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BalanceDisplay() {
  const { balances, status } = useNitrolite();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (status === 'connecting') {
    return (
      <div className="p-6 border rounded-lg text-center">
        <Skeleton className="h-12 w-48 mx-auto mb-2" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    );
  }

  if (status !== 'connected') {
    return (
      <div className="p-6 border rounded-lg text-center">
        <div className="text-4xl font-bold mb-2">--</div>
        <div className="text-sm text-muted-foreground">
          Connect to see balance
        </div>
      </div>
    );
  }

  const total = (balances?.channel ?? 0n) + (balances?.ledger ?? 0n) + (balances?.custodyContract ?? 0n);

  return (
    <div className="p-6 border rounded-lg">
      {/* Hero Balance */}
      <div className="text-center mb-4">
        <div className="text-4xl font-bold mb-1 font-mono">
          ${formatUSDC(total)}
        </div>
        <div className="text-sm text-muted-foreground">
          Available Balance
        </div>
      </div>

      {/* Breakdown Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => setShowBreakdown(!showBreakdown)}
      >
        {showBreakdown ? 'Hide' : 'Show'} breakdown
        {showBreakdown ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" />
        )}
      </Button>

      {/* Detailed Breakdown */}
      {showBreakdown && (
        <div className="mt-4 space-y-2 text-sm border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">💰 Wallet</span>
            <span className="font-mono">${formatUSDC(balances?.wallet ?? 0n)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">🏦 Custody</span>
            <span className="font-mono">${formatUSDC(balances?.custodyContract ?? 0n)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">🔗 Channel</span>
            <span className="font-mono">${formatUSDC(balances?.channel ?? 0n)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">📊 Ledger</span>
            <span className="font-mono">${formatUSDC(balances?.ledger ?? 0n)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
