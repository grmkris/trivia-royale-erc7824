"use client";

import { useState } from 'react';
import { parseUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { Skeleton } from '@/components/ui/skeleton';

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
      <h3 className="font-semibold">Deposit / Withdraw</h3>

      <div className="flex gap-2">
        <input
          type="text"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount (USDC)"
          className="flex-1 px-3 py-2 border rounded"
          disabled={loading}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleDeposit}
          disabled={loading || !client}
          className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Deposit →'}
        </button>

        <button
          onClick={handleWithdraw}
          disabled={loading || !client}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : '← Withdraw'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Deposit moves funds wallet → channel. Withdraw moves channel/ledger/custody → wallet.
      </p>
    </div>
  );
}
