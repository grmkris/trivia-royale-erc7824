"use client";

import { useState } from 'react';
import { parseUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { isAddress, type Address } from 'viem';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';

export function SendMoney() {
  const { client, refreshBalances, status } = useNitrolite();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch server address with React Query (no blocking on first load)
  const { data: serverAddress } = useQuery({
    queryKey: ['serverAddress'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3002/server-address');
      if (!res.ok) throw new Error('Server not available');
      const data = await res.json();
      return data.address as string;
    },
    retry: false,
    staleTime: Infinity, // Server address doesn't change
  });

  const handleSend = async () => {
    if (!client || !isAddress(to)) {
      setError('Invalid address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const amountWei = parseUSDC(amount);
      await client.send({
        to: to as Address,
        amount: amountWei
      });
      await refreshBalances();
      setTo('');
      setAmount('0.01');
    } catch (err) {
      console.error('Send failed:', err);
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'connecting') {
    return (
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <h3 className="font-semibold">Send Money (Off-chain)</h3>

      <div className="space-y-2">
        <input
          type="text"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="Recipient address (0x...)"
          className="w-full px-3 py-2 border rounded font-mono text-sm"
          disabled={loading}
        />

        {serverAddress && (
          <button
            onClick={() => setTo(serverAddress)}
            className="text-xs text-blue-600 hover:underline"
            type="button"
          >
            Use server address: {serverAddress.slice(0, 10)}...
          </button>
        )}

        <input
          type="text"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount (USDC)"
          className="w-full px-3 py-2 border rounded"
          disabled={loading}
        />
      </div>

      <button
        onClick={handleSend}
        disabled={loading || !isAddress(to) || !client}
        className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending...' : 'Send via Ledger 🚀'}
      </button>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Instant off-chain transfer via ClearNode ledger. No gas fees!
      </p>
    </div>
  );
}
