'use server';

import { supabaseAdmin } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function startGame(lobbyId: string, hostPlayerId: string): Promise<{ success: boolean } | { error: string }> {
  try {
    // Verify host
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('host_player_id, target_score')
      .eq('id', lobbyId)
      .single();

    if (!lobby || lobby.host_player_id !== hostPlayerId) {
      return { error: 'Only the host can start the game' };
    }

    if (!lobby.target_score) {
      return { error: 'Target score must be set before starting' };
    }

    // Clear previous game data if starting a new game
    await supabaseAdmin
      .from('timelines')
      .delete()
      .eq('lobby_id', lobbyId);
    
    await supabaseAdmin
      .from('attempts')
      .delete()
      .eq('lobby_id', lobbyId);
    
    await supabaseAdmin
      .from('game_state')
      .delete()
      .eq('lobby_id', lobbyId);

    // Get all players
    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('lobby_id', lobbyId)
      .order('created_at', { ascending: true });

    if (playersError || !players || players.length < 2) {
      return { error: 'Need at least 2 players to start' };
    }

    // Assign random seats
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const seatAssignments = shuffled.map((player, index) => ({
      playerId: player.id,
      seat: index,
    }));

    // Update players with seats
    for (const assignment of seatAssignments) {
      await supabaseAdmin
        .from('players')
        .update({ seat: assignment.seat })
        .eq('id', assignment.playerId);
    }

    // Get unique years from shows - each player gets DIFFERENT starting years
    const { data: shows, error: showsError } = await supabaseAdmin
      .from('shows')
      .select('premiere_year')
      .limit(100);

    if (showsError) {
      console.error('[startGame] Error fetching shows:', showsError);
      return { error: `Error fetching shows: ${showsError.message}` };
    }

    if (!shows || shows.length < 2) {
      console.error('[startGame] Not enough shows:', shows?.length || 0);
      return { error: `Not enough shows in database. Found ${shows?.length || 0} shows, need at least 2. Make sure you ran the seed.sql file.` };
    }

    // Get unique years and shuffle
    const uniqueYears = [...new Set(shows.map(s => s.premiere_year))];
    const minYearsNeeded = players.length * 2;
    
    if (uniqueYears.length < minYearsNeeded) {
      return { error: `Not enough unique years. Need at least ${minYearsNeeded} unique years for ${players.length} players, found ${uniqueYears.length}` };
    }

    const shuffledYears = [...uniqueYears].sort(() => Math.random() - 0.5);

    // Give each player 2 DIFFERENT random starting years
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      // Each player gets 2 unique years from different positions in the shuffled array
      const yearIndex1 = i * 2;
      const yearIndex2 = (i * 2) + 1;
      
      const playerYears = [
        shuffledYears[yearIndex1 % shuffledYears.length],
        shuffledYears[yearIndex2 % shuffledYears.length]
      ];
      
      // Ensure we have 2 unique years (in case of wrap-around collision)
      const uniquePlayerYears = [...new Set(playerYears)];
      if (uniquePlayerYears.length < 2) {
        // Find a different year if we got a duplicate
        for (let j = 0; j < shuffledYears.length && uniquePlayerYears.length < 2; j++) {
          if (!uniquePlayerYears.includes(shuffledYears[j])) {
            uniquePlayerYears.push(shuffledYears[j]);
          }
        }
      }
      
      // Insert starting years for this player
      for (const year of uniquePlayerYears.slice(0, 2)) {
        await supabaseAdmin
          .from('timelines')
          .insert({
            lobby_id: lobbyId,
            player_id: player.id,
            year_value: year,
          });
      }
      
      console.log(`[startGame] Player ${i} (${player.id}) got starting years:`, uniquePlayerYears.slice(0, 2));
    }

    // Get a random show for first round
    const { data: allShows, error: allShowsError } = await supabaseAdmin
      .from('shows')
      .select('id')
      .limit(1000);

    if (allShowsError) {
      console.error('[startGame] Error fetching all shows:', allShowsError);
      return { error: `Error fetching shows: ${allShowsError.message}` };
    }

    if (!allShows || allShows.length === 0) {
      console.error('[startGame] No shows available');
      return { error: 'No shows available. Make sure you ran the seed.sql file in Supabase.' };
    }

    const randomShow = allShows[Math.floor(Math.random() * allShows.length)];

    // Initialize game state
    const firstGuesserSeat = 0;
    const firstDjSeat = (firstGuesserSeat + 1) % players.length;

    const { error: gameStateError } = await supabaseAdmin
      .from('game_state')
      .insert({
        lobby_id: lobbyId,
        current_round_number: 1,
        current_guesser_seat: firstGuesserSeat,
        current_dj_seat: firstDjSeat,
        current_attempt_seat: firstGuesserSeat,
        show_id: randomShow.id,
        round_state: 'dj_ready',
      });

    if (gameStateError) {
      return { error: gameStateError.message };
    }

    // Update lobby status
    await supabaseAdmin
      .from('lobbies')
      .update({ status: 'playing' })
      .eq('id', lobbyId);

    return { success: true };
  } catch (error) {
    console.error('Error starting game:', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function submitAttempt(
  lobbyId: string,
  playerId: string,
  guessType: 'before' | 'between' | 'after',
  xYear: number,
  yYear: number | null
): Promise<{ success: boolean; isCorrect: boolean } | { error: string }> {
  try {
    // Get game state
    const { data: gameState } = await supabaseAdmin
      .from('game_state')
      .select('*')
      .eq('lobby_id', lobbyId)
      .single();

    if (!gameState) {
      return { error: 'Game not found' };
    }

    // Get player
    const { data: player } = await supabaseAdmin
      .from('players')
      .select('seat')
      .eq('id', playerId)
      .single();

    if (!player || player.seat === null) {
      return { error: 'Player not found or not seated' };
    }

    // Verify it's this player's turn
    if (player.seat !== gameState.current_attempt_seat) {
      return { error: 'Not your turn' };
    }

    // Validate guess
    if (guessType === 'between' && (yYear === null || xYear >= yYear)) {
      return { error: 'Invalid between guess: Y must be greater than X' };
    }
    if (guessType === 'after' && yYear === null) {
      return { error: 'Invalid after guess: Y year is required' };
    }

    // Get the show
    if (!gameState.show_id) {
      return { error: 'No show selected for this round' };
    }

    const { data: show } = await supabaseAdmin
      .from('shows')
      .select('premiere_year')
      .eq('id', gameState.show_id)
      .single();

    if (!show) {
      return { error: 'Show not found' };
    }

    // Check if guess is correct (with tie rules)
    let isCorrect = false;
    if (guessType === 'before') {
      isCorrect = show.premiere_year <= xYear;
    } else if (guessType === 'between') {
      isCorrect = xYear <= show.premiere_year && show.premiere_year <= yYear!;
    } else if (guessType === 'after') {
      isCorrect = show.premiere_year >= (yYear ?? xYear);
    }

    // Get attempt order (count existing attempts for this round)
    const { data: existingAttempts } = await supabaseAdmin
      .from('attempts')
      .select('id')
      .eq('lobby_id', lobbyId)
      .eq('round_number', gameState.current_round_number);

    const attemptOrder = existingAttempts?.length || 0;

    // Record attempt
    await supabaseAdmin
      .from('attempts')
      .insert({
        lobby_id: lobbyId,
        round_number: gameState.current_round_number,
        player_id: playerId,
        attempt_order: attemptOrder,
        guess_type: guessType,
        x_year: xYear,
        y_year: yYear,
        is_correct: isCorrect,
      });

    if (isCorrect) {
      // Insert year into player's timeline
      await supabaseAdmin
        .from('timelines')
        .insert({
          lobby_id: lobbyId,
          player_id: playerId,
          year_value: show.premiere_year,
        });

      // Check if player won
      const { data: timeline } = await supabaseAdmin
        .from('timelines')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('player_id', playerId);

      const { data: lobby } = await supabaseAdmin
        .from('lobbies')
        .select('target_score')
        .eq('id', lobbyId)
        .single();

      if (lobby && timeline && timeline.length >= lobby.target_score!) {
        // Game over - this player won
        await supabaseAdmin
          .from('lobbies')
          .update({ status: 'finished' })
          .eq('id', lobbyId);
      }

      // End round - reveal and advance
      await supabaseAdmin
        .from('game_state')
        .update({
          round_state: 'revealed',
        })
        .eq('lobby_id', lobbyId);

      // Revalidate to ensure all players see the reveal
      revalidatePath(`/game/[code]`, 'page');

      return { success: true, isCorrect: true };
    } else {
      // Move to next player (clockwise = seat + 1, wrapping)
      const { data: allPlayers } = await supabaseAdmin
        .from('players')
        .select('seat')
        .eq('lobby_id', lobbyId)
        .order('seat', { ascending: true });

      if (!allPlayers) {
        return { error: 'Failed to get players' };
      }

      const currentSeat = player.seat;
      const djSeat = gameState.current_dj_seat;
      const nextSeat = (currentSeat + 1) % allPlayers.length;

      if (nextSeat === djSeat) {
        // Reached DJ, they failed - end round
        await supabaseAdmin
          .from('game_state')
          .update({
            round_state: 'revealed',
          })
          .eq('lobby_id', lobbyId);
      } else {
        // Move attempt to next player
        await supabaseAdmin
          .from('game_state')
          .update({
            current_attempt_seat: nextSeat,
          })
          .eq('lobby_id', lobbyId);
      }

      // Revalidate to ensure all players see the update
      revalidatePath(`/game/[code]`, 'page');

      return { success: true, isCorrect: false };
    }
  } catch (error) {
    console.error('Error submitting attempt:', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function advanceRound(lobbyId: string, hostPlayerId: string): Promise<{ success: boolean } | { error: string }> {
  try {
    // Verify host
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('host_player_id, status')
      .eq('id', lobbyId)
      .single();

    if (!lobby || lobby.host_player_id !== hostPlayerId) {
      return { error: 'Only the host can advance rounds' };
    }

    if (lobby.status !== 'playing') {
      return { error: 'Game is not in progress' };
    }

    // Get game state
    const { data: gameState } = await supabaseAdmin
      .from('game_state')
      .select('*')
      .eq('lobby_id', lobbyId)
      .single();

    if (!gameState) {
      return { error: 'Game state not found' };
    }

    // Get all players
    const { data: players } = await supabaseAdmin
      .from('players')
      .select('seat')
      .eq('lobby_id', lobbyId)
      .order('seat', { ascending: true });

    if (!players) {
      return { error: 'Failed to get players' };
    }

    // Get used shows for this game (to avoid repeats)
    const { data: usedShows } = await supabaseAdmin
      .from('game_state')
      .select('show_id')
      .eq('lobby_id', lobbyId)
      .not('show_id', 'is', null);

    const usedShowIds = usedShows?.map(s => s.show_id).filter(Boolean) || [];

    // Get a random unused show
    let query = supabaseAdmin
      .from('shows')
      .select('id')
      .limit(1000);

    if (usedShowIds.length > 0) {
      query = query.not('id', 'in', `(${usedShowIds.join(',')})`);
    }

    const { data: availableShows } = await query;

    // If all shows used, reset
    const showsToUse = availableShows && availableShows.length > 0 
      ? availableShows 
      : await supabaseAdmin.from('shows').select('id').limit(1000).then(r => r.data);

    if (!showsToUse || showsToUse.length === 0) {
      return { error: 'No shows available' };
    }

    const randomShow = showsToUse[Math.floor(Math.random() * showsToUse.length)];

    // The new DJ should be whoever just guessed correctly (the person who made the correct attempt)
    // The new guesser should be the person right after the new DJ
    // IMPORTANT: Use current_attempt_seat (who actually guessed) not current_guesser_seat (original guesser)
    // because if the original guesser was wrong, the attempt moved to the next player
    const previousAttemptSeat = gameState.current_attempt_seat ?? gameState.current_guesser_seat ?? 0;
    const newDjSeat = previousAttemptSeat; // DJ is the person who just guessed correctly
    const newGuesserSeat = (newDjSeat + 1) % players.length; // Guesser is right after the DJ

    console.log('[advanceRound] Role assignment:', {
      previousAttemptSeat,
      previousGuesserSeat: gameState.current_guesser_seat,
      currentAttemptSeat: gameState.current_attempt_seat,
      newDjSeat,
      newGuesserSeat,
      playersCount: players.length
    });

    // Update game state
    const { error: updateError } = await supabaseAdmin
      .from('game_state')
      .update({
        current_round_number: gameState.current_round_number + 1,
        current_guesser_seat: newGuesserSeat,
        current_dj_seat: newDjSeat,
        current_attempt_seat: newGuesserSeat,
        show_id: randomShow.id,
        round_state: 'dj_ready',
      })
      .eq('lobby_id', lobbyId);

    if (updateError) {
      console.error('[advanceRound] Error updating game state:', updateError);
      return { error: updateError.message || 'Failed to advance round' };
    }

    // Revalidate the game page to ensure all players see the update
    revalidatePath(`/game/[code]`, 'page');

    return { success: true };
  } catch (error) {
    console.error('Error advancing round:', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function markDjReady(lobbyId: string, playerId: string): Promise<{ success: boolean } | { error: string }> {
  try {
    // Get game state
    const { data: gameState } = await supabaseAdmin
      .from('game_state')
      .select('current_dj_seat')
      .eq('lobby_id', lobbyId)
      .single();

    if (!gameState) {
      return { error: 'Game not found' };
    }

    // Get player
    const { data: player } = await supabaseAdmin
      .from('players')
      .select('seat')
      .eq('id', playerId)
      .single();

    if (!player || player.seat === null) {
      return { error: 'Player not found' };
    }

    // Verify player is DJ
    if (player.seat !== gameState.current_dj_seat) {
      return { error: 'You are not the DJ' };
    }

    // Update round state to guessing
    const { error: updateError } = await supabaseAdmin
      .from('game_state')
      .update({ round_state: 'guessing' })
      .eq('lobby_id', lobbyId);

    if (updateError) {
      console.error('[markDjReady] Error updating game state:', updateError);
      return { error: updateError.message || 'Failed to update game state' };
    }

    // Revalidate the game page to ensure all players see the update
    revalidatePath(`/game/[code]`, 'page');

    return { success: true };
  } catch (error) {
    console.error('Error marking DJ ready:', error);
    return { error: 'An unexpected error occurred' };
  }
}

