/**
 * Game Message Types
 *
 * Protocol for client-server game communication via ClearNode
 * Uses Zod for runtime validation and type safety
 */

import { z } from 'zod';
import type { Address, Hex } from 'viem';

// ==================== ZOD SCHEMAS ====================

/**
 * Zod schema for Ethereum addresses (0x + 40 hex chars)
 */
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/) as z.Schema<Address>;

/**
 * Zod schema for Hex strings (0x + hex chars)
 */
const HexSchema = z.string().regex(/^0x[a-fA-F0-9]+$/) as z.Schema<Hex>;

/**
 * Server → Players: Question broadcast
 */
export const QuestionMessageSchema = z.object({
  type: z.literal('question'),
  round: z.number().int().positive(),
  question: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  commitDeadline: z.number().int().nonnegative(),
});

/**
 * Player → Server: Commitment submission
 */
export const CommitMessageSchema = z.object({
  type: z.literal('commit'),
  playerAddress: AddressSchema,
  commitment: HexSchema,
  timestamp: z.number().int().nonnegative(),
});

/**
 * Server → Players: Request reveals
 */
export const RevealRequestMessageSchema = z.object({
  type: z.literal('reveal_request'),
  round: z.number().int().positive(),
});

/**
 * Player → Server: Answer reveal
 */
export const RevealMessageSchema = z.object({
  type: z.literal('reveal'),
  playerAddress: AddressSchema,
  answer: z.string(),
  secret: HexSchema,
  commitment: HexSchema,
});

/**
 * Server → Players: Round result
 */
export const RoundResultMessageSchema = z.object({
  type: z.literal('round_result'),
  round: z.number().int().positive(),
  winner: AddressSchema.nullable(),
  correctAnswer: z.string(),
});

/**
 * Discriminated union of all game messages
 */
export const GameMessageSchema = z.discriminatedUnion('type', [
  QuestionMessageSchema,
  CommitMessageSchema,
  RevealRequestMessageSchema,
  RevealMessageSchema,
  RoundResultMessageSchema,
]);

/**
 * Parse and validate a game message
 * @throws {z.ZodError} if message is invalid
 */
export function parseGameMessage(data: unknown): GameMessage {
  return GameMessageSchema.parse(data);
}

/**
 * Safely parse a game message (returns result object)
 */
export function safeParseGameMessage(data: unknown) {
  return GameMessageSchema.safeParse(data);
}

// ==================== GAME MESSAGES (TypeScript Types) ====================

/**
 * Server → Players: Question broadcast
 * Inferred from QuestionMessageSchema
 */
export type QuestionMessage = z.infer<typeof QuestionMessageSchema>;

/**
 * Player → Server: Commitment submission
 * Inferred from CommitMessageSchema
 */
export type CommitMessage = z.infer<typeof CommitMessageSchema>;

/**
 * Server → Players: Request reveals
 * Inferred from RevealRequestMessageSchema
 */
export type RevealRequestMessage = z.infer<typeof RevealRequestMessageSchema>;

/**
 * Player → Server: Answer reveal
 * Inferred from RevealMessageSchema
 */
export type RevealMessage = z.infer<typeof RevealMessageSchema>;

/**
 * Server → Players: Round result
 * Inferred from RoundResultMessageSchema
 */
export type RoundResultMessage = z.infer<typeof RoundResultMessageSchema>;

/**
 * Union of all game messages
 * Inferred from GameMessageSchema
 */
export type GameMessage = z.infer<typeof GameMessageSchema>;

// ==================== GAME STATE ====================

/**
 * Commit data collected by server
 */
export interface CommitData {
  commitment: Hex;
  timestamp: number;
  receivedAt: number;
}

/**
 * Reveal data collected by server
 */
export interface RevealData {
  answer: string;
  secret: Hex;
  commitment: Hex;
  isValid: boolean;
  isCorrect: boolean;
  responseTime: number;
}

/**
 * Round winner information
 */
export interface RoundWinner {
  playerAddress: Address;
  playerName: string;
  responseTime: number;
}

/**
 * Game results
 */
export interface GameResults {
  wins: Map<string, number>;
}

/**
 * Prize distribution
 */
export interface PrizeDistribution {
  name: string;
  wins: number;
  prize: string;
  change: string;
}

// ==================== MOCK CONFIG ====================

/**
 * Mock configuration for automated player responses (demo mode)
 */
export interface PlayerMockConfig {
  answers: Array<{
    answer: string;
    delay: number;
  }>;
}
