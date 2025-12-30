const PLAYER_ID_KEY = 'tv_hipster_player_id';

export function getPlayerId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PLAYER_ID_KEY);
}

export function setPlayerId(playerId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAYER_ID_KEY, playerId);
}

export function clearPlayerId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PLAYER_ID_KEY);
}

