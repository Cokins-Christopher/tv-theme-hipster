'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { setTargetScore as setTargetScoreAction } from '@/app/actions/lobby';
import { startGame } from '@/app/actions/game';
import { getPlayerId } from '@/lib/utils/player';
import type { Lobby, Player } from '@/lib/types';

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [targetScore, setTargetScore] = useState<number>(5);
  const [customScore, setCustomScore] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = getPlayerId();
    if (!id) {
      router.push('/');
      return;
    }
    setPlayerId(id);

    let lobbyId: string | null = null;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Fetch players function
    const fetchPlayers = async (lobbyIdToFetch: string) => {
      console.log('[Lobby] Fetching players for lobby:', lobbyIdToFetch);
      const { data: playersData, error } = await supabase
        .from('players')
        .select('*')
        .eq('lobby_id', lobbyIdToFetch)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Lobby] Error fetching players:', error);
        return;
      }

      if (playersData) {
        console.log('[Lobby] Players fetched:', playersData.length);
        setPlayers(playersData);
      }
    };

    // Set up players subscription
    const setupPlayersSubscription = (lobbyIdToSubscribe: string) => {
      // Remove any existing players channel
      channels.forEach(ch => {
        if (ch.topic.includes('players-')) {
          supabase.removeChannel(ch);
        }
      });

      const playersChannel = supabase
        .channel(`players-${lobbyIdToSubscribe}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'players',
            filter: `lobby_id=eq.${lobbyIdToSubscribe}`,
          },
          (payload) => {
            console.log('[Lobby] Players change detected:', payload.eventType);
            fetchPlayers(lobbyIdToSubscribe);
          }
        )
        .subscribe((status) => {
          console.log('[Lobby] Players subscription status:', status);
        });

      channels.push(playersChannel);
      return playersChannel;
    };

    // Fetch initial data
    const fetchData = async () => {
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('join_code', code.toUpperCase())
        .single();

      if (lobbyError) {
        console.error('[Lobby] Error fetching lobby:', lobbyError);
        return;
      }

      if (lobbyData) {
        console.log('[Lobby] Lobby fetched:', lobbyData.id, 'Host:', lobbyData.host_player_id, 'My ID:', id, 'Match:', lobbyData.host_player_id === id);
        lobbyId = lobbyData.id;
        setLobby(lobbyData);
        await fetchPlayers(lobbyData.id);
        setupPlayersSubscription(lobbyData.id);

        // Redirect if game started
        if (lobbyData.status === 'playing' || lobbyData.status === 'finished') {
          router.push(`/game/${code}`);
        }
      }
    };

    // Fetch immediately
    fetchData();
    
    // Also set up a polling fallback in case realtime is slow
    const pollInterval = setInterval(() => {
      fetchData();
    }, 2000); // Poll every 2 seconds as backup

    // Subscribe to lobby changes
    const lobbyChannel = supabase
      .channel(`lobby-${code}-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `join_code=eq.${code.toUpperCase()}`,
        },
        async (payload) => {
          console.log('[Lobby] Lobby change detected:', payload.eventType);
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updatedLobby = payload.new as Lobby;
            console.log('[Lobby] Updated lobby:', updatedLobby.id, 'Host:', updatedLobby.host_player_id);
            setLobby(updatedLobby);
            
            // Update players subscription if lobby ID changed
            if (updatedLobby.id && updatedLobby.id !== lobbyId) {
              lobbyId = updatedLobby.id;
              setupPlayersSubscription(updatedLobby.id);
            }
            
            // Always refetch players when lobby updates (in case a player joined)
            if (updatedLobby.id) {
              await fetchPlayers(updatedLobby.id);
            }
            
            if (updatedLobby.status === 'playing' || updatedLobby.status === 'finished') {
              router.push(`/game/${code}`);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Lobby] Lobby subscription status:', status);
      });

    channels.push(lobbyChannel);

    return () => {
      console.log('[Lobby] Cleaning up channels');
      clearInterval(pollInterval);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [code, router]);

  const isHost = useMemo(() => {
    const result = lobby && playerId && lobby.host_player_id === playerId;
    console.log('[Lobby] isHost check:', { 
      hasLobby: !!lobby, 
      hasPlayerId: !!playerId, 
      hostPlayerId: lobby?.host_player_id, 
      myPlayerId: playerId, 
      isHost: result 
    });
    return result;
  }, [lobby, playerId]);

  const handleSetTargetScore = async (score: number) => {
    if (!lobby || !isHost) return;

    setLoading(true);
    setError('');

    try {
      console.log('[Client] Calling setTargetScore with:', { lobbyId: lobby.id, playerId, score });
      const result = await setTargetScoreAction(lobby.id, playerId!, score);
      console.log('[Client] Received result:', result, 'Type:', typeof result);
      setLoading(false);

      if (!result || typeof result !== 'object') {
        console.error('[Client] Invalid result:', result);
        setError('Unexpected response from server. Check console for details.');
        return;
      }

      if ('error' in result) {
        setError(result.error);
      } else {
        setTargetScore(score);
      }
    } catch (err) {
      setLoading(false);
      setError('Failed to set target score. Please try again.');
      console.error('[Client] Error setting target score:', err);
    }
  };

  const handleSetCustomScore = async () => {
    const score = parseInt(customScore);
    if (isNaN(score) || score < 1) {
      setError('Please enter a valid number');
      return;
    }

    await handleSetTargetScore(score);
    setCustomScore('');
  };

  const handleStartGame = async () => {
    if (!lobby || !isHost) return;

    if (!lobby.target_score) {
      setError('Please set a target score first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await startGame(lobby.id, playerId!);
      setLoading(false);

      if (!result || typeof result !== 'object') {
        setError('Unexpected response from server');
        return;
      }

      if ('error' in result) {
        setError(result.error);
      } else {
        router.push(`/game/${code}`);
      }
    } catch (err) {
      setLoading(false);
      setError('Failed to start game. Please try again.');
      console.error('Error starting game:', err);
    }
  };

  if (!lobby) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading lobby...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Lobby</h1>
          <div className="mt-2">
            <p className="text-sm text-gray-600">Join Code</p>
            <p className="text-3xl font-mono font-bold tracking-widest text-purple-600">
              {code.toUpperCase()}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Players ({players.length})</h2>
          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={`rounded-lg border-2 p-3 ${
                  player.id === lobby.host_player_id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{player.name}</span>
                  {player.id === lobby.host_player_id && (
                    <span className="rounded-full bg-purple-600 px-2 py-1 text-xs font-medium text-white">
                      Host
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className="space-y-4 rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
            <h2 className="text-lg font-semibold text-gray-900">Game Settings</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Target Score
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => handleSetTargetScore(5)}
                  disabled={loading}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium transition-colors ${
                    lobby.target_score === 5
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  5
                </button>
                <button
                  onClick={() => handleSetTargetScore(10)}
                  disabled={loading}
                  className={`flex-1 rounded-lg px-4 py-2 font-medium transition-colors ${
                    lobby.target_score === 10
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  10
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  value={customScore}
                  onChange={(e) => setCustomScore(e.target.value)}
                  placeholder="Custom"
                  min="1"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                  disabled={loading}
                />
                <button
                  onClick={handleSetCustomScore}
                  disabled={loading || !customScore}
                  className="rounded-lg bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  Set
                </button>
              </div>
              {lobby.target_score && (
                <p className="mt-2 text-sm text-gray-600">
                  Current target: <span className="font-semibold">{lobby.target_score}</span>
                </p>
              )}
            </div>

            <button
              onClick={handleStartGame}
              disabled={loading || !lobby.target_score || players.length < 2}
              className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Starting...' : 'Start Game'}
            </button>
            {players.length < 2 && (
              <p className="text-sm text-gray-600">Need at least 2 players to start</p>
            )}
          </div>
        )}

        {!isHost && (
          <div className="rounded-lg bg-blue-50 p-4 text-center text-gray-700">
            <p>Waiting for host to start the game...</p>
          </div>
        )}
      </div>
    </div>
  );
}

