# TV Theme Hipster - Project Summary

## Project Overview

**TV Theme Hipster** is a multiplayer party game (PWA-style mobile web app) similar to "Hipster", but for TV show theme songs. Players guess when TV shows premiered by placing premiere years into a personal timeline using relative placement ranges, not exact year guesses.

## Core Game Mechanics

### Timeline System

- Each player has a **timeline** (multiset) of years
- At game start, every player begins with **2 random years** (same two years for all players for fairness)
- A "guess" is selecting a **range placement** relative to timeline markers:
  - **Before X**: Show premiered before or in year X
  - **Between X and Y**: Show premiered between X and Y (requires X < Y)
  - **After Y**: Show premiered in or after year Y
- **Tie rules** (boundaries count as wins):
  - Before X is correct if `show_year <= X`
  - Between X and Y is correct if `X <= show_year <= Y`
  - After Y is correct if `show_year >= Y`
- If correct: insert the `show_year` into that player's timeline (keep sorted, duplicates allowed)
- **Score = timeline length** (every correct insertion increases score by +1)
- Game ends when a player's timeline length >= `target_score`

### Round Flow

1. **Host creates lobby** → gets 6-character `join_code`
2. **Players join** with `join_code` + display name
3. **Host sets target score**: 5, 10, or custom integer
4. **Host starts game** → seats/order assigned randomly and persisted
5. **Game proceeds in rounds** with roles:
   - **Guesser** = player whose turn it is (current_guesser_seat)
   - **DJ** = player to Guesser's left (seat+1 wrapping)
   - **Guess chain**: If wrong, goes to Guesser's right (seat-1 wrapping), continuing right until it reaches DJ
   - If DJ fails, nobody scores

### Round Logic

- Each round picks a **random show** from the shows table (avoids repeats until exhausted)
- Only the **DJ can see** the `youtube_url` and play the video (embedded YouTube iframe)
- The **active guesser** (or subsequent guessers to the right if wrong) sees UI to make a range choice using their timeline
- Everyone sees turn info: who is guessing now, who is DJ, which players already attempted
- When someone is correct: reveal the actual year to all, update timeline/score, then advance to next guesser (clockwise seat+1 wrapping) and create next round
- If nobody is correct by the time the guess reaches DJ and fails: reveal the year, no score, advance to next guesser, create next round

## Tech Stack

- **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Realtime)
- **No paid APIs**
- Runs locally with `npm run dev`

## Database Schema

### Tables

1. **shows**

   - `id` (UUID)
   - `show_name` (text)
   - `network` (text)
   - `artist` (text) - who sang it
   - `premiere_year` (int)
   - `youtube_url` (text)
   - `created_at`

2. **lobbies**

   - `id` (UUID)
   - `join_code` (text, unique, 6 chars)
   - `host_player_id` (UUID, nullable)
   - `status` (text: 'waiting', 'playing', 'finished')
   - `target_score` (int, nullable)
   - `created_at`

3. **players**

   - `id` (UUID)
   - `lobby_id` (UUID, FK)
   - `name` (text)
   - `seat` (int, nullable) - 0-based seat number, assigned when game starts
   - `created_at`
   - Unique constraint: `(lobby_id, seat)`

4. **game_state** (one row per active game)

   - `lobby_id` (UUID, PK, FK)
   - `current_round_number` (int)
   - `current_guesser_seat` (int, nullable)
   - `current_dj_seat` (int, nullable)
   - `current_attempt_seat` (int, nullable) - seat of player currently attempting guess
   - `show_id` (UUID, FK, nullable)
   - `round_state` (text: 'dj_ready', 'guessing', 'revealed')
   - `created_at`, `updated_at`

5. **timelines** (stores each year as a separate row to allow duplicates)

   - `id` (UUID)
   - `lobby_id` (UUID, FK)
   - `player_id` (UUID, FK)
   - `year_value` (int)
   - `created_at`

