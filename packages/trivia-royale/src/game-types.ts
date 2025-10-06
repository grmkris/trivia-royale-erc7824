/**
 * Shared types for Trivia Royale game
 * Used by both frontend and backend
 */

import type { Address } from 'viem';
import type { MessageSchema } from './client';

/**
 * Message schema for trivia game sessions
 */
export interface TriviaGameSchema extends MessageSchema {
  game_start: {
    data: { totalRounds: number; entryFee: string };
  };
  question: {
    data: { text: string; round: number };
  };
  answer: {
    data: { answer: string; round: number; from: Address; timestamp: number };
  };
  round_result: {
    data: { winner: Address; correctAnswer: string; round: number };
  };
  game_over: {
    data: { finalWinner: Address; scores: Record<string, number> };
  };
}

/**
 * Player in the lobby
 */
export interface LobbyPlayer {
  address: Address;
  joinedAt: number;
}

/**
 * Lobby state
 */
export interface LobbyState {
  players: LobbyPlayer[];
  maxPlayers: number;
  status: 'waiting' | 'collecting_signatures' | 'starting' | 'in_progress';
  sessionRequest?: any; // SessionRequest type from Nitrolite
  sessionId?: string;
}

/**
 * Signature submission
 */
export interface SignatureSubmission {
  playerAddress: Address;
  signature: `0x${string}`;
}

/**
 * Game state
 */
export interface GameState {
  sessionId: string;
  currentRound: number;
  totalRounds: number;
  scores: Record<Address, number>;
  status: 'active' | 'finished';
}
