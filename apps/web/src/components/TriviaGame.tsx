"use client";

import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { useNitrolite } from '@/providers/NitroliteProvider';
import { useGameStore } from '@/stores/gameStore';

export function TriviaGame() {
  const { address } = useAccount();
  const { client, status } = useNitrolite();

  // Get all state from Zustand store
  const {
    phase,
    lobby,
    loading,
    error,
    currentQuestion,
    answer,
    roundResult,
    gameOver,
    scores,
    countdown,
    setPhase,
    setLobby,
    setLoading,
    setError,
    setAnswer,
    setCountdown,
    resetGame,
  } = useGameStore();

  // Poll lobby state when waiting
  useEffect(() => {
    if (phase !== 'lobby' || !address) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3002/lobby-state');
        const data = await res.json();
        setLobby(data);

        // If session request ready, move to signing phase
        if (data.status === 'collecting_signatures' && data.sessionRequest) {
          setPhase('signing');
          clearInterval(interval);
          // Auto-sign
          setTimeout(() => handleSignSession(data.sessionRequest), 500);
        }
      } catch (err) {
        console.error('Failed to fetch lobby state:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [phase, address, setLobby, setPhase]);

  // Countdown timer between rounds
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      const current = useGameStore.getState().countdown;
      if (current === null || current <= 1) {
        setCountdown(null);
      } else {
        setCountdown(current - 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, setCountdown]);

  const handleJoinGame = async () => {
    if (!address || !client) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:3002/join-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAddress: address }),
      });

      if (!res.ok) {
        throw new Error('Failed to join game');
      }

      const data = await res.json();
      setLobby(data);
      setPhase('lobby');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  const handleSignSession = async (sessionRequest: any) => {
    if (!address || !client) return;

    setLoading(true);
    setError(null);

    try {
      // Sign the session request
      const signature = await client.signSessionRequest(sessionRequest);

      // Submit signature to server
      const res = await fetch('http://localhost:3002/submit-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerAddress: address,
          signature,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit signature');
      }

      console.log('✅ Signature submitted, waiting for game to start...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign session');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!client || !currentQuestion || !lobby?.sessionId || !address || !answer.trim()) return;

    try {
      await client.sendMessage(lobby.sessionId, 'answer', {
        answer: answer.trim(),
        round: currentQuestion.round,
        from: address,
        timestamp: Date.now(),
      });

      console.log(`📤 Submitted answer: "${answer}"`);
      setAnswer(''); // Clear input
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  // Idle state - show join button
  if (phase === 'idle') {
    return (
      <Card className="p-6 space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">🎮 Trivia Royale</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Test your knowledge, win prizes!
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            • 3 players • 3 rounds • 0.01 USDC entry fee<br />
            • Prize pool: 50% / 30% / 20% split
          </p>
        </div>

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 p-3 rounded">
            {error}
          </div>
        )}

        <Button
          onClick={handleJoinGame}
          disabled={loading || status !== 'connected'}
          className="w-full h-12"
          size="lg"
        >
          {loading ? 'Joining...' : 'Join Game'}
        </Button>

        {status !== 'connected' && (
          <p className="text-xs text-center text-muted-foreground">
            {status === 'connecting' ? 'Connecting...' : 'Not connected'}
          </p>
        )}
      </Card>
    );
  }

  // Lobby - waiting for players
  if (phase === 'lobby') {
    return (
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-bold text-center">🎮 Game Lobby</h2>

        <div className="space-y-2">
          <p className="text-sm text-center text-muted-foreground">
            Waiting for players... ({lobby?.players.length || 0}/{lobby?.maxPlayers || 3})
          </p>

          <div className="space-y-1">
            {lobby?.players.map((p, idx) => (
              <div key={p.address} className="p-2 bg-muted rounded flex items-center gap-2">
                <span className="text-xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                <span className="text-xs font-mono">
                  {p.address.slice(0, 10)}...{p.address.slice(-8)}
                </span>
                {p.address === address && (
                  <span className="ml-auto text-xs text-green-500">You</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  // Signing phase
  if (phase === 'signing') {
    return (
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-bold text-center">✍️ Signing Session</h2>
        <p className="text-sm text-center text-muted-foreground">
          {loading ? 'Signing and submitting...' : 'Processing signatures...'}
        </p>
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }

  // Playing - show question
  if (phase === 'playing') {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">🎮 Round {currentQuestion?.round || '?'}/3</h2>
          <div className="text-sm text-muted-foreground">
            💰 Pool: 0.03 USDC
          </div>
        </div>

        {/* Scores */}
        {Object.keys(scores).length > 0 && (
          <div className="flex gap-2 text-xs">
            {lobby?.players.map((p, idx) => (
              <div key={p.address} className="flex-1 p-2 bg-muted rounded text-center">
                <div>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                <div className="font-mono text-xs">
                  {p.address.slice(0, 6)}...
                </div>
                <div className="font-bold">{scores[p.address] || 0}</div>
              </div>
            ))}
          </div>
        )}

        {/* Question */}
        {currentQuestion && (
          <div className="p-4 bg-primary/5 border-2 border-primary rounded-lg">
            <p className="text-lg font-semibold text-center">
              {currentQuestion.text}
            </p>
          </div>
        )}

        {/* Answer input */}
        {currentQuestion && !roundResult && (
          <div className="space-y-2">
            <Input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmitAnswer();
                }
              }}
              className="text-lg text-center"
            />
            <Button
              onClick={handleSubmitAnswer}
              disabled={!answer.trim()}
              className="w-full h-11"
            >
              Submit Answer
            </Button>
          </div>
        )}

        {/* Round result */}
        {roundResult && (
          <div className={`p-4 rounded-lg text-center ${
            roundResult.winner === address
              ? 'bg-green-500/10 border-2 border-green-500'
              : 'bg-muted'
          }`}>
            {roundResult.winner === address ? (
              <div>
                <p className="text-2xl mb-2">🎉</p>
                <p className="font-bold text-green-500">You won this round!</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">Round winner:</p>
                <p className="text-xs font-mono">
                  {roundResult.winner.slice(0, 10)}...
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Correct answer: {roundResult.correctAnswer}
            </p>
          </div>
        )}

        {!currentQuestion && !countdown && (
          <p className="text-center text-sm text-muted-foreground">
            Waiting for next round...
          </p>
        )}

        {/* Countdown between rounds */}
        {countdown !== null && countdown > 0 && (
          <div className="p-6 text-center space-y-2 animate-pulse">
            <p className="text-sm text-muted-foreground">Next round in</p>
            <div className="text-6xl font-bold text-primary">
              {countdown}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // Results - game over
  if (phase === 'results' && gameOver) {
    const sortedScores = Object.entries(gameOver.scores).sort(([, a], [, b]) => b - a);

    return (
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-center">🏆 Game Over!</h2>

        <div className="space-y-2">
          {sortedScores.map(([addr, score], idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            const prize = idx === 0 ? '0.015' : idx === 1 ? '0.009' : '0.006';
            const isYou = addr === address;

            return (
              <div
                key={addr}
                className={`p-4 rounded-lg ${
                  isYou ? 'bg-primary/10 border-2 border-primary' : 'bg-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{medal}</span>
                    <div>
                      <p className="font-mono text-sm">
                        {addr.slice(0, 10)}...{addr.slice(-8)}
                      </p>
                      {isYou && (
                        <p className="text-xs text-primary font-semibold">You!</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{score} wins</p>
                    <p className="text-xs text-muted-foreground">
                      +{prize} USDC
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          onClick={resetGame}
          className="w-full"
        >
          Play Again
        </Button>
      </Card>
    );
  }

  return null;
}