6. **attempts**
   - `id` (UUID)
   - `lobby_id` (UUID, FK)
   - `round_number` (int)
   - `player_id` (UUID, FK)
   - `attempt_order` (int) - order within the round
   - `guess_type` (text: 'before', 'between', 'after')
   - `x_year` (int)
   - `y_year` (int, nullable) - NULL for 'before' and 'after'
   - `is_correct` (boolean, nullable)
   - `created_at`

### RLS Policies

- **Shows**: Public read access
- **Lobbies, Players, Game State, Timelines, Attempts**: Read access for anyone (join_code provides security)
- **Writes**: All mutations go through server actions using service role key (bypasses RLS)

## MVP Requirements

### Authentication

- **No login** (anonymous)
- Store `player_id` in `localStorage` so refresh doesn't create duplicates
- Key: `tv_hipster_player_id`

### Realtime Updates

- Lobby player list
- Game state (current round, current guesser, attempts)
- Timelines (scores)
- All updates via Supabase Realtime subscriptions

### Mobile-First UI

- Responsive design optimized for mobile devices
- Touch-friendly interface

## App Pages

### 1. `/` - Create/Join Page

- Two tabs: "Create Game" and "Join Game"
- Create: Enter name → creates lobby → redirects to lobby
- Join: Enter name + 6-character join code → joins lobby → redirects to lobby

### 2. `/lobby/[code]` - Waiting Room

- Shows join code prominently
- Player list (all players, host highlighted)
- **Host controls**:
  - Set target score (5, 10, or custom)
  - "Start Game" button (requires at least 2 players)
- **Non-host**: See "Waiting for host to start the game..."
- Realtime updates when players join/leave

### 3. `/game/[code]` - Main Game UI

- **Header**: Round number, target score, player's name and score
- **Turn Info**: Shows current guesser, DJ, and attempting player
- **Scores Section**: All players with visual indicators:
  - Arrow (→) and purple highlight for current guesser
  - Headphone icon (🎧) and blue highlight for DJ
