"use client";

import { createBetterNitroliteClient, type BetterNitroliteClient } from '@trivia-royale/game';
import { useWalletClient } from 'wagmi';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { WalletClient } from 'viem';

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
}

const NitroliteContext = createContext<NitroliteContextType | null>(null);

// Factory function for creating client from wagmi wallet
const createClientFromWagmi = (walletClient: WalletClient) => {
  return createBetterNitroliteClient({
    wallet: walletClient, // wagmi WalletClient IS viem WalletClient!
    sessionAllowance: '0.1', // allow 0.1 USDC for app sessions
    onAppMessage: (type, sessionId, data) => {
      console.log('📬 App message:', type, data);
    },
    onSessionClosed: (sessionId) => {
      console.log('🔒 Session closed:', sessionId);
    }
  });
};

export function NitroliteProvider({ children }: { children: ReactNode }) {
  const { data: walletClient } = useWalletClient();
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

  useEffect(() => {
    if (!walletClient) {
      setClient(null);
      setStatus('disconnected');
      setBalances(null);
      return;
    }

    setStatus('connecting');

    // Use factory to create client
    const nitroClient = createClientFromWagmi(walletClient);
    let interval: NodeJS.Timeout | null = null;

    nitroClient.connect()
      .then(async () => {
        setClient(nitroClient);
        setStatus('connected');
        await refreshBalances();

        // Poll balances every 2s
        interval = setInterval(refreshBalances, 2000);
      })
      .catch(err => {
        console.error('Failed to connect to ClearNode:', err);
        setStatus('error');
      });

    return () => {
      if (interval) clearInterval(interval);
      nitroClient.disconnect();
    };
  }, [walletClient]);

  return (
    <NitroliteContext.Provider value={{ client, balances, status, refreshBalances }}>
      {children}
    </NitroliteContext.Provider>
  );
}

export const useNitrolite = () => {
  const ctx = useContext(NitroliteContext);
  if (!ctx) throw new Error('useNitrolite must be used within NitroliteProvider');
  return ctx;
};
