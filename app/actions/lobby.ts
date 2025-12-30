'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { generateJoinCode } from '@/lib/utils/join-code';
import { revalidatePath } from 'next/cache';

export async function createLobby(hostName: string): Promise<{ joinCode: string; playerId: string; lobbyId: string } | { error: string }> {
  try {
    // Generate unique join code
    let joinCode = generateJoinCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabaseAdmin
        .from('lobbies')
        .select('id')
        .eq('join_code', joinCode)
        .single();
      
      if (!existing) break;
      joinCode = generateJoinCode();
      attempts++;
    }

    if (attempts >= 10) {
      return { error: 'Failed to generate unique join code' };
    }

    // Create lobby
    const { data: lobby, error: lobbyError } = await supabaseAdmin
      .from('lobbies')
      .insert({
        join_code: joinCode,
        status: 'waiting',
      })
      .select()
      .single();

    if (lobbyError || !lobby) {
      return { error: lobbyError?.message || 'Failed to create lobby' };
    }

    // Create host player
    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .insert({
        lobby_id: lobby.id,
        name: hostName,
        seat: null,
      })
      .select()
      .single();

    if (playerError || !player) {
      // Clean up lobby if player creation fails
      await supabaseAdmin.from('lobbies').delete().eq('id', lobby.id);
      return { error: playerError?.message || 'Failed to create player' };
    }

    // Update lobby with host_player_id
    await supabaseAdmin
      .from('lobbies')
      .update({ host_player_id: player.id })
      .eq('id', lobby.id);

    return {
      joinCode,
      playerId: player.id,
      lobbyId: lobby.id,
    };
  } catch (error) {
    console.error('Error creating lobby:', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function joinLobby(joinCode: string, playerName: string): Promise<{ playerId: string; lobbyId: string } | { error: string }> {
  try {
    // Find lobby by join code
    const { data: lobby, error: lobbyError } = await supabaseAdmin
      .from('lobbies')
      .select('id, status')
      .eq('join_code', joinCode.toUpperCase())
      .single();

    if (lobbyError || !lobby) {
      return { error: 'Invalid join code' };
    }

    if (lobby.status !== 'waiting') {
      return { error: 'Game has already started' };
    }

    // Create player
    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .insert({
        lobby_id: lobby.id,
        name: playerName,
        seat: null,
      })
      .select()
      .single();

    if (playerError || !player) {
      return { error: playerError?.message || 'Failed to join lobby' };
    }

    return {
      playerId: player.id,
      lobbyId: lobby.id,
    };
  } catch (error) {
    console.error('Error joining lobby:', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function setTargetScore(lobbyId: string, hostPlayerId: string, targetScore: number): Promise<{ success: boolean } | { error: string }> {
  try {
    console.log('[setTargetScore] Called with:', { lobbyId, hostPlayerId, targetScore });
    
    // Verify host
    const { data: lobby, error: lobbyError } = await supabaseAdmin
      .from('lobbies')
      .select('host_player_id')
      .eq('id', lobbyId)
      .single();

    if (lobbyError) {
      console.error('[setTargetScore] Error fetching lobby:', lobbyError);
      return { error: 'Failed to verify lobby: ' + lobbyError.message };
    }

    if (!lobby) {
      console.error('[setTargetScore] Lobby not found');
      return { error: 'Lobby not found' };
    }

    if (lobby.host_player_id !== hostPlayerId) {
      console.error('[setTargetScore] Not host:', { lobbyHost: lobby.host_player_id, playerId: hostPlayerId });
      return { error: 'Only the host can set target score' };
    }

    console.log('[setTargetScore] Updating target score...');
    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('lobbies')
      .update({ target_score: targetScore })
      .eq('id', lobbyId)
      .select();

    if (updateError) {
      console.error('[setTargetScore] Error updating target score:', updateError);
      return { error: updateError.message || 'Failed to update target score' };
    }

    console.log('[setTargetScore] Success:', updatedData);
    return { success: true };
  } catch (error) {
    console.error('[setTargetScore] Unexpected error:', error);
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}