- **DJ Interface** (if you're DJ and `round_state === 'dj_ready'`):
  - Embedded YouTube player
  - Show name, network, artist
  - "Ready - Start Guessing" button
- **Guesser Interface** (if you're guesser and `round_state === 'guessing'`):
  - Three guess type buttons: "Before X", "Between X & Y", "After Y"
  - Timeline display with clickable year buttons
  - Selection preview
  - "Submit Guess" button
- **Waiting for Guess** (if guessing mode but not your turn):
  - Shows who is currently guessing
- **Attempts List**: Shows all attempts for current round with correct/wrong indicators
- **Reveal Section** (if `round_state === 'revealed'`):
  - Shows show name, network, artist, premiere year
  - Host sees "Next Round" button
  - Others see "Waiting for host..."
- **Your Timeline**: Shows all years in your timeline (sorted, duplicates shown)

## Server Actions

### Lobby Management (`app/actions/lobby.ts`)

- `createLobby(hostName: string)` → Returns `{ joinCode, playerId, lobbyId }` or `{ error }`
- `joinLobby(joinCode: string, playerName: string)` → Returns `{ playerId, lobbyId }` or `{ error }`
- `setTargetScore(lobbyId: string, hostPlayerId: string, targetScore: number)` → Returns `{ success }` or `{ error }`

### Game Logic (`app/actions/game.ts`)

- `startGame(lobbyId: string, hostPlayerId: string)`:
  - Assigns random seats to all players
  - Chooses 2 random starting years (same for all players)
  - Populates timelines for all players with those 2 years
  - Initializes `game_state`
  - Chooses first random show
  - Sets first guesser (seat 0) and DJ (seat 1)
  - Sets `round_state` to 'dj_ready'
- `submitAttempt(lobbyId, playerId, guessType, xYear, yYear)`:
  - Validates it's player's turn
  - Validates range guess against `premiere_year` with tie rules
  - Writes attempt row
  - If correct: inserts timeline year row for that player
  - Then either: end round & advance OR move attempt to next player to the right
  - If it reaches DJ and DJ fails: end round, no score
- `markDjReady(lobbyId: string, playerId: string)`:
  - Verifies player is DJ
  - Updates `round_state` from 'dj_ready' to 'guessing'
- `advanceRound(lobbyId: string, hostPlayerId: string)`:
  - Chooses next show (avoids repeats)
  - Sets next guesser (clockwise, seat+1 wrapping)
  - Sets DJ (guesser's left)
  - Sets attempt seat to guesser
  - Increments `round_number`
  - Sets `round_state` to 'dj_ready'

## Key Files Structure

```
├── app/
│   ├── actions/
│   │   ├── game.ts          # Game logic server actions
│   │   └── lobby.ts         # Lobby management server actions
│   ├── game/[code]/page.tsx # Main game UI with realtime
│   ├── lobby/[code]/page.tsx # Lobby/waiting room
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page (create/join)
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client Supabase (anon key)
│   │   └── server.ts        # Server Supabase (service role)
│   ├── types.ts             # TypeScript definitions
│   └── utils/
│       ├── join-code.ts     # 6-char code generation
│       └── player.ts        # localStorage player ID management
├── supabase/
│   ├── schema.sql           # Database schema + RLS policies
│   └── seed.sql             # Seed data (24 TV shows)
└── .env.local               # Environment variables (not in git)
```

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Security Model

- **Client-side**: Uses anon key only for reads
- **Server-side**: Uses service role key for all writes (bypasses RLS)
- **RLS Policies**: Read access for all, writes via server actions only
- **Service role key**: Never exposed client-side, only in server actions

## Current Implementation Status

### ✅ Completed

- Database schema with RLS policies
- Seed data (24 TV shows)
- Supabase client setup (anon + service role)
- Server actions for all game logic
- Home page (create/join)
- Lobby page with realtime updates
- Game page with realtime subscriptions
- Player identification via localStorage
- DJ interface with YouTube embed
- Guesser interface with timeline selection
- Visual indicators (arrows, badges) for roles
- Score tracking and display

### 🔧 Known Issues / In Progress

- **Guessing interface not showing**: The guessing UI should appear when `isGuesser === true && round_state === 'guessing'`, but there may be a condition issue
- **Player identification**: Both browsers showing same screen suggests player identification may need debugging
- **Video loading**: Video should load immediately when game starts (recently improved with retry mechanism)
- **Console spam**: Excessive logging (can be reduced in production)

## Setup Instructions

1. **Install dependencies**: `npm install`
2. **Set up Supabase**:
   - Create project at supabase.com
   - Run `supabase/schema.sql` in SQL Editor
   - Run `supabase/seed.sql` in SQL Editor
   - Enable Realtime for: `lobbies`, `players`, `game_state`, `timelines`, `attempts`
3. **Configure environment**: Create `.env.local` with Supabase credentials
4. **Run**: `npm run dev`

## Game Flow Example

1. Host (Cole) creates game → Gets code "ABC123"
2. Player 2 joins with code "ABC123"
3. Host sets target to 5, clicks "Start Game"
4. Game assigns: Cole = seat 0, Player 2 = seat 1
5. Both players get 2 random starting years (e.g., 2004, 2011)
6. Round 1: Cole is guesser (seat 0), Player 2 is DJ (seat 1)
7. DJ sees YouTube video, clicks "Ready"
8. Guesser (Cole) sees timeline [2004, 2011], selects "Before 2011", submits
9. If correct: Year added to Cole's timeline, score increases, round ends
10. Host clicks "Next Round" → New show, next guesser (Player 2), new DJ (Cole)
11. Repeat until someone reaches target score (5 years)

## Key Design Decisions

- **Same starting years for all players**: Ensures fairness, everyone starts equal
- **Multiset timelines**: Duplicates allowed (if year already present, add another copy)
- **Score = timeline length**: Simple, clear scoring
- **Tie rules favor player**: Boundaries count as wins
- **Guess chain**: Wrong guesses pass to the right, creating tension
- **DJ failure = no score**: Prevents easy wins, adds strategy
- **No authentication**: MVP simplicity, localStorage for persistence
- **Service role for writes**: Security through server actions, not RLS complexity
