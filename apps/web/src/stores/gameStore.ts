import { create } from 'zustand';
import type { Address } from 'viem';

type GamePhase = 'lobby' | 'signing' | 'playing' | 'results' | 'idle';

interface QuestionData {
  text: string;
  round: number;
}

interface RoundResult {
  winner: Address;
  correctAnswer: string;
  round: number;
}

interface GameOver {
  finalWinner: Address;
  scores: Record<string, number>;
}

interface LobbyState {
  players: Array<{ address: Address; joinedAt: number }>;
  maxPlayers: number;
  status: string;
  sessionRequest?: any;
  sessionId?: string;
}

interface GameStore {
  // State
  phase: GamePhase;
  lobby: LobbyState | null;
  loading: boolean;
  error: string | null;
  currentQuestion: QuestionData | null;
  answer: string;
  roundResult: RoundResult | null;
  gameOver: GameOver | null;
  scores: Record<string, number>;
  countdown: number | null;

  // Actions
  setPhase: (phase: GamePhase) => void;
  setLobby: (lobby: LobbyState | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAnswer: (answer: string) => void;
  setCountdown: (countdown: number | null) => void;

  // Game message handler - called directly from WebSocket
  handleGameMessage: (type: string, sessionId: string, data: any) => void;

  // Reset game
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  phase: 'idle',
  lobby: null,
  loading: false,
  error: null,
  currentQuestion: null,
  answer: '',
  roundResult: null,
  gameOver: null,
  scores: {},
  countdown: null,

  // Simple setters
  setPhase: (phase) => set({ phase }),
  setLobby: (lobby) => set({ lobby }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAnswer: (answer) => set({ answer }),
  setCountdown: (countdown) => set({ countdown }),

  // Main game message handler
  handleGameMessage: (type, sessionId, data) => {
    console.log('📬 Game message:', type, data);

    if (type === 'game_start') {
      set({
        phase: 'playing',
        scores: {},
        roundResult: null,
        gameOver: null,
        countdown: null,
      });
      // Update lobby with sessionId
      const currentLobby = get().lobby;
      if (currentLobby) {
        set({ lobby: { ...currentLobby, sessionId } });
      }
    } else if (type === 'question') {
      set({
        currentQuestion: data as QuestionData,
        answer: '',
        roundResult: null,
        countdown: null,
      });
    } else if (type === 'round_result') {
      const result = data as RoundResult;
      set({
        roundResult: result,
        countdown: 5, // Start 5-second countdown
        scores: {
          ...get().scores,
          [result.winner]: (get().scores[result.winner] || 0) + 1,
        },
      });
    } else if (type === 'game_over') {
      set({
        gameOver: data as GameOver,
        phase: 'results',
        countdown: null,
      });
    }
  },

  // Reset to initial state
  resetGame: () => set({
    phase: 'idle',
    lobby: null,
    currentQuestion: null,
    answer: '',
    roundResult: null,
    gameOver: null,
    scores: {},
    countdown: null,
    loading: false,
    error: null,
  }),
}));
