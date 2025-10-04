/**
 * Player Game Client
 *
 * Factory function that creates a player-side game controller.
 * Handles receiving questions, submitting commits/reveals, and listening for results.
 *
 * Two modes:
 * 1. Demo mode (mockConfig provided): Auto-responds with predetermined answers
 * 2. Production mode (no mockConfig): Use onQuestion/onRevealRequest callbacks for user input
 *
 * Usage:
 *   // Demo mode:
 *   const player = createPlayerClient({ ws, signer, wallet, mockConfig })
 *   await player.start()
 *
 *   // Production mode:
 *   const player = createPlayerClient({ ws, signer, wallet })
 *   player.onQuestion(async (question, deadline) => {
 *     const answer = await getUserInput()
 *     await player.submitCommit(sessionId, answer)
 *   })
 *   await player.start()
 */

import type { Address, Hex } from 'viem';
import { parseAnyRPCResponse, RPCMethod } from '@erc7824/nitrolite';
import { sendGameMessage, type MessageSigner } from '../yellow-integration';
import {
  generateSecret,
  createCommitment,
  delay,
} from './utils';
import type {
  QuestionMessage,
  CommitMessage,
  RevealRequestMessage,
  RevealMessage,
  RoundResultMessage,
  PlayerMockConfig,
} from './types';
import { parseGameMessage } from './types';
import type { Wallet } from '../utils/wallets';
import { DEBUG } from '../env';

// ==================== TYPES ====================

export interface PlayerClientParams {
  ws: WebSocket;
  signer: MessageSigner;
  wallet: Wallet;
  mockConfig?: PlayerMockConfig; // Optional: for demo mode
}

export interface PlayerGameClient {
  start(): Promise<void>;
  onQuestion(handler: (question: QuestionMessage) => void | Promise<void>): void;
  onRevealRequest(handler: (request: RevealRequestMessage) => void | Promise<void>): void;
  onRoundResult(handler: (result: RoundResultMessage) => void | Promise<void>): void;
  submitCommit(sessionId: Hex, answer: string): Promise<void>;
  submitReveal(sessionId: Hex): Promise<void>;
  cleanup(): void;
}

// ==================== FACTORY ====================

export function createPlayerClient({
  ws,
  signer,
  wallet,
  mockConfig,
}: PlayerClientParams): PlayerGameClient {
  // Internal state
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  let questionHandler: ((question: QuestionMessage) => void | Promise<void>) | null = null;
  let revealRequestHandler: ((request: RevealRequestMessage) => void | Promise<void>) | null = null;
  let roundResultHandler: ((result: RoundResultMessage) => void | Promise<void>) | null = null;

  let currentSessionId: Hex | null = null;
  let currentAnswer: string | null = null;
  let currentSecret: Hex | null = null;
  let currentCommitment: Hex | null = null;
  let currentRound = 0;

  // ==================== MESSAGE HANDLING ====================

  function handleIncomingMessage(event: MessageEvent) {
    try {
      const response = parseAnyRPCResponse(event.data);

      // Handle application messages from ClearNode
      if (response.method === RPCMethod.Message) {
        const { message, app_session_id } = response.params as { message: unknown, app_session_id: Hex };
        // Skip empty success responses (no message content)
        if (!message || !app_session_id) {
          return;
        }

        // Store session ID
        if (app_session_id) {
          currentSessionId = app_session_id;
        }
        const gameMsg = parseGameMessage(message);

        // Route by message type (TypeScript knows the exact type per case)
        switch (gameMsg.type) {
          case 'question':
            handleQuestionMessage(gameMsg);
            break;
          case 'reveal_request':
            handleRevealRequestMessage(gameMsg);
            break;
          case 'round_result':
            handleRoundResultMessage(gameMsg);
            break;
        }
      }
    } catch (error) {
      console.error(`  ❌ ${wallet.name}: Error handling message:`, error);
      if (error instanceof Error) {
        console.error(`  📋 Error details:`, error.message);
      }
    }
  }

  async function handleQuestionMessage(msg: QuestionMessage) {
    currentRound = msg.round;
    console.log(`  📥 ${wallet.name}: Received question for round ${msg.round}`);

    // Call user handler if registered
    if (questionHandler) {
      await questionHandler(msg);
      return;
    }

    // Demo mode: auto-respond
    if (mockConfig && currentSessionId) {
      const mockAnswer = mockConfig.answers[msg.round - 1];
      if (mockAnswer) {
        await delay(mockAnswer.delay);
        await submitCommit(currentSessionId, mockAnswer.answer);
      }
    }
  }

  async function handleRevealRequestMessage(msg: RevealRequestMessage) {
    console.log(`  📥 ${wallet.name}: Received reveal request for round ${msg.round}`);

    // Call user handler if registered
    if (revealRequestHandler) {
      await revealRequestHandler(msg);
      return;
    }

    // Demo mode: auto-reveal
    if (mockConfig && currentSessionId) {
      await submitReveal(currentSessionId);
    }
  }

  async function handleRoundResultMessage(msg: RoundResultMessage) {
    console.log(`  📥 ${wallet.name}: Received round result for round ${msg.round}`);

    // Call user handler if registered
    if (roundResultHandler) {
      await roundResultHandler(msg);
    }
  }

  // ==================== PUBLIC API ====================

  async function start(): Promise<void> {
    console.log(`  🎮 ${wallet.name}: Starting...`);
    messageHandler = handleIncomingMessage;
    ws.addEventListener('message', messageHandler);
    console.log(`  ✅ ${wallet.name}: Ready`);
  }

  function onQuestion(handler: (question: QuestionMessage) => void | Promise<void>) {
    questionHandler = handler;
  }

  function onRevealRequest(handler: (request: RevealRequestMessage) => void | Promise<void>) {
    revealRequestHandler = handler;
  }

  function onRoundResult(handler: (result: RoundResultMessage) => void | Promise<void>) {
    roundResultHandler = handler;
  }

  async function submitCommit(sessionId: Hex, answer: string): Promise<void> {
    const secret = generateSecret();
    const commitment = createCommitment(answer, secret, wallet.address);

    // Store for reveal phase
    currentAnswer = answer;
    currentSecret = secret;
    currentCommitment = commitment;

    const commitMsg: CommitMessage = {
      type: 'commit',
      playerAddress: wallet.address,
      commitment,
      timestamp: Date.now(),
    };

    await sendGameMessage(ws, signer, sessionId, commitMsg);
    console.log(`  ✅ ${wallet.name}: Submitted commit`);
  }

  async function submitReveal(sessionId: Hex): Promise<void> {
    if (!currentAnswer || !currentSecret || !currentCommitment) {
      console.error(`  ❌ ${wallet.name}: No stored answer to reveal`);
      return;
    }

    const revealMsg: RevealMessage = {
      type: 'reveal',
      playerAddress: wallet.address,
      answer: currentAnswer,
      secret: currentSecret,
      commitment: currentCommitment,
    };

    await sendGameMessage(ws, signer, sessionId, revealMsg);
    console.log(`  ✅ ${wallet.name}: Submitted reveal`);
  }

  function cleanup() {
    if (messageHandler) {
      ws.removeEventListener('message', messageHandler);
      messageHandler = null;
    }
    questionHandler = null;
    revealRequestHandler = null;
    roundResultHandler = null;
    currentAnswer = null;
    currentSecret = null;
    currentCommitment = null;
    console.log(`  🧹 ${wallet.name}: Cleaned up`);
  }

  // Return public API
  return {
    start,
    onQuestion,
    onRevealRequest,
    onRoundResult,
    submitCommit,
    submitReveal,
    cleanup,
  };
}
