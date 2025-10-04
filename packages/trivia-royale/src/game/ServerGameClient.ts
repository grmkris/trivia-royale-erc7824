/**
 * Server Game Client
 *
 * Factory function that creates a server-side game controller.
 * Handles game flow, message broadcasting, and result aggregation.
 *
 * Usage:
 *   const server = createServerClient({ ws, signer, participants, serverAddress })
 *   await server.start()
 *   const sessionId = await server.createGame(allocations)
 *   await server.broadcastQuestion(sessionId, question, 1)
 *   const commits = await server.collectCommits(5000)
 *   // ... game logic
 *   await server.cleanup()
 */

import type { Address, Hex } from 'viem';
import { parseAnyRPCResponse, RPCMethod } from '@erc7824/nitrolite';
import {
  createGameSession,
  sendGameMessage,
  closeGameSession,
  type MessageSigner,
} from '../yellow-integration';
import {
  verifyCommitment,
  generateSecret,
  createCommitment,
} from './utils';
import type {
  QuestionMessage,
  CommitMessage,
  RevealRequestMessage,
  RevealMessage,
  RoundResultMessage,
  CommitData,
  RevealData,
  RoundWinner,
} from './types';
import { parseGameMessage } from './types';
import { DEBUG } from '../env';

// ==================== TYPES ====================

export interface ServerClientParams {
  ws: WebSocket;
  signer: MessageSigner;
  participants: Address[];
  serverAddress: Address;
}

export interface ServerGameClient {
  start(): Promise<void>;
  createGame(allocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>): Promise<Hex>;
  broadcastQuestion(sessionId: Hex, question: string, round: number, commitTimeoutMs: number): Promise<number>;
  collectCommits(questionSentAt: number, timeoutMs: number): Promise<Map<Address, CommitData>>;
  requestReveals(sessionId: Hex, round: number): Promise<void>;
  collectReveals(questionSentAt: number, timeoutMs: number): Promise<Map<Address, RevealData>>;
  determineWinner(reveals: Map<Address, RevealData>, correctAnswer: string): RoundWinner | null;
  broadcastResult(sessionId: Hex, round: number, winner: RoundWinner | null, correctAnswer: string): Promise<void>;
  endGame(sessionId: Hex, finalAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>): Promise<void>;
  cleanup(): void;
}

// ==================== FACTORY ====================

