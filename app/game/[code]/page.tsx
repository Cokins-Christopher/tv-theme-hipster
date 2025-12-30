'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { submitAttempt, markDjReady, advanceRound } from '@/app/actions/game';
import { resolveShowVideoId } from '@/app/actions/shows';
import { getPlayerId } from '@/lib/utils/player';
import type { GameState, Player, Timeline, Attempt, Show, Lobby } from '@/lib/types';
import type { GuessType } from '@/lib/types';

// Subscription status types
type SubscriptionStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

// Channel references for cleanup
interface ChannelRefs {
  lobby: ReturnType<typeof supabase.channel> | null;
  gameState: ReturnType<typeof supabase.channel> | null;
  timelines: ReturnType<typeof supabase.channel> | null;
  attempts: ReturnType<typeof supabase.channel> | null;
  players: ReturnType<typeof supabase.channel> | null;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  
  // Core state
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [myTimeline, setMyTimeline] = useState<Timeline[]>([]);
  const [allTimelines, setAllTimelines] = useState<Map<string, Timeline[]>>(new Map());
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  
  // UI state
  const [selectedBeforeYear, setSelectedBeforeYear] = useState<number | null>(null);
  const [selectedBetweenYears, setSelectedBetweenYears] = useState<[number, number] | null>(null);
  const [selectedAfterYear, setSelectedAfterYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoKey, setVideoKey] = useState(0); // For replaying video
  
  // Connection and subscription state
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  
  // Refs for cleanup and state management
  const channelsRef = useRef<ChannelRefs>({
    lobby: null,
    gameState: null,
    timelines: null,
    attempts: null,
    players: null,
  });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const subscriptionsSetupRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  
  // Constants
  const POLLING_INTERVAL = 5000; // 5 seconds fallback polling
  const REFRESH_DEBOUNCE_MS = 200; // Debounce refreshes to prevent excessive calls (reduced for faster updates)
  const MIN_REFRESH_INTERVAL = 300; // Minimum time between manual refreshes (reduced for faster updates)
  const ACTION_UPDATE_DELAY = 100; // Small delay after action to allow DB to update

  // ============================================================================
  // STABLE DATA FETCHING FUNCTIONS (no dependencies to prevent loops)
  // ============================================================================

