"use client";

import { useState } from 'react';
import { parseUSDC } from '@trivia-royale/game';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { isAddress, type Address } from 'viem';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <h3 className="font-semibold text-sm">Send Money</h3>

      <div className="space-y-2">
        <Input
          type="text"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="Recipient address (0x...)"
          className="font-mono text-xs"
          disabled={loading}
        />

        {serverAddress && (
          <Button
            onClick={() => setTo(serverAddress)}
            variant="ghost"
            size="sm"
            className="text-xs h-auto p-0 hover:underline"
            type="button"
          >
            Use server: {serverAddress.slice(0, 8)}...
          </Button>
        )}

        <Input
          type="text"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount (USDC)"
          disabled={loading}
          className="text-base"
        />
      </div>

      <Button
        onClick={handleSend}
        disabled={loading || !isAddress(to) || !client}
        className="w-full h-11"
        size="lg"
      >
        {loading ? 'Sending...' : '→ Send'}
      </Button>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Instant off-chain transfer. No gas fees.
      </p>
    </div>
  );
}