export function createServerClient({
  ws,
  signer,
  participants,
  serverAddress,
}: ServerClientParams): ServerGameClient {
  // Internal state
  const commitBuffer = new Map<Address, CommitData>();
  const revealBuffer = new Map<Address, RevealData>();
  let messageHandler: ((event: MessageEvent) => void) | null = null;

  // ==================== MESSAGE HANDLING ====================

  function handleIncomingMessage(event: MessageEvent) {
    try {
      const response = parseAnyRPCResponse(event.data);

      // Handle RPC errors from ClearNode
      if (response.method === RPCMethod.Error) {
        console.error(`  ❌ Server: ClearNode Error:`, JSON.stringify(response.params, null, 2));
        return;
      }

      // Handle application messages from ClearNode (broadcast from other participants)
      if (response.method === RPCMethod.Message) {
        const { message, app_session_id } = response.params;

        // Skip empty success responses (no message content)
        if (!message || !app_session_id) {
          if (DEBUG) {
            console.log(`  🔍 Server: Empty message received`);
          }
          return;
        }

        // Parse and validate game message with Zod
        const rawMsg = typeof message === 'string' ? JSON.parse(message) : message;

        if (DEBUG) {
          console.log(`  🔍 Server: App message received, session: ${app_session_id?.slice(0, 10)}...`);
          console.log(`  🔍 Server: Raw message type: ${rawMsg.type}`);
        }

        const gameMsg = parseGameMessage(rawMsg);

        // Route by message type (TypeScript knows the exact type per case)
        switch (gameMsg.type) {
          case 'commit':
            handleCommitMessage(gameMsg);
            break;
          case 'reveal':
            handleRevealMessage(gameMsg);
            break;
        }
      }
    } catch (error) {
      console.error('  ❌ Server: Error handling message:', error);
      if (error instanceof Error) {
        console.error('  📋 Error details:', error.message);
      }
    }
  }

  function handleCommitMessage(msg: CommitMessage) {
    const receivedAt = Date.now();
    commitBuffer.set(msg.playerAddress, {
      commitment: msg.commitment,
      timestamp: msg.timestamp,
      receivedAt,
    });
  }

  function handleRevealMessage(msg: RevealMessage) {
    revealBuffer.set(msg.playerAddress, {
      answer: msg.answer,
      secret: msg.secret,
      commitment: msg.commitment,
      isValid: false, // Will be verified
      isCorrect: false, // Will be checked
      responseTime: 0, // Will be calculated
    });
  }

  // ==================== PUBLIC API ====================

  async function start(): Promise<void> {
    console.log('  🎮 Server: Starting...');
    messageHandler = handleIncomingMessage;
    ws.addEventListener('message', messageHandler);
    console.log('  ✅ Server: Ready');
  }

  async function createGame(allocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>): Promise<Hex> {
    const session = await createGameSession(
      ws,
      signer,
      participants,
      allocations,
      serverAddress,
      'NitroRPC/0.4'
    );
    return session.sessionId;
  }

  async function broadcastQuestion(
    sessionId: Hex,
    question: string,
    round: number,
    commitTimeoutMs: number
  ): Promise<number> {
    const timestamp = Date.now();
    const questionMsg: QuestionMessage = {
      type: 'question',
      round,
      question,
      timestamp,
      commitDeadline: timestamp + commitTimeoutMs,
    };

    await sendGameMessage(ws, signer, sessionId, questionMsg);
    console.log(`  📤 Server: Broadcasted question for round ${round}`);
    return timestamp;
  }

  async function collectCommits(
    questionSentAt: number,
    timeoutMs: number
  ): Promise<Map<Address, CommitData>> {
    commitBuffer.clear();

    return new Promise((resolve) => {
      setTimeout(() => {
        const collected = new Map(commitBuffer);
        console.log(`  📥 Server: Collected ${collected.size} commits`);
        resolve(collected);
      }, timeoutMs);
    });
  }

  async function requestReveals(sessionId: Hex, round: number): Promise<void> {
    const revealMsg: RevealRequestMessage = {
      type: 'reveal_request',
      round,
    };

    await sendGameMessage(ws, signer, sessionId, revealMsg);
    console.log(`  📤 Server: Requested reveals for round ${round}`);
  }

  async function collectReveals(
    questionSentAt: number,
    timeoutMs: number
  ): Promise<Map<Address, RevealData>> {
    revealBuffer.clear();

    return new Promise((resolve) => {
      setTimeout(() => {
        const collected = new Map(revealBuffer);

        // Verify each reveal
        for (const [address, reveal] of collected) {
          // Verify commitment
          reveal.isValid = verifyCommitment(
            reveal.answer,
            reveal.secret,
            address,
            reveal.commitment
          );

          // Calculate response time (from question sent to commit received)
          const commitData = commitBuffer.get(address);
          if (commitData) {
            reveal.responseTime = commitData.receivedAt - questionSentAt;
          }
        }

        console.log(`  📥 Server: Collected ${collected.size} reveals`);
        resolve(collected);
      }, timeoutMs);
    });
  }

  function determineWinner(
    reveals: Map<Address, RevealData>,
    correctAnswer: string
  ): RoundWinner | null {
    const correctReveals: Array<{ address: Address; time: number }> = [];

    // Filter correct answers
    for (const [address, reveal] of reveals) {
      if (!reveal.isValid) {
        console.log(`  ❌ Invalid reveal from ${address.slice(0, 10)}...`);
        continue;
      }

      reveal.isCorrect = reveal.answer === correctAnswer;
      if (reveal.isCorrect) {
        correctReveals.push({
          address,
          time: reveal.responseTime,
        });
      }
    }

    if (correctReveals.length === 0) {
      return null;
    }

    // Sort by response time (fastest first)
    correctReveals.sort((a, b) => a.time - b.time);
    const winner = correctReveals[0];

    if (!winner) return null;

    return {
      playerAddress: winner.address,
      playerName: '', // Will be filled by caller
      responseTime: winner.time,
    };
  }

  async function broadcastResult(
    sessionId: Hex,
    round: number,
    winner: RoundWinner | null,
    correctAnswer: string
  ): Promise<void> {
    const resultMsg: RoundResultMessage = {
      type: 'round_result',
      round,
      winner: winner ? winner.playerAddress : null,
      correctAnswer,
    };

    await sendGameMessage(ws, signer, sessionId, resultMsg);
  }

  async function endGame(sessionId: Hex, finalAllocations: Array<{
    participant: Address;
    asset: string;
    amount: string;
  }>): Promise<void> {
    await closeGameSession(ws, signer, sessionId, finalAllocations);
    console.log('  ✅ Server: Game ended');
  }

  function cleanup() {
    if (messageHandler) {
      ws.removeEventListener('message', messageHandler);
      messageHandler = null;
    }
    commitBuffer.clear();
    revealBuffer.clear();
    console.log('  🧹 Server: Cleaned up');
  }

  // Return public API
  return {
    start,
    createGame,
    broadcastQuestion,
    collectCommits,
    requestReveals,
    collectReveals,
    determineWinner,
    broadcastResult,
    endGame,
    cleanup,
  };
}