  const fetchShow = useCallback(async (showId: string, retryCount = 0): Promise<Show | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      console.log(`[Game] Fetching show (attempt ${retryCount + 1}):`, showId);
      const { data: showData, error: showError } = await supabase
        .from('shows')
        .select('*')
        .eq('id', showId)
        .single();

      if (showError) {
        console.error('[Game] Error fetching show:', showError);
        if (retryCount < 3) { // Max 3 retries
          await new Promise(resolve => setTimeout(resolve, ACTION_UPDATE_DELAY * (retryCount + 1)));
          return fetchShow(showId, retryCount + 1);
        }
        return null;
      }
      
      if (showData) {
        console.log('[Game] Show loaded:', showData.show_name);
        
        // If it's a search URL and we don't have a video ID yet, resolve it
        if (showData.youtube_url.includes('results?search_query=') && !showData.youtube_video_id) {
          console.log('[Game] Resolving video ID from search URL...');
          const resolveResult = await resolveShowVideoId(showId);
          
          if ('videoId' in resolveResult) {
            // Refetch the show to get the updated video ID
            const { data: updatedShow } = await supabase
              .from('shows')
              .select('*')
              .eq('id', showId)
              .single();
            
            if (updatedShow) {
              console.log('[Game] Video ID resolved:', resolveResult.videoId);
              return updatedShow;
            }
          } else {
            console.error('[Game] Failed to resolve video ID:', resolveResult.error);
          }
        }
        
        return showData;
      }
      
      return null;
    } catch (err) {
      console.error('[Game] Exception fetching show:', err);
      return null;
    }
  }, []);

  const fetchPlayers = useCallback(async (lobbyId: string): Promise<Player[] | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('seat', { ascending: true });

      if (playersError) {
        console.error('[Game] Error fetching players:', playersError);
        return null;
      }

      return playersData || null;
    } catch (err) {
      console.error('[Game] Exception fetching players:', err);
      return null;
    }
  }, []);

  const fetchTimelines = useCallback(async (lobbyId: string): Promise<Map<string, Timeline[]> | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      const { data: timelinesData, error: timelinesError } = await supabase
        .from('timelines')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('year_value', { ascending: true });

      if (timelinesError) {
        console.error('[Game] Error fetching timelines:', timelinesError);
        return null;
      }

      if (timelinesData) {
        const timelineMap = new Map<string, Timeline[]>();
        for (const timeline of timelinesData) {
          const existing = timelineMap.get(timeline.player_id) || [];
          timelineMap.set(timeline.player_id, [...existing, timeline]);
        }
        return timelineMap;
      }
      
      return null;
    } catch (err) {
      console.error('[Game] Exception fetching timelines:', err);
      return null;
    }
  }, []);

  const fetchAttempts = useCallback(async (lobbyId: string, roundNumber: number): Promise<Attempt[] | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('attempts')
        .select('*')
        .eq('lobby_id', lobbyId)
        .eq('round_number', roundNumber)
        .order('attempt_order', { ascending: true });

      if (attemptsError) {
        console.error('[Game] Error fetching attempts:', attemptsError);
        return null;
      }

      return attemptsData || null;
    } catch (err) {
      console.error('[Game] Exception fetching attempts:', err);
      return null;
    }
  }, []);

  const fetchGameState = useCallback(async (lobbyId: string): Promise<GameState | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      const { data: gameStateData, error: gameStateError } = await supabase
        .from('game_state')
        .select('*')
        .eq('lobby_id', lobbyId)
        .single();

      if (gameStateError) {
        console.error('[Game] Error fetching game state:', gameStateError);
        return null;
      }

      return gameStateData || null;
    } catch (err) {
      console.error('[Game] Exception fetching game state:', err);
      return null;
    }
  }, []);

  const fetchLobby = useCallback(async (): Promise<Lobby | null> => {
    if (!isMountedRef.current) return null;
    
    try {
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('join_code', code.toUpperCase())
        .single();

      if (lobbyError) {
        console.error('[Game] Error fetching lobby:', lobbyError);
        return null;
      }

      return lobbyData || null;
    } catch (err) {
      console.error('[Game] Exception fetching lobby:', err);
      return null;
    }
  }, [code]);

  // ============================================================================
  // DEBOUNCED REFRESH FUNCTION
  // ============================================================================

  const refreshAllData = useCallback(async (
    lobbyId: string, 
    currentPlayerId: string | null, 
    roundNumber?: number,
    force = false
  ) => {
    if (!isMountedRef.current) return;
    
    const now = Date.now();
    
    // Debounce: don't refresh if we just refreshed recently (unless forced)
    if (!force && now - lastRefreshTimeRef.current < MIN_REFRESH_INTERVAL) {
      return;
    }
    
    lastRefreshTimeRef.current = now;
    
    // Clear any pending debounced refresh
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
    }
    
    // Debounce the actual refresh
    refreshDebounceRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      
      try {
        // Fetch all data in parallel
        const [lobbyData, gameStateData, playersData, timelinesMap, attemptsData] = await Promise.all([
          fetchLobby(),
          fetchGameState(lobbyId),
          fetchPlayers(lobbyId),
          fetchTimelines(lobbyId),
          roundNumber !== undefined ? fetchAttempts(lobbyId, roundNumber) : Promise.resolve(null),
        ]);

        if (!isMountedRef.current) return;

        // Update state only if we have data
        if (lobbyData) {
          setLobby(lobbyData);
          
          if (lobbyData.status === 'finished') {
            router.push(`/lobby/${code}`);
            return;
          }
          
          if (lobbyData.status === 'waiting') {
            router.push(`/lobby/${code}`);
            return;
          }
        }

        if (gameStateData) {
          gameStateRef.current = gameStateData;
          setGameState(gameStateData);
          
          // Fetch show if changed
          if (gameStateData.show_id) {
            const showData = await fetchShow(gameStateData.show_id);
            if (showData && isMountedRef.current) {
              setCurrentShow(showData);
            }
          }
        }

        if (playersData) {
          setPlayers(playersData);
        }

        if (timelinesMap) {
          setAllTimelines(timelinesMap);
          if (currentPlayerId) {
            const myTimelineData = timelinesMap.get(currentPlayerId) || [];
            setMyTimeline(myTimelineData);
          }
        }

        if (attemptsData && roundNumber !== undefined) {
          setAttempts(attemptsData);
        }
      } catch (err) {
        console.error('[Game] Error refreshing all data:', err);
      }
    }, REFRESH_DEBOUNCE_MS);
  }, [code, router, fetchLobby, fetchGameState, fetchPlayers, fetchTimelines, fetchAttempts, fetchShow]);

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT (setup once, stable)
  // ============================================================================

  const setupLobbySubscription = useCallback((lobbyId: string) => {
    if (channelsRef.current.lobby) {
      supabase.removeChannel(channelsRef.current.lobby);
    }

    const channel = supabase
      .channel(`lobby-${lobbyId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobbyId}`,
        },
        async (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new && isMountedRef.current) {
            const updatedLobby = payload.new as Lobby;
            setLobby(updatedLobby);
            
            if (updatedLobby.status === 'finished') {
              router.push(`/lobby/${code}`);
              return;
            }
            
            if (updatedLobby.status === 'waiting') {
              router.push(`/lobby/${code}`);
              return;
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
        }
      });

    channelsRef.current.lobby = channel;
  }, [code, router]);

  const setupGameStateSubscription = useCallback((lobbyId: string) => {
    if (channelsRef.current.gameState) {
      supabase.removeChannel(channelsRef.current.gameState);
    }

    const channel = supabase
      .channel(`game-state-${lobbyId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        async (payload) => {
          console.log('[Game] Game state subscription triggered:', payload.eventType);
          if ((payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') && payload.new && isMountedRef.current) {
            const newState = payload.new as GameState;
            console.log('[Game] Updating game state from subscription:', {
              round_state: newState.round_state,
              round_number: newState.current_round_number,
              attempt_seat: newState.current_attempt_seat
            });
            
            // CRITICAL: Update game state immediately
            const prevState = gameStateRef.current;
            gameStateRef.current = newState;
            setGameState(newState);
            
            console.log('[Game] State updated in subscription - round_state:', newState.round_state, 'prev:', prevState?.round_state);
            
            // Reset guess UI when round changes
            if (prevState && newState.current_round_number !== prevState.current_round_number) {
              setSelectedBeforeYear(null);
              setSelectedBetweenYears(null);
              setSelectedAfterYear(null);
            }

            // Fetch show if changed
            if (newState.show_id) {
              const showData = await fetchShow(newState.show_id);
              if (showData && isMountedRef.current) {
                setCurrentShow(showData);
              }
            }

            // Refresh timelines
            const timelinesMap = await fetchTimelines(lobbyId);
            if (timelinesMap && isMountedRef.current) {
              setAllTimelines(timelinesMap);
              const currentPlayerId = playerId || null;
              if (currentPlayerId) {
                const myTimelineData = timelinesMap.get(currentPlayerId) || [];
                setMyTimeline(myTimelineData);
              }
            }

            // Fetch attempts for current round - CRITICAL: Always fetch attempts
            const attemptsData = await fetchAttempts(lobbyId, newState.current_round_number);
            if (attemptsData && isMountedRef.current) {
              console.log('[Game] Updated attempts from subscription:', attemptsData.length);
              setAttempts(attemptsData);
            }

            // Check lobby status
            const currentLobby = await fetchLobby();
            if (currentLobby && isMountedRef.current) {
              if (currentLobby.status === 'finished') {
                router.push(`/lobby/${code}`);
                return;
              }
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
        }
      });

    channelsRef.current.gameState = channel;
  }, [playerId, code, router, fetchShow, fetchTimelines, fetchAttempts, fetchLobby]);

  const setupTimelinesSubscription = useCallback((lobbyId: string) => {
    if (channelsRef.current.timelines) {
      supabase.removeChannel(channelsRef.current.timelines);
    }

    const channel = supabase
      .channel(`timelines-${lobbyId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timelines',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        async () => {
          console.log('[Game] Timeline subscription triggered');
          const timelinesMap = await fetchTimelines(lobbyId);
          if (timelinesMap && isMountedRef.current) {
            setAllTimelines(timelinesMap);
            const currentPlayerId = playerId || null;
            if (currentPlayerId) {
              const myTimelineData = timelinesMap.get(currentPlayerId) || [];
              setMyTimeline(myTimelineData);
            }
          }
        }
      )
      .subscribe();

    channelsRef.current.timelines = channel;
  }, [playerId, fetchTimelines]);

  const setupAttemptsSubscription = useCallback((lobbyId: string, roundNumber: number) => {
    if (channelsRef.current.attempts) {
      supabase.removeChannel(channelsRef.current.attempts);
    }

    const channel = supabase
      .channel(`attempts-${lobbyId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attempts',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        async () => {
          console.log('[Game] Attempts subscription triggered - fetching latest attempts and game state');
          // CRITICAL: Always fetch attempts AND game state when attempts change
          // This ensures we see if round_state changed to 'revealed' when guess is correct
          const [currentGameState, attemptsData, timelinesMap] = await Promise.all([
            fetchGameState(lobbyId),
            fetchAttempts(lobbyId, gameStateRef.current?.current_round_number || roundNumber),
            fetchTimelines(lobbyId)
          ]);
          
          if (currentGameState && isMountedRef.current) {
            // Update game state if it changed (e.g., round_state to 'revealed')
            const prevState = gameStateRef.current;
            if (currentGameState.round_state !== prevState?.round_state ||
                currentGameState.current_attempt_seat !== prevState?.current_attempt_seat) {
              console.log('[Game] Game state changed in attempts subscription:', {
                round_state: { from: prevState?.round_state, to: currentGameState.round_state },
                attempt_seat: { from: prevState?.current_attempt_seat, to: currentGameState.current_attempt_seat }
              });
              gameStateRef.current = currentGameState;
              setGameState(currentGameState);
            }
          }
          
          if (attemptsData && isMountedRef.current) {
            console.log('[Game] Updated attempts from attempts subscription:', attemptsData.length);
            setAttempts(attemptsData);
          }
          
          if (timelinesMap && isMountedRef.current) {
            setAllTimelines(timelinesMap);
            if (playerId) {
              const myTimelineData = timelinesMap.get(playerId) || [];
              setMyTimeline(myTimelineData);
            }
          }
        }
      )
      .subscribe();

    channelsRef.current.attempts = channel;
  }, [playerId, fetchGameState, fetchAttempts, fetchTimelines]);

  const setupPlayersSubscription = useCallback((lobbyId: string) => {
    if (channelsRef.current.players) {
      supabase.removeChannel(channelsRef.current.players);
    }

    const channel = supabase
      .channel(`players-${lobbyId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        async () => {
          const playersData = await fetchPlayers(lobbyId);
          if (playersData && isMountedRef.current) {
            setPlayers(playersData);
          }
        }
      )
      .subscribe();

    channelsRef.current.players = channel;
  }, [fetchPlayers]);

  const setupAllSubscriptions = useCallback((lobbyId: string, roundNumber?: number) => {
    if (!isMountedRef.current || subscriptionsSetupRef.current) return;
    
    subscriptionsSetupRef.current = true;
    
    setupLobbySubscription(lobbyId);
    setupGameStateSubscription(lobbyId);
    setupTimelinesSubscription(lobbyId);
    setupPlayersSubscription(lobbyId);
    
    if (roundNumber !== undefined) {
      setupAttemptsSubscription(lobbyId, roundNumber);
    }
    
    // Stop polling if subscriptions are active
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    setConnectionStatus('connected');
  }, [setupLobbySubscription, setupGameStateSubscription, setupTimelinesSubscription, setupPlayersSubscription, setupAttemptsSubscription]);

  // ============================================================================
  // FALLBACK POLLING (only when subscriptions fail)
  // ============================================================================

  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) return;
    
    setConnectionStatus('reconnecting');
    
    pollingIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current || !lobby?.id || !playerId) return;
      
      refreshAllData(lobby.id, playerId, gameState?.current_round_number, false);
    }, POLLING_INTERVAL);
  }, [lobby?.id, playerId, gameState?.current_round_number, refreshAllData]);

  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // ============================================================================
  // INITIALIZATION (setup once)
  // ============================================================================

  useEffect(() => {
    isMountedRef.current = true;
    subscriptionsSetupRef.current = false;
    
    const id = getPlayerId();
    if (!id) {
      router.push('/');
      return;
    }
    setPlayerId(id);

    const initializeGame = async () => {
      try {
        const lobbyData = await fetchLobby();
        if (!lobbyData || !isMountedRef.current) return;

        setLobby(lobbyData);
        
        if (lobbyData.status === 'waiting') {
          router.push(`/lobby/${code}`);
          return;
        }

        // Fetch initial data
        const [gameStateData, playersData, timelinesMap] = await Promise.all([
          fetchGameState(lobbyData.id),
          fetchPlayers(lobbyData.id),
          fetchTimelines(lobbyData.id),
        ]);

        if (!isMountedRef.current) return;

        if (gameStateData) {
          gameStateRef.current = gameStateData;
          setGameState(gameStateData);
          
          // Fetch show and attempts
          if (gameStateData.show_id) {
            const showData = await fetchShow(gameStateData.show_id);
            if (showData && isMountedRef.current) {
              setCurrentShow(showData);
            }
          }
          
          const attemptsData = await fetchAttempts(lobbyData.id, gameStateData.current_round_number);
          if (attemptsData && isMountedRef.current) {
            setAttempts(attemptsData);
          }
        }

        if (playersData) {
          setPlayers(playersData);
        }

        if (timelinesMap) {
          setAllTimelines(timelinesMap);
          const myTimelineData = timelinesMap.get(id) || [];
          setMyTimeline(myTimelineData);
        }

        // Set up subscriptions ONCE
        if (isMountedRef.current && lobbyData.id && gameStateData) {
          setupAllSubscriptions(lobbyData.id, gameStateData.current_round_number);
        }
      } catch (err) {
        console.error('[Game] Error initializing game:', err);
        setError('Failed to load game. Please try refreshing the page.');
      }
    };

    initializeGame();

    return () => {
      isMountedRef.current = false;
      subscriptionsSetupRef.current = false;
      
      // Clean up all subscriptions
      Object.values(channelsRef.current).forEach(channel => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      });
      
      // Clear polling
      stopPollingFallback();
      
      // Clear debounce timeout
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
      
      // Reset channel refs
      channelsRef.current = {
        lobby: null,
        gameState: null,
        timelines: null,
        attempts: null,
        players: null,
      };
    };
  }, [code, router, fetchLobby, fetchGameState, fetchPlayers, fetchTimelines, fetchShow, fetchAttempts, setupAllSubscriptions, stopPollingFallback]);

  // Update attempts subscription when round changes
  useEffect(() => {
    if (lobby?.id && gameState?.current_round_number !== undefined && subscriptionsSetupRef.current) {
      setupAttemptsSubscription(lobby.id, gameState.current_round_number);
      
      // Also fetch attempts immediately
      fetchAttempts(lobby.id, gameState.current_round_number).then(attemptsData => {
        if (attemptsData && isMountedRef.current) {
          setAttempts(attemptsData);
        }
      });
    }
  }, [lobby?.id, gameState?.current_round_number, setupAttemptsSubscription, fetchAttempts]);

  // Reset submission state when it's no longer this player's turn
  useEffect(() => {
    if (gameState && playerId) {
      const currentPlayer = players.find(p => p.id === playerId);
      const isMyTurn = currentPlayer && 
        currentPlayer.seat !== null && 
        gameState.current_attempt_seat === currentPlayer.seat &&
        gameState.round_state === 'guessing';
      
      if (!isMyTurn && isSubmitting) {
        setIsSubmitting(false);
        setLoading(false);
      }
    }
  }, [gameState?.current_attempt_seat, gameState?.round_state, playerId, players, isSubmitting]);

  // Fetch show when gameState.show_id changes
  useEffect(() => {
    const loadShow = async () => {
      if (!gameState?.show_id || !isMountedRef.current) return;
      
      if (currentShow && currentShow.id === gameState.show_id) return;
      
      const showData = await fetchShow(gameState.show_id);
      if (showData && isMountedRef.current) {
        setCurrentShow(showData);
      }
    };

    loadShow();
  }, [gameState?.show_id, currentShow?.id, fetchShow]);

  // Poll for game state changes - ALL players poll to see updates immediately
  useEffect(() => {
    if (!lobby?.id || !gameState || !isMountedRef.current) return;
    
    const currentPlayer = players.find(p => p.id === playerId);
    if (!currentPlayer || currentPlayer.seat === null) return;
    
    // Calculate isHost inline to avoid dependency issues
    const isHostPlayer = lobby && playerId && lobby.host_player_id === playerId;
    
    // CRITICAL: Always poll when game is active to catch all state changes
    // This ensures all players see updates immediately when:
    // - Someone submits a guess (attempts change, round_state might change)
    // - Round is revealed (round_state changes to 'revealed')
    // - Next guesser's turn (attempt_seat changes)
    // - New round starts (round_number changes)
    
    console.log('[Game] Setting up continuous polling for all state changes');
    
    const pollInterval = setInterval(async () => {
      if (!isMountedRef.current || !lobby?.id) return;
      
      // CRITICAL: Also check lobby status to detect game finish
      const [currentLobby, currentGameState, currentAttemptsData] = await Promise.all([
        fetchLobby(),
        fetchGameState(lobby.id),
        fetchAttempts(lobby.id, gameStateRef.current?.current_round_number || gameState.current_round_number)
      ]);
      
      // Check if lobby status changed to 'finished'
      if (currentLobby && currentLobby.status === 'finished' && lobby.status !== 'finished') {
        console.log('[Game] Poll detected game finished - redirecting to lobby');
        setLobby(currentLobby);
        router.push(`/lobby/${code}`);
        return;
      }
      
      if (currentGameState && isMountedRef.current) {
        const prevState = gameStateRef.current;
        
        // Check if state changed
        const roundStateChanged = currentGameState.round_state !== prevState?.round_state;
        const attemptSeatChanged = currentGameState.current_attempt_seat !== prevState?.current_attempt_seat;
        const roundNumberChanged = currentGameState.current_round_number !== prevState?.current_round_number;
        const showIdChanged = currentGameState.show_id !== prevState?.show_id;
        
        // Check if attempts changed (new attempt added)
        const attemptsChanged = currentAttemptsData && 
          currentAttemptsData.length !== attempts.length;
        
        if (roundStateChanged || attemptSeatChanged || roundNumberChanged || showIdChanged || attemptsChanged) {
          console.log('[Game] Poll detected state change:', {
            round_state: { from: prevState?.round_state, to: currentGameState.round_state },
            attempt_seat: { from: prevState?.current_attempt_seat, to: currentGameState.current_attempt_seat },
            round_number: { from: prevState?.current_round_number, to: currentGameState.current_round_number },
            attempts_count: { from: attempts.length, to: currentAttemptsData?.length || 0 }
          });
          
          gameStateRef.current = currentGameState;
          setGameState(currentGameState);
          
          // Always refresh attempts when they change
          if (currentAttemptsData && isMountedRef.current) {
            setAttempts(currentAttemptsData);
          }
          
          // Refresh timelines
          const timelinesMap = await fetchTimelines(lobby.id);
          if (timelinesMap && isMountedRef.current) {
            setAllTimelines(timelinesMap);
            if (playerId) {
              const myTimelineData = timelinesMap.get(playerId) || [];
              setMyTimeline(myTimelineData);
            }
          }
          
          // Fetch show if round number changed or show_id changed
          if ((roundNumberChanged || showIdChanged) && currentGameState.show_id) {
            const showData = await fetchShow(currentGameState.show_id);
            if (showData && isMountedRef.current) {
              setCurrentShow(showData);
            }
          }
          
          // Clear attempts if round changed
          if (roundNumberChanged) {
            setAttempts([]);
          }
        }
      }
    }, 300); // Poll every 300ms - frequent enough for real-time feel, not too aggressive
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [
    lobby?.id,
    lobby?.status, // Include lobby status to detect game finish
    gameState?.round_state, 
    gameState?.current_round_number,
    attempts.length, // Include attempts length to detect new attempts
    playerId, 
    players, 
    code,
    router,
    fetchLobby,
    fetchGameState, 
    fetchAttempts, 
    fetchTimelines,
    fetchShow
  ]);

  // ============================================================================
  // ROLE CALCULATIONS (memoized)
  // ============================================================================

  const { myPlayer, mySeat, myName, isDj, isGuesser, isHost } = useMemo(() => {
    const foundPlayer = players.find(p => p.id === playerId);
    const seat = foundPlayer?.seat ?? null;
    const name = foundPlayer?.name || 'Unknown';
    
    const dj = lobby && gameState && seat !== null && 
      gameState.current_dj_seat !== null && 
      gameState.current_dj_seat === seat;
    
    const guesser = lobby && gameState && seat !== null && 
      gameState.current_attempt_seat !== null && 
      gameState.current_attempt_seat === seat;
    
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

  const sortedTimeline = useMemo(() => {
    if (!playerId) return [];
    return [...(myTimeline || [])].sort((a, b) => a.year_value - b.year_value);
  }, [myTimeline, playerId]);
  
  const uniqueYears = useMemo(() => {
    return [...new Set(sortedTimeline.map(t => t.year_value))];
  }, [sortedTimeline]);

  // Redirect if game finished
  useEffect(() => {
    if (lobby && lobby.status === 'finished') {
      router.push(`/lobby/${code}`);
    }
  }, [lobby?.status, code, router]);

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (!lobby || !gameState || !playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading game...</p>
          {connectionStatus === 'reconnecting' && (
            <p className="text-sm text-yellow-600 mt-2">Reconnecting...</p>
          )}
        </div>
      </div>
    );
  }

  if (lobby.status === 'finished') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Game finished. Redirecting to lobby...</p>
      </div>
    );
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleDjReady = async () => {
    if (!lobby || !playerId || !gameState) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('[Game] DJ marking ready...');
      const result = await markDjReady(lobby.id, playerId);
      
      if (!result || typeof result !== 'object') {
        setError('Unexpected response from server');
        setLoading(false);
        return;
      }
      
      if ('error' in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      
      console.log('[Game] DJ ready action succeeded, refreshing immediately...');
      
      // CRITICAL: Refresh game state immediately without delay
      // Poll until we see the round_state change to 'guessing'
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 100; // Check every 100ms
      
      while (attempts < maxAttempts && isMountedRef.current) {
        const updatedGameState = await fetchGameState(lobby.id);
        
        if (updatedGameState && isMountedRef.current) {
          console.log('[Game] Polled game state:', {
            round_state: updatedGameState.round_state,
            previous: gameState.round_state
          });
          
          // Update state immediately
          gameStateRef.current = updatedGameState;
          setGameState(updatedGameState);
          
          // If round state changed to 'guessing', we're done
          if (updatedGameState.round_state === 'guessing') {
            console.log('[Game] Round state changed to guessing!');
            
            // Also refresh attempts and timelines
            const [attemptsData, timelinesMap] = await Promise.all([
              fetchAttempts(lobby.id, updatedGameState.current_round_number),
              fetchTimelines(lobby.id)
            ]);
            
            if (attemptsData && isMountedRef.current) {
              setAttempts(attemptsData);
            }
            
            if (timelinesMap && isMountedRef.current) {
              setAllTimelines(timelinesMap);
              if (playerId) {
                const myTimelineData = timelinesMap.get(playerId) || [];
                setMyTimeline(myTimelineData);
              }
            }
            
            break;
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      // Subscriptions will handle further updates automatically
    } catch (err) {
      console.error('[Game] Error marking DJ ready:', err);
      setError('Failed to mark ready. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitGuess = async () => {
    // Prevent multiple submissions
    if (isSubmitting || loading) {
      return;
    }
    
    if (!lobby || !playerId || !gameState) return;
    
    // Verify it's still this player's turn
    const currentPlayer = players.find(p => p.id === playerId);
    if (!currentPlayer || currentPlayer.seat !== gameState.current_attempt_seat) {
      setError('It is not your turn to guess');
      return;
    }

    let guessType: GuessType;
    let xYear: number;
    let yYear: number | null = null;

    if (selectedBeforeYear !== null) {
      guessType = 'before';
      xYear = selectedBeforeYear;
    } else if (selectedBetweenYears !== null) {
      guessType = 'between';
      xYear = selectedBetweenYears[0];
      yYear = selectedBetweenYears[1];
    } else if (selectedAfterYear !== null) {
      guessType = 'after';
      xYear = selectedAfterYear;
      yYear = selectedAfterYear;
    } else {
      setError('Please select a guess');
      return;
    }

    // Set submitting flag and loading state
    setIsSubmitting(true);
    setLoading(true);
    setError('');

    try {
      const result = await submitAttempt(
        lobby.id,
        playerId,
        guessType,
        xYear,
        yYear
      );

      if ('error' in result) {
        setError(result.error);
        setIsSubmitting(false);
        setLoading(false);
        return;
      }
      
      // Reset selection immediately to prevent re-submission
      setSelectedBeforeYear(null);
      setSelectedBetweenYears(null);
      setSelectedAfterYear(null);
      
      console.log('[Game] Guess submitted successfully, polling for state update...');
      
      // CRITICAL: Poll until we see the state change
      // State will change to either:
      // - 'revealed' if correct (or DJ failed)
      // - 'guessing' with new attempt_seat if wrong
      let attempts = 0;
      const maxAttempts = 15; // More attempts since we might need to wait for next guesser
      const pollInterval = 100;
      
      const previousAttemptSeat = gameState.current_attempt_seat;
      const previousRoundState = gameState.round_state;
      
      while (attempts < maxAttempts && isMountedRef.current) {
        const [updatedGameState, attemptsData, timelinesMap] = await Promise.all([
          fetchGameState(lobby.id),
          fetchAttempts(lobby.id, gameState.current_round_number),
          fetchTimelines(lobby.id)
        ]);
        
        if (updatedGameState && isMountedRef.current) {
          console.log('[Game] Polled game state after guess:', {
            round_state: updatedGameState.round_state,
            attempt_seat: updatedGameState.current_attempt_seat,
            previous_attempt_seat: previousAttemptSeat,
            previous_round_state: previousRoundState
          });
          
          // Update state immediately
          gameStateRef.current = updatedGameState;
          setGameState(updatedGameState);
          
          if (attemptsData && isMountedRef.current) {
            setAttempts(attemptsData);
          }
          
          if (timelinesMap && isMountedRef.current) {
            setAllTimelines(timelinesMap);
            if (playerId) {
              const myTimelineData = timelinesMap.get(playerId) || [];
              setMyTimeline(myTimelineData);
            }
          }
          
          // Check if state changed (either round revealed or next guesser's turn)
          const stateChanged = 
            updatedGameState.round_state !== previousRoundState || // Round state changed
            (updatedGameState.round_state === 'guessing' && 
             updatedGameState.current_attempt_seat !== previousAttemptSeat); // Next guesser's turn
          
          if (stateChanged) {
            console.log('[Game] State changed after guess submission!');
            
            // Fetch show if needed
            if (updatedGameState.show_id) {
              const showData = await fetchShow(updatedGameState.show_id);
              if (showData && isMountedRef.current) {
                setCurrentShow(showData);
              }
            }
            
            break;
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      // Subscriptions will handle other updates automatically
    } catch (err) {
      console.error('[Game] Error submitting guess:', err);
      setError('Failed to submit guess. Please try again.');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  const handleAdvanceRound = async () => {
    if (!isHost || !lobby || !playerId || !gameState) return;
    setLoading(true);
    setError('');
    
    try {
      console.log('[Game] Host advancing round...');
      const result = await advanceRound(lobby.id, playerId);
      
      if ('error' in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      
      console.log('[Game] Round advance action succeeded, polling for new round...');
      
      // CRITICAL: Poll until we see the new round start
      const previousRoundNumber = gameState.current_round_number;
      let attempts = 0;
      const maxAttempts = 15;
      const pollInterval = 100;
      
      while (attempts < maxAttempts && isMountedRef.current) {
        const [updatedGameState, timelinesMap] = await Promise.all([
          fetchGameState(lobby.id),
          fetchTimelines(lobby.id)
        ]);
        
        if (updatedGameState && isMountedRef.current) {
          console.log('[Game] Polled game state after advance:', {
            round_number: updatedGameState.current_round_number,
            previous_round: previousRoundNumber,
            round_state: updatedGameState.round_state
          });
          
          // Update state immediately
          gameStateRef.current = updatedGameState;
          setGameState(updatedGameState);
          
          if (timelinesMap && isMountedRef.current) {
            setAllTimelines(timelinesMap);
            if (playerId) {
              const myTimelineData = timelinesMap.get(playerId) || [];
              setMyTimeline(myTimelineData);
            }
          }
          
          // Check if round number increased (new round started)
          if (updatedGameState.current_round_number > previousRoundNumber) {
            console.log('[Game] New round detected!');
            
            // Fetch new show
            if (updatedGameState.show_id) {
              const showData = await fetchShow(updatedGameState.show_id);
              if (showData && isMountedRef.current) {
                setCurrentShow(showData);
              }
            }
            
            // Clear attempts for new round
            setAttempts([]);
            
            break;
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      // Subscriptions will handle further updates automatically
    } catch (err) {
      console.error('[Game] Error advancing round:', err);
      setError('Failed to advance round. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getPlayerName = (seat: number | null): string => {
    if (seat === null) return 'Unknown';
    const player = players.find(p => p.seat === seat);
    return player?.name || 'Unknown';
  };

  const getPlayerScore = (pId: string): number => {
    return allTimelines.get(pId)?.length || 0;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* Connection Status Indicator */}
        {connectionStatus !== 'connected' && (
          <div className={`rounded-lg p-2 text-center text-sm ${
            connectionStatus === 'reconnecting' 
              ? 'bg-yellow-50 text-yellow-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {connectionStatus === 'reconnecting' 
              ? 'Reconnecting...' 
              : 'Connection lost. Using fallback updates.'}
          </div>
        )}

        {/* Header */}
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Round {gameState.current_round_number}</h1>
              <p className="text-sm text-gray-600">Target: {lobby.target_score} years</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">{myName || 'Unknown Player'}</p>
              <p className="text-2xl font-bold text-purple-600">{getPlayerScore(playerId)}</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
          </div>
          {/* Exit Game Button */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to leave the game? You can rejoin later with the same join code.')) {
                  router.push('/');
                }
              }}
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Exit Game
            </button>
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
                const playerIsDj = player.seat === gameState.current_dj_seat;
                
                return (
                  <div 
                    key={player.id} 
                    className={`flex items-center justify-between rounded-lg p-2 ${
                      isCurrentlyGuessing ? 'bg-purple-100 border-2 border-purple-500' : 
                      playerIsDj ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrentlyGuessing && (
                        <span className="text-purple-600 font-bold text-lg">→</span>
                      )}
                      {playerIsDj && !isCurrentlyGuessing && (
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
                      {playerIsDj && !isCurrentlyGuessing && (
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
                {/* Check if we have a video ID to embed, or if it's a direct video URL */}
                {currentShow.youtube_video_id ? (
                  // We have a video ID - embed it
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900 relative">
                    <iframe
                      key={videoKey} // Key forces reload when changed
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${currentShow.youtube_video_id}?autoplay=1`}
                      title={currentShow.show_name}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                    {/* Replay Button Overlay */}
                    <button
                      onClick={() => setVideoKey(prev => prev + 1)}
                      className="absolute top-2 right-2 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black/90 flex items-center gap-1.5"
                      title="Replay Video"
                    >
                      <span>↻</span>
                      <span>Replay</span>
                    </button>
                  </div>
                ) : currentShow.youtube_url.includes('results?search_query=') ? (
                  // Search URL without resolved video ID - show loading/retry
                  <div className="aspect-video w-full flex items-center justify-center rounded-lg bg-gray-900">
                    <div className="text-center text-white p-6">
                      <p className="text-lg font-semibold mb-4">{currentShow.show_name}</p>
                      <p className="text-sm text-gray-300 mb-4">{currentShow.network} • {currentShow.artist}</p>
                      <p className="text-sm text-gray-400 mb-4">Resolving video...</p>
                      <button
                        onClick={async () => {
                          const showData = await fetchShow(currentShow!.id);
                          if (showData) {
                            setCurrentShow(showData);
                          }
                        }}
                        className="inline-block rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700"
                      >
                        Retry Resolve Video
                      </button>
                    </div>
                  </div>
                ) : (
                  // Direct video URL - extract video ID and embed
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900 relative">
                    <iframe
                      key={videoKey} // Key forces reload when changed
                      width="100%"
                      height="100%"
                      src={currentShow.youtube_url.replace('watch?v=', 'embed/') + '?autoplay=1'}
                      title={currentShow.show_name}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                    {/* Replay Button Overlay */}
                    <button
                      onClick={() => setVideoKey(prev => prev + 1)}
                      className="absolute top-2 right-2 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black/90 flex items-center gap-1.5"
                      title="Replay Video"
                    >
                      <span>↻</span>
                      <span>Replay</span>
                    </button>
                  </div>
                )}
                <div className="text-center text-sm text-gray-600">
                  <p className="font-semibold">{currentShow.show_name}</p>
                  <p>{currentShow.network} • {currentShow.artist}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setVideoKey(prev => prev + 1)}
                    className="flex-1 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    ↻ Replay Video
                  </button>
                  <button
                    onClick={handleDjReady}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Ready - Start Guessing'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                <p className="text-sm text-yellow-800 font-semibold mb-2">
                  Loading show information...
                </p>
                {gameState.show_id && (
                  <button
                    onClick={async () => {
                      const showData = await fetchShow(gameState.show_id!);
                      if (showData) {
                        setCurrentShow(showData);
                      }
                    }}
                    className="text-xs bg-yellow-200 hover:bg-yellow-300 px-3 py-1 rounded"
                  >
                    Retry Load Show
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Guesser Interface */}
        {isGuesser && gameState.round_state === 'guessing' && (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-purple-500">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Your Turn to Guess</h2>
            <p className="mb-3 text-sm text-gray-600">Select where you think the show premiered relative to your timeline.</p>

            {uniqueYears.length === 0 ? (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm text-yellow-800">
                  No years in your timeline yet. You should have 2 starting years. Please refresh the page.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Your Timeline</label>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      onClick={() => {
                        setSelectedBeforeYear(uniqueYears[0]);
                        setSelectedBetweenYears(null);
                        setSelectedAfterYear(null);
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        selectedBeforeYear === uniqueYears[0]
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      &lt; {uniqueYears[0]}
                    </button>

                    {uniqueYears.map((year, index) => {
                      const isLast = index === uniqueYears.length - 1;
                      const nextYear = uniqueYears[index + 1];
                      const isSelectedInBetween = selectedBetweenYears && 
                        (selectedBetweenYears[0] === year || selectedBetweenYears[1] === year);
                      const canSelectAsBetween = !isLast && nextYear;

                      return (
                        <div key={year} className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (canSelectAsBetween) {
                                if (selectedBetweenYears && selectedBetweenYears[0] === year && selectedBetweenYears[1] === nextYear) {
                                  setSelectedBetweenYears(null);
                                } else {
                                  setSelectedBetweenYears([year, nextYear]);
                                }
                                setSelectedBeforeYear(null);
                                setSelectedAfterYear(null);
                              }
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              isSelectedInBetween
                                ? 'bg-purple-600 text-white'
                                : canSelectAsBetween
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                            disabled={!canSelectAsBetween}
                          >
                            {year}
                          </button>
                          {!isLast && <span className="text-gray-400">—</span>}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => {
                        setSelectedAfterYear(uniqueYears[uniqueYears.length - 1]);
                        setSelectedBeforeYear(null);
                        setSelectedBetweenYears(null);
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        selectedAfterYear === uniqueYears[uniqueYears.length - 1]
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {uniqueYears[uniqueYears.length - 1]} &lt;=
                    </button>
                  </div>
                </div>

                {selectedBeforeYear !== null && (
                  <div className="mb-4 rounded-lg bg-purple-50 p-3">
                    <p className="text-sm text-gray-700">
                      Guessing: <span className="font-semibold">Before {selectedBeforeYear}</span>
                    </p>
                  </div>
                )}

                {selectedBetweenYears !== null && (
                  <div className="mb-4 rounded-lg bg-purple-50 p-3">
                    <p className="text-sm text-gray-700">
                      Guessing: <span className="font-semibold">Between {selectedBetweenYears[0]} and {selectedBetweenYears[1]}</span>
                    </p>
                  </div>
                )}

                {selectedAfterYear !== null && (
                  <div className="mb-4 rounded-lg bg-purple-50 p-3">
                    <p className="text-sm text-gray-700">
                      Guessing: <span className="font-semibold">After {selectedAfterYear}</span>
                    </p>
                  </div>
                )}

                <button
                  onClick={handleSubmitGuess}
                  disabled={
                    loading ||
                    isSubmitting ||
                    (selectedBeforeYear === null && selectedBetweenYears === null && selectedAfterYear === null) ||
                    !isGuesser ||
                    gameState.round_state !== 'guessing' ||
                    gameState.current_attempt_seat !== mySeat
                  }
                  className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading || isSubmitting ? 'Submitting...' : 'Submit Guess'}
                </button>
              </>
            )}
          </div>
        )}

        {/* DJ Video During Guessing - Show video with replay for DJ */}
        {isDj && gameState.round_state === 'guessing' && currentShow && (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-blue-200">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Theme Song (DJ View)</h2>
            <div className="space-y-3">
              {currentShow.youtube_video_id ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900 relative">
                  <iframe
                    key={videoKey}
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${currentShow.youtube_video_id}`}
                    title={currentShow.show_name}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                  <button
                    onClick={() => setVideoKey(prev => prev + 1)}
                    className="absolute top-2 right-2 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black/90 flex items-center gap-1.5"
                    title="Replay Video"
                  >
                    <span>↻</span>
                    <span>Replay</span>
                  </button>
                </div>
              ) : currentShow.youtube_url.includes('watch?v=') ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-900 relative">
                  <iframe
                    key={videoKey}
                    width="100%"
                    height="100%"
                    src={currentShow.youtube_url.replace('watch?v=', 'embed/')}
                    title={currentShow.show_name}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                  <button
                    onClick={() => setVideoKey(prev => prev + 1)}
                    className="absolute top-2 right-2 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black/90 flex items-center gap-1.5"
                    title="Replay Video"
                  >
                    <span>↻</span>
                    <span>Replay</span>
                  </button>
                </div>
              ) : null}
              <div className="text-center text-sm text-gray-600">
                <p className="font-semibold">{currentShow.show_name}</p>
                <p>{currentShow.network} • {currentShow.artist}</p>
              </div>
              <button
                onClick={() => setVideoKey(prev => prev + 1)}
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                ↻ Replay Video
              </button>
            </div>
          </div>
        )}

        {/* Waiting for Guess */}
        {gameState.round_state === 'guessing' && !isGuesser && !isDj && (
          <div className="rounded-2xl bg-white p-4 shadow-lg border-2 border-gray-200">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Waiting for Guess</h2>
            <p className="text-sm text-gray-600">
              {getPlayerName(gameState.current_attempt_seat)} is currently guessing...
            </p>
          </div>
        )}

        {/* Attempts List - CRITICAL: Show all attempts including incorrect ones */}
        {attempts.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Attempts (Round {gameState.current_round_number})</h2>
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
                    className={`rounded-lg border-2 p-3 ${
                      attempt.is_correct === true
                        ? 'border-green-500 bg-green-50'
                        : attempt.is_correct === false
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-900">{player?.name || 'Unknown'}</span>
                      {attempt.is_correct !== null && (
                        <span
                          className={`text-sm font-bold px-2 py-1 rounded ${
                            attempt.is_correct 
                              ? 'text-green-700 bg-green-100' 
                              : 'text-red-700 bg-red-100'
                          }`}
                        >
                          {attempt.is_correct ? '✓ Correct!' : '✗ Wrong'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-700">Guessed: {guessText}</p>
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
            {(lobby.status as string) === 'finished' ? (
              <button
                onClick={() => router.push(`/lobby/${code}`)}
                className="mt-4 w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700"
              >
                Return to Lobby
              </button>
            ) : isHost ? (
              <button
                onClick={handleAdvanceRound}
                disabled={loading}
                className="mt-4 w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Next Round'}
              </button>
            ) : (
              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-center text-sm text-gray-700">
                Waiting for host to start next round...
              </div>
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
