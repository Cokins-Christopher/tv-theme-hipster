'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { submitAttempt, markDjReady, advanceRound } from '@/app/actions/game';
import { getPlayerId } from '@/lib/utils/player';
import type { GameState, Player, Timeline, Attempt, Show, Lobby } from '@/lib/types';
import type { GuessType } from '@/lib/types';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [myTimeline, setMyTimeline] = useState<Timeline[]>([]);
  const [allTimelines, setAllTimelines] = useState<Map<string, Timeline[]>>(new Map());
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [guessType, setGuessType] = useState<GuessType>('before');
  const [selectedX, setSelectedX] = useState<number | null>(null);
  const [selectedY, setSelectedY] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = getPlayerId();
    if (!id) {
      router.push('/');
      return;
    }
    setPlayerId(id);

    const fetchData = async () => {
      // Fetch lobby
      const { data: lobbyData } = await supabase
        .from('lobbies')
        .select('*')
        .eq('join_code', code.toUpperCase())
        .single();

      if (!lobbyData) {
        return;
      }

      setLobby(lobbyData);
      if (lobbyData.status === 'waiting') {
        router.push(`/lobby/${code}`);
        return;
      }

      // Fetch game state
      let gameStateData: GameState | null = null;
      const { data: gameStateResult } = await supabase
        .from('game_state')
        .select('*')
        .eq('lobby_id', lobbyData.id)
        .single();

      if (gameStateResult) {
        gameStateData = gameStateResult;
        setGameState(gameStateData);

        // Fetch current show - CRITICAL: Must fetch immediately when game starts
        if (gameStateData.show_id) {
          console.log('[Game] Fetching show with ID:', gameStateData.show_id);
          const { data: showData, error: showError } = await supabase
            .from('shows')
            .select('*')
            .eq('id', gameStateData.show_id)
            .single();

          if (showError) {
            console.error('[Game] Error fetching show:', showError);
            // Retry once
            const { data: retryShowData } = await supabase
              .from('shows')
              .select('*')
              .eq('id', gameStateData.show_id)
              .single();
            if (retryShowData) {
              console.log('[Game] Show loaded on retry:', retryShowData.show_name);
              setCurrentShow(retryShowData);
            }
          } else if (showData) {
            console.log('[Game] Show loaded:', showData.show_name);
            setCurrentShow(showData);
          } else {
            console.warn('[Game] No show data found for ID:', gameStateData.show_id);
          }
        } else {
          console.warn('[Game] No show_id in game state - game may not be started yet');
        }
      }

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('lobby_id', lobbyData.id)
        .order('seat', { ascending: true });

      if (playersError) {
        console.error('[Game] Error fetching players:', playersError);
      }

      if (playersData) {
        console.log('[Game] Players fetched:', playersData.map(p => ({ id: p.id, name: p.name, seat: p.seat })));
        setPlayers(playersData);
        
        // Verify current player is in the list
        const currentPlayer = playersData.find(p => p.id === id);
        if (!currentPlayer) {
          console.error('[Game] Current player not found in players list!', { playerId: id, players: playersData });
        } else {
          console.log('[Game] Current player found:', { id: currentPlayer.id, name: currentPlayer.name, seat: currentPlayer.seat });
        }
      }

      // Fetch timelines
      const { data: timelinesData } = await supabase
        .from('timelines')
        .select('*')
        .eq('lobby_id', lobbyData.id)
        .order('year_value', { ascending: true });

      if (timelinesData) {
        const timelineMap = new Map<string, Timeline[]>();
        for (const timeline of timelinesData) {
          const existing = timelineMap.get(timeline.player_id) || [];
          timelineMap.set(timeline.player_id, [...existing, timeline]);
        }
        setAllTimelines(timelineMap);
        if (id) {
          setMyTimeline(timelineMap.get(id) || []);
        }
      }

      // Fetch attempts for current round
      if (gameStateData) {
        const { data: attemptsData } = await supabase
          .from('attempts')
          .select('*')
          .eq('lobby_id', lobbyData.id)
          .eq('round_number', gameStateData.current_round_number)
          .order('attempt_order', { ascending: true });

        if (attemptsData) {
          setAttempts(attemptsData);
        }
      }
    };

    fetchData();

    // Set up subscriptions after lobby is loaded
    let gameChannel: ReturnType<typeof supabase.channel> | null = null;
    
    const setupGameStateSubscription = (lobbyIdToUse: string) => {
      if (gameChannel) {
        supabase.removeChannel(gameChannel);
      }

      gameChannel = supabase
        .channel(`game-state-${lobbyIdToUse}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_state',
            filter: `lobby_id=eq.${lobbyIdToUse}`,
          },
          async (payload) => {
            console.log('[Game] Game state update:', payload.eventType, payload.new);
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const newState = payload.new as GameState;
              console.log('[Game] New game state round_state:', newState.round_state);
              setGameState(newState);

              // Fetch new show if changed or if we don't have one yet
              if (newState.show_id && (newState.show_id !== gameState?.show_id || !currentShow)) {
                console.log('[Game] Fetching show from realtime update:', newState.show_id);
                const { data: showData, error: showError } = await supabase
                  .from('shows')
                  .select('*')
                  .eq('id', newState.show_id)
                  .single();

                if (showError) {
                  console.error('[Game] Error fetching show from realtime:', showError);
                }

                if (showData) {
                  console.log('[Game] Show updated from realtime:', showData.show_name);
                  setCurrentShow(showData);
                }
              }

              // Reset guess UI when round changes
              if (newState.current_round_number !== gameState?.current_round_number) {
                setSelectedX(null);
                setSelectedY(null);
                setGuessType('before');
              }

              // Fetch attempts for new round
              const { data: attemptsData } = await supabase
                .from('attempts')
                .select('*')
                .eq('lobby_id', newState.lobby_id)
                .eq('round_number', newState.current_round_number)
                .order('attempt_order', { ascending: true });

              if (attemptsData) {
                setAttempts(attemptsData);
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('[Game] Game state subscription status:', status);
        });
    };

    // Subscribe to lobby changes
    const lobbyChannel = supabase
      .channel(`game-lobby-${code}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `join_code=eq.${code.toUpperCase()}`,
        },
        (payload) => {
          console.log('[Game] Lobby update:', payload.eventType);
          if (payload.eventType === 'UPDATE') {
            const updatedLobby = payload.new as Lobby;
            setLobby(updatedLobby);
            
            // Set up game state subscription when we have lobby ID
            if (updatedLobby.id) {
              setupGameStateSubscription(updatedLobby.id);
            }
            
            if (updatedLobby.status === 'finished') {
              // Game over - could show winner screen
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Game] Lobby subscription status:', status);
      });

    // Set up timelines and attempts subscriptions
    let timelinesChannel: ReturnType<typeof supabase.channel> | null = null;
    let attemptsChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupAllSubscriptions = (lobbyIdToUse: string) => {
      setupGameStateSubscription(lobbyIdToUse);
      
      if (timelinesChannel) supabase.removeChannel(timelinesChannel);
      timelinesChannel = supabase
        .channel(`timelines-${lobbyIdToUse}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timelines',
            filter: `lobby_id=eq.${lobbyIdToUse}`,
          },
          async () => {
            const { data: timelinesData } = await supabase
              .from('timelines')
              .select('*')
              .eq('lobby_id', lobbyIdToUse)
              .order('year_value', { ascending: true });

            if (timelinesData) {
              const timelineMap = new Map<string, Timeline[]>();
              for (const timeline of timelinesData) {
                const existing = timelineMap.get(timeline.player_id) || [];
                timelineMap.set(timeline.player_id, [...existing, timeline]);
              }
              setAllTimelines(timelineMap);
              if (id) {
                setMyTimeline(timelineMap.get(id) || []);
              }
            }
          }
        )
        .subscribe();

      if (attemptsChannel) supabase.removeChannel(attemptsChannel);
      attemptsChannel = supabase
        .channel(`attempts-${lobbyIdToUse}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'attempts',
            filter: `lobby_id=eq.${lobbyIdToUse}`,
          },
          async () => {
            if (gameState) {
              const { data: attemptsData } = await supabase
                .from('attempts')
                .select('*')
                .eq('lobby_id', lobbyIdToUse)
                .eq('round_number', gameState.current_round_number)
                .order('attempt_order', { ascending: true });

              if (attemptsData) {
                setAttempts(attemptsData);
              }
            }
          }
        )
        .subscribe();
    };

    // Set up subscriptions after initial fetch
    fetchData().then(() => {
      if (lobby?.id) {
        setupAllSubscriptions(lobby.id);
      }
    });

    // Also set up when lobby updates
    const originalLobbyHandler = lobbyChannel._callbacks?.postgres_changes?.[0];
    if (originalLobbyHandler) {
      // The handler already sets up game state subscription
    }

    return () => {
      if (lobbyChannel) supabase.removeChannel(lobbyChannel);
      if (gameChannel) supabase.removeChannel(gameChannel);
      if (timelinesChannel) supabase.removeChannel(timelinesChannel);
      if (attemptsChannel) supabase.removeChannel(attemptsChannel);
    };
  }, [code, router, lobby?.id, gameState?.current_round_number, gameState?.show_id, playerId]);

  // Fetch show when gameState.show_id changes and we don't have the show yet
  useEffect(() => {
    const fetchShow = async () => {
      if (gameState?.show_id && !currentShow) {
        console.log('[Game] Fetching show from useEffect:', gameState.show_id);
        const { data: showData, error: showError } = await supabase
          .from('shows')
          .select('*')
          .eq('id', gameState.show_id)
          .single();

        if (showError) {
          console.error('[Game] Error fetching show in useEffect:', showError);
        }

        if (showData) {
          console.log('[Game] Show loaded from useEffect:', showData.show_name);
          setCurrentShow(showData);
        }
      }
    };

    fetchShow();
  }, [gameState?.show_id, currentShow]);

  // Calculate roles (before early return to avoid hook order issues)
  // Use useMemo to ensure consistent calculation
  const { myPlayer, mySeat, myName, isDj, isGuesser, isHost } = useMemo(() => {
    const foundPlayer = players.find(p => p.id === playerId);
    const seat = foundPlayer?.seat ?? null;
    const name = foundPlayer?.name || 'Unknown';
    const dj = lobby && gameState && seat !== null && gameState.current_dj_seat === seat;
    const guesser = lobby && gameState && seat !== null && gameState.current_attempt_seat === seat;
    const host = lobby && playerId && lobby.host_player_id === playerId;
    
    return {
      myPlayer: foundPlayer,
      mySeat: seat,
      myName: name,
      isDj: dj,
      isGuesser: guesser,
      isHost: host
    };
  }, [players, playerId, lobby, gameState]);

  // Calculate timeline years (before early return)
  const sortedTimeline = useMemo(() => {
    return [...myTimeline].sort((a, b) => a.year_value - b.year_value);
  }, [myTimeline]);
  
  const uniqueYears = useMemo(() => {
    return [...new Set(sortedTimeline.map(t => t.year_value))];
  }, [sortedTimeline]);

  // Debug: Log player identification
  useEffect(() => {
    if (playerId && players.length > 0 && gameState) {
      const shouldShowGuesserUI = isGuesser && gameState.round_state === 'guessing';
      console.log('[Game] Player identification:', {
        playerId,
        myName,
        mySeat,
        currentAttemptSeat: gameState.current_attempt_seat,
        currentDjSeat: gameState.current_dj_seat,
        roundState: gameState.round_state,
        isGuesser,
        isDj,
        shouldShowGuesserUI,
        hasTimeline: uniqueYears.length > 0,
        timelineYears: uniqueYears,
        timelineLength: myTimeline.length
      });
      
      if (isGuesser && gameState.round_state === 'guessing' && uniqueYears.length === 0) {
        console.error('[Game] ERROR: Guesser has no timeline years!', {
          myTimeline,
          allTimelines: Array.from(allTimelines.entries())
        });
      }
    }
  }, [playerId, players, mySeat, myName, isGuesser, isDj, gameState, uniqueYears, myTimeline, allTimelines]);

  // Debug logging (only log when values change to reduce spam)
  useEffect(() => {
    if (lobby && gameState && playerId) {
      console.log('[Game] Role check:', {
        mySeat,
        currentAttemptSeat: gameState.current_attempt_seat,
        currentDjSeat: gameState.current_dj_seat,
        roundState: gameState.round_state,
        isGuesser,
        isDj,
        isHost,
        willShowGuesserUI: isGuesser && gameState.round_state === 'guessing'
      });
    }
  }, [lobby, gameState, playerId, mySeat, isGuesser, isDj, isHost]);

  if (!lobby || !gameState || !playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading game...</p>
      </div>
    );
  }

  // Timeline already calculated above in useMemo

  const handleDjReady = async () => {
    if (!lobby || !playerId) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('[Game] Marking DJ ready...');
      const result = await markDjReady(lobby.id, playerId);
      console.log('[Game] DJ ready result:', result);
      
      if (!result || typeof result !== 'object') {
        setError('Unexpected response from server');
        return;
      }
      
      if ('error' in result) {
        setError(result.error);
      } else {
        // Success - manually refetch game state as fallback
        console.log('[Game] DJ ready - refetching game state');
        const { data: updatedGameState } = await supabase
          .from('game_state')
          .select('*')
          .eq('lobby_id', lobby.id)
          .single();
        
        if (updatedGameState) {
          console.log('[Game] Updated game state:', updatedGameState.round_state);
          setGameState(updatedGameState);
        }
      }
    } catch (err) {
      console.error('[Game] Error marking DJ ready:', err);
      setError('Failed to mark ready. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitGuess = async () => {
    if (selectedX === null) {
      setError('Please select X year');
      return;
    }

    if (guessType === 'between' && selectedY === null) {
      setError('Please select Y year for between guess');
      return;
    }

    if (guessType === 'between' && selectedX >= selectedY!) {
      setError('Y must be greater than X');
      return;
    }

    setLoading(true);
    setError('');

    const result = await submitAttempt(
      lobby.id,
      playerId,
      guessType,
      guessType === 'after' ? (selectedY ?? 0) : (selectedX ?? 0),
      guessType === 'between' || guessType === 'after' ? selectedY : null
    );

    setLoading(false);

    if ('error' in result) {
      setError(result.error);
    } else {
      // Reset selection
      setSelectedX(null);
      setSelectedY(null);
    }
  };

  const handleAdvanceRound = async () => {
    if (!isHost) return;
    setLoading(true);
    setError('');
    const result = await advanceRound(lobby.id, playerId);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
    }
  };

  const getPlayerName = (seat: number | null) => {
    if (seat === null) return 'Unknown';
    const player = players.find(p => p.seat === seat);
    return player?.name || 'Unknown';
  };

  const getPlayerScore = (playerId: string) => {
    return allTimelines.get(playerId)?.length || 0;
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* Header */}
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Round {gameState.current_round_number}</h1>
              <p className="text-sm text-gray-600">Target: {lobby.target_score} years</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">{myName}</p>
              <p className="text-2xl font-bold text-purple-600">{getPlayerScore(playerId)}</p>
            </div>
          </div>
        </div>

        {/* Turn Info */}
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Guesser:</span>
              <span className="font-semibold text-gray-900">
                {getPlayerName(gameState.current_guesser_seat)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">DJ:</span>
              <span className="font-semibold text-gray-900">
                {getPlayerName(gameState.current_dj_seat)}
              </span>
            </div>
            {gameState.round_state === 'guessing' && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Attempting:</span>
                <span className="font-semibold text-purple-600">
                  {getPlayerName(gameState.current_attempt_seat)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Scores */}
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Scores</h2>
          <div className="space-y-1">
            {players
              .filter(p => p.seat !== null)
              .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
              .map((player) => {
                const isCurrentlyGuessing = gameState.round_state === 'guessing' && 
                  player.seat === gameState.current_attempt_seat;
                const isDj = player.seat === gameState.current_dj_seat;
                
                return (
                  <div 
                    key={player.id} 
                    className={`flex items-center justify-between rounded-lg p-2 ${
                      isCurrentlyGuessing ? 'bg-purple-100 border-2 border-purple-500' : 
                      isDj ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrentlyGuessing && (
                        <span className="text-purple-600 font-bold text-lg">→</span>
                      )}
                      {isDj && !isCurrentlyGuessing && (
                        <span className="text-blue-600 text-sm">🎧</span>
                      )}
                      <span className={player.id === playerId ? 'font-semibold text-purple-600' : 'text-gray-700'}>
                        {player.name}
                      </span>
                      {isCurrentlyGuessing && (
                        <span className="text-xs font-medium text-purple-600 bg-purple-200 px-2 py-0.5 rounded">
                          Guessing
                        </span>
                      )}
                      {isDj && !isCurrentlyGuessing && (
                        <span className="text-xs font-medium text-blue-600 bg-blue-200 px-2 py-0.5 rounded">
                          DJ
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-gray-900">{getPlayerScore(player.id)}</span>
                  </div>
                );
              })}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* DJ Interface */}
        {isDj && gameState.round_state === 'dj_ready' && (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-blue-500">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">DJ - Play the Theme Song</h2>
            {currentShow ? (
              <div className="space-y-3">
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
                  <iframe
                    width="100%"
                    height="100%"
                    src={currentShow.youtube_url.replace('watch?v=', 'embed/')}
                    title={currentShow.show_name}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
                <div className="text-center text-sm text-gray-600">
                  <p className="font-semibold">{currentShow.show_name}</p>
                  <p>{currentShow.network} • {currentShow.artist}</p>
                </div>
                <button
                  onClick={handleDjReady}
                  disabled={loading}
                  className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Ready - Start Guessing'}
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                <p className="text-sm text-yellow-800 font-semibold mb-2">
                  Loading show information...
                </p>
                {gameState.show_id ? (
                  <>
                    <p className="text-xs text-yellow-600 mb-2">Show ID: {gameState.show_id}</p>
                    <button
                      onClick={async () => {
                        console.log('[Game] Manually fetching show:', gameState.show_id);
                        const { data: showData } = await supabase
                          .from('shows')
                          .select('*')
                          .eq('id', gameState.show_id)
                          .single();
                        if (showData) {
                          setCurrentShow(showData);
                        }
                      }}
                      className="text-xs bg-yellow-200 hover:bg-yellow-300 px-3 py-1 rounded"
                    >
                      Retry Load Show
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-yellow-600">No show ID available yet</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Guesser Interface */}
        {(() => {
          const shouldShow = isGuesser && gameState.round_state === 'guessing';
          if (!shouldShow && gameState.round_state === 'guessing') {
            console.log('[Game] NOT showing guesser UI because:', {
              isGuesser,
              mySeat,
              currentAttemptSeat: gameState.current_attempt_seat,
              roundState: gameState.round_state,
              match: mySeat === gameState.current_attempt_seat
            });
          }
          return shouldShow;
        })() ? (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-purple-500">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Your Turn to Guess</h2>
            <p className="mb-3 text-sm text-gray-600">Select a range placement using your timeline years below.</p>
            <p className="mb-3 text-xs text-gray-500">Your seat: {mySeat} | Attempting: {gameState.current_attempt_seat}</p>

            {/* Guess Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Guess Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setGuessType('before');
                    setSelectedY(null);
                  }}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium transition-colors ${
                    guessType === 'before'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Before X
                </button>
                <button
                  onClick={() => setGuessType('between')}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium transition-colors ${
                    guessType === 'between'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Between X & Y
                </button>
                <button
                  onClick={() => {
                    setGuessType('after');
                    setSelectedX(null);
                  }}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium transition-colors ${
                    guessType === 'after'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  After Y
                </button>
              </div>
            </div>

            {/* Timeline Display */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Timeline</label>
              {uniqueYears.length === 0 ? (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                  <p className="text-sm text-yellow-800">
                    No years in your timeline yet. You should have 2 starting years. Please refresh the page.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {uniqueYears.map((year) => (
                    <button
                      key={year}
                      onClick={() => {
                        if (guessType === 'after') {
                          setSelectedY(year);
                        } else if (guessType === 'between') {
                          if (selectedX === null) {
                            setSelectedX(year);
                          } else if (selectedX === year) {
                            setSelectedX(null);
                          } else if (year > selectedX) {
                            setSelectedY(year);
                          } else {
                            setSelectedX(year);
                            setSelectedY(null);
                          }
                        } else {
                          setSelectedX(year);
                        }
                      }}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        (guessType === 'after' && selectedY === year) ||
                        (guessType === 'between' && (selectedX === year || selectedY === year)) ||
                        (guessType === 'before' && selectedX === year)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selection Display */}
            {guessType === 'before' && selectedX !== null && (
              <div className="mb-4 rounded-lg bg-purple-50 p-3">
                <p className="text-sm text-gray-700">
                  Guessing: <span className="font-semibold">Before {selectedX}</span>
                </p>
              </div>
            )}

            {guessType === 'between' && selectedX !== null && selectedY !== null && (
              <div className="mb-4 rounded-lg bg-purple-50 p-3">
                <p className="text-sm text-gray-700">
                  Guessing: <span className="font-semibold">Between {selectedX} and {selectedY}</span>
                </p>
              </div>
            )}

            {guessType === 'after' && selectedY !== null && (
              <div className="mb-4 rounded-lg bg-purple-50 p-3">
                <p className="text-sm text-gray-700">
                  Guessing: <span className="font-semibold">After {selectedY}</span>
                </p>
              </div>
            )}

            <button
              onClick={handleSubmitGuess}
              disabled={
                loading ||
                (guessType === 'before' && selectedX === null) ||
                (guessType === 'between' && (selectedX === null || selectedY === null)) ||
                (guessType === 'after' && selectedY === null)
              }
              className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Guess'}
            </button>
          </div>
        ) : gameState.round_state === 'guessing' && !isGuesser ? (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-gray-200">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Waiting for Guess</h2>
            <p className="text-sm text-gray-600">
              {getPlayerName(gameState.current_attempt_seat)} is currently guessing...
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Your seat: {mySeat !== null ? mySeat : 'Not assigned'} | Attempting: {gameState.current_attempt_seat}
            </p>
          </div>
        ) : gameState.round_state === 'guessing' ? (
          <div className="rounded-2xl bg-red-50 p-4 shadow-lg border-2 border-red-500">
            <h2 className="mb-3 text-lg font-semibold text-red-900">DEBUG: Guessing mode but interface not showing</h2>
            <div className="text-sm space-y-1">
              <p>isGuesser: {isGuesser ? 'true' : 'false'}</p>
              <p>round_state: {gameState.round_state}</p>
              <p>mySeat: {mySeat !== null ? mySeat : 'null'}</p>
              <p>current_attempt_seat: {gameState.current_attempt_seat}</p>
              <p>Match: {mySeat === gameState.current_attempt_seat ? 'YES' : 'NO'}</p>
              <p>Timeline years: {uniqueYears.length}</p>
            </div>
          </div>
        ) : null}

        {/* Attempts List */}
        {attempts.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Attempts</h2>
            <div className="space-y-2">
              {attempts.map((attempt) => {
                const player = players.find(p => p.id === attempt.player_id);
                const guessText =
                  attempt.guess_type === 'before'
                    ? `Before ${attempt.x_year}`
                    : attempt.guess_type === 'between'
                    ? `Between ${attempt.x_year} and ${attempt.y_year}`
                    : `After ${attempt.y_year}`;

                return (
                  <div
                    key={attempt.id}
                    className={`rounded-lg border-2 p-2 ${
                      attempt.is_correct === true
                        ? 'border-green-500 bg-green-50'
                        : attempt.is_correct === false
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{player?.name}</span>
                      {attempt.is_correct !== null && (
                        <span
                          className={`text-sm font-semibold ${
                            attempt.is_correct ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {attempt.is_correct ? '✓ Correct' : '✗ Wrong'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{guessText}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reveal Section */}
        {gameState.round_state === 'revealed' && currentShow && (
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Round Result</h2>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">{currentShow.show_name}</p>
              <p className="text-sm text-gray-600">Network: {currentShow.network}</p>
              <p className="text-sm text-gray-600">Artist: {currentShow.artist}</p>
              <p className="text-xl font-bold text-purple-600">Premiered: {currentShow.premiere_year}</p>
            </div>
            {isHost && (
              <button
                onClick={handleAdvanceRound}
                disabled={loading}
                className="mt-4 w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Next Round'}
              </button>
            )}
            {!isHost && (
              <p className="mt-4 text-center text-sm text-gray-600">Waiting for host to start next round...</p>
            )}
          </div>
        )}

        {/* My Timeline Display */}
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Your Timeline</h2>
          <div className="flex flex-wrap gap-2">
            {sortedTimeline.length === 0 ? (
              <p className="text-sm text-gray-500">No years yet</p>
            ) : (
              sortedTimeline.map((timeline, index) => (
                <span
                  key={`${timeline.year_value}-${index}`}
                  className="rounded-lg bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700"
                >
                  {timeline.year_value}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

