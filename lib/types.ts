export interface Show {
  id: string;
  show_name: string;
  network: string;
  artist: string;
  premiere_year: number;
  youtube_url: string;
  created_at: string;
}

export interface Lobby {
  id: string;
  join_code: string;
  host_player_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  target_score: number | null;
  created_at: string;
}

export interface Player {
  id: string;
  lobby_id: string;
  name: string;
  seat: number | null;
  created_at: string;
}

export interface GameState {
  lobby_id: string;
  current_round_number: number;
  current_guesser_seat: number | null;
  current_dj_seat: number | null;
  current_attempt_seat: number | null;
  show_id: string | null;
  round_state: 'dj_ready' | 'guessing' | 'revealed';
  created_at: string;
  updated_at: string;
}

export interface Timeline {
  id: string;
  lobby_id: string;
  player_id: string;
  year_value: number;
  created_at: string;
}

export interface Attempt {
  id: string;
  lobby_id: string;
  round_number: number;
  player_id: string;
  attempt_order: number;
  guess_type: 'before' | 'between' | 'after';
  x_year: number;
  y_year: number | null;
  is_correct: boolean | null;
  created_at: string;
}

export type GuessType = 'before' | 'between' | 'after';

