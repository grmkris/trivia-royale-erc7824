/**
 * State Tracker with Storage Adapter Pattern
 *
 * Tracks all state transitions for channels to provide proof states
 * for operations like resize and close.
 *
 * Supports multiple storage backends:
 * - In-memory (default, lost on exit)
 * - Filesystem (persistent across runs)
 */

import type { Hex } from 'viem';
import type { State } from '@erc7824/nitrolite';

/**
 * Storage adapter interface for different backends
 */
export interface StorageAdapter {
  getStates(channelId: Hex): State[];
  saveStates(channelId: Hex, states: State[]): void;
  getAllChannels(): Hex[];
  clear(): void;
}

/**
 * State tracker interface - provides methods to track and query channel states
 */
export type StateTracker = {
  getChannelStates: (channelId: Hex) => State[];
  recordState: (channelId: Hex, state: State) => void;
  getProofStates: (channelId: Hex) => State[];
  getLastState: (channelId: Hex) => State | null;
  getStateByVersion: (channelId: Hex, version: bigint) => State | null;
  printStateHistory: (channelId: Hex) => void;
}

// ==================== STORAGE ADAPTERS ====================

/**
 * BigInt JSON serialization helpers for localStorage
 */
function replacerBigInt(key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() + 'n' : value;
}

function reviveBigInt(key: string, value: any): any {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

/**
 * In-memory storage adapter
 *
 * Stores states in a Map. Data is lost when process exits.
 * Best for: Scripts, tests, temporary tracking.
 */
export function createInMemoryStorage(): StorageAdapter {
  const store = new Map<Hex, State[]>();

  return {
    getStates: (channelId: Hex) => {
      return store.get(channelId) || [];
    },

    saveStates: (channelId: Hex, states: State[]) => {
      store.set(channelId, states);
    },

    getAllChannels: () => {
      return Array.from(store.keys());
    },

    clear: () => {
      store.clear();
    },
  };
}

/**
 * Filesystem storage adapter
 *
 * Persists states to filesystem. Survives restarts.
 * Best for: CLI tools, scripts, persistent tracking across runs.
 *
 * @param dirPath - Directory to store state files (default: '.state-tracker')
 */
export function createFileSystemStorage(dirPath = '.state-tracker'): StorageAdapter {
  const fs = require('fs');
  const path = require('path');

  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return {
    getStates: (channelId: Hex) => {
      try {
        const filePath = path.join(dirPath, `${channelId}.json`);

        if (!fs.existsSync(filePath)) return [];

        const text = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(text, reviveBigInt);
      } catch (error) {
        console.error(`Failed to load states for ${channelId}:`, error);
        return [];
      }
    },

    saveStates: (channelId: Hex, states: State[]) => {
      try {
        const filePath = path.join(dirPath, `${channelId}.json`);
        const data = JSON.stringify(states, replacerBigInt, 2);
        fs.writeFileSync(filePath, data, 'utf-8');
      } catch (error) {
        console.error(`Failed to save states for ${channelId}:`, error);
      }
    },

    getAllChannels: () => {
      try {
        const files = fs.readdirSync(dirPath);
        return files
          .filter((f: string) => f.endsWith('.json'))
          .map((f: string) => f.replace('.json', '') as Hex);
      } catch (error) {
        console.error('Failed to get all channels:', error);
        return [];
      }
    },

    clear: () => {
      try {
        const files = fs.readdirSync(dirPath);
        files.forEach((f: string) => {
          const filePath = path.join(dirPath, f);
          fs.unlinkSync(filePath);
        });
      } catch (error) {
        console.error('Failed to clear storage:', error);
      }
    },
  };
}

// ==================== STATE TRACKER ====================

/**
 * Create a state tracker with the specified storage backend
 *
 * @param storage - Storage adapter (default: in-memory)
 * @returns StateTracker object with methods
 *
 * @example
 * // In-memory tracker (default)
 * const tracker = createStateTracker();
 *
 * @example
 * // Persistent tracker with filesystem
 * const tracker = createStateTracker(createFileSystemStorage());
 *
 * @example
 * // Custom directory for filesystem storage
 * const tracker = createStateTracker(createFileSystemStorage('.my-states'));
 */
export function createStateTracker(
  storage: StorageAdapter = createInMemoryStorage()
): StateTracker {
  return {
    /**
     * Get all states for a channel
     */
    getChannelStates: (channelId: Hex) => {
      return storage.getStates(channelId);
    },

    /**
     * Record a new state for a channel
     */
    recordState: (channelId: Hex, state: State) => {
      const existing = storage.getStates(channelId);

      // Check if this exact state version already exists
      const alreadyExists = existing.some(s => BigInt(s.version) === BigInt(state.version));

      if (alreadyExists) {
        console.log(`  ⏭️  State v${state.version} already tracked for channel ${channelId.slice(0, 10)}... (skipping duplicate)`);
        return;
      }

      storage.saveStates(channelId, [...existing, state]);
      console.log(`  📝 Tracked state v${state.version} for channel ${channelId.slice(0, 10)}...`);
    },

    /**
     * Get all proof states for a channel
     * (Same as getChannelStates - all states can be used as proofs)
     */
    getProofStates: (channelId: Hex) => {
      return storage.getStates(channelId);
    },

    /**
     * Get the most recent state for a channel
     */
    getLastState: (channelId: Hex) => {
      const states = storage.getStates(channelId);
      const lastState = states.length > 0 ? states[states.length - 1] : null;
      if (!lastState) {
        throw new Error(`No states found for channel ${channelId.slice(0, 10)}...`);
      }
      return lastState;
    },

    /**
     * Get a specific state by version number
     */
    getStateByVersion: (channelId: Hex, version: bigint) => {
      const states = storage.getStates(channelId);
      return states.find(s => s.version === version) || null;
    },

    /**
     * Print state history for debugging
     */
    printStateHistory: (channelId: Hex) => {
      const states = storage.getStates(channelId);
      console.log(`\n📚 State History for ${channelId.slice(0, 10)}...`);
      console.log(`   Total states: ${states.length}\n`);

      states.forEach((state, idx) => {
        const intentNames = ['OPERATE', 'INITIALIZE', 'RESIZE', 'FINALIZE'];
        const intentName = intentNames[state.intent] || 'UNKNOWN';
        console.log(`   ${idx + 1}. v${state.version} - ${intentName} (${state.sigs.length} sigs)`);
      });
      console.log();
    },
  };
}
