"use client";

import { useState } from 'react';
import { parseUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DepositWithdraw() {
  const { client, refreshBalances, status } = useNitrolite();
  const [amount, setAmount] = useState('0.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const amountWei = parseUSDC(amount);
      await client.deposit(amountWei);
      await refreshBalances();
      setAmount('0.1'); // Reset
    } catch (err) {
      console.error('Deposit failed:', err);
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const amountWei = parseUSDC(amount);
      await client.withdraw(amountWei);
      await refreshBalances();
      setAmount('0.1'); // Reset
    } catch (err) {
      console.error('Withdraw failed:', err);
      setError(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'connecting') {
    return (
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded" />
          <Skeleton className="h-10 flex-1 rounded" />
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <h3 className="font-semibold text-sm">Deposit / Withdraw</h3>

      <Input
        type="text"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="Amount (USDC)"
        disabled={loading}
        className="text-base"
      />

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleDeposit}
          disabled={loading || !client}
          className="w-full h-11"
          size="lg"
        >
          {loading ? 'Processing...' : '↓ Deposit'}
        </Button>

        <Button
          onClick={handleWithdraw}
          disabled={loading || !client}
          variant="outline"
          className="w-full h-11"
          size="lg"
        >
          {loading ? 'Processing...' : '↑ Withdraw'}
        </Button>
      </div>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Deposit from wallet. Withdraw to wallet.
      </p>
    </div>
  );
}
