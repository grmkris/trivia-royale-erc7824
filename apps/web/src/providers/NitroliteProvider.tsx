"use client";

import {
  createBetterNitroliteClient,
  createWallet,
  createLocalStorageKeyManager,
  type BetterNitroliteClient
} from '@trivia-royale/game';
import { useWalletClient, usePublicClient } from 'wagmi';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

// Balances type
interface Balances {
  wallet: bigint;
  custodyContract: bigint;
  channel: bigint;
  ledger: bigint;
}

// Context type
interface NitroliteContextType {
  client: BetterNitroliteClient | null;
  balances: Balances | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  refreshBalances: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const NitroliteContext = createContext<NitroliteContextType | null>(null);

export function NitroliteProvider({ children }: { children: ReactNode }) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [client, setClient] = useState<BetterNitroliteClient | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const refreshBalances = async () => {
    if (!client) return;
    try {
      const bal = await client.getBalances();
      setBalances({
        wallet: bal.wallet,
        custodyContract: bal.custodyContract,
        channel: bal.channel,
        ledger: bal.ledger
      });
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  };

  // Use React Query for balance polling
  useQuery({
    queryKey: ['nitrolite-balances', walletClient?.account?.address],
    queryFn: async () => {
      if (!client || status !== 'connected') return null;
      const bal = await client.getBalances();
      setBalances({
        wallet: bal.wallet,
        custodyContract: bal.custodyContract,
        channel: bal.channel,
        ledger: bal.ledger
      });
      return bal;
    },
    enabled: !!client && status === 'connected',
    refetchInterval: 2000,
  });

  // Manual connect function
  const connect = async () => {
    if (!walletClient || !publicClient) {
      console.error('Wallet or public client not available');
      setStatus('error');
      return;
    }

    setStatus('connecting');

    try {
      // Use localStorage for persistent session keys
      const keyManager = createLocalStorageKeyManager();

      // Create wallet with persistent session keys
      const wallet = createWallet({
        walletClient,
        publicClient,
        sessionKeyManager: keyManager
      });

      // Create client
      const nitroClient = createBetterNitroliteClient({
        wallet,
        sessionAllowance: '0.1', // allow 0.1 USDC for app sessions
        onAppMessage: (type, sessionId, data) => {
          console.log('📬 App message:', type, data);
        },
        onSessionClosed: (sessionId) => {
          console.log('🔒 Session closed:', sessionId);
        }
      });

      await nitroClient.connect();
      setClient(nitroClient);
      setStatus('connected');
      await refreshBalances();
    } catch (err) {
      console.error('Failed to connect to ClearNode:', err);
      setStatus('error');
    }
  };

  const disconnect = () => {
    if (client) {
      client.disconnect();
      setClient(null);
    }
    setStatus('disconnected');
    setBalances(null);
  };

  // Reset when wallet disconnects
  useEffect(() => {
    if (!walletClient) {
      disconnect();
    }
  }, [walletClient?.account?.address]);

  return (
    <NitroliteContext.Provider value={{ client, balances, status, refreshBalances, connect, disconnect }}>
      {children}
    </NitroliteContext.Provider>
  );
}

export const useNitrolite = () => {
  const ctx = useContext(NitroliteContext);
  if (!ctx) throw new Error('useNitrolite must be used within NitroliteProvider');
  return ctx;
};
