# TV Theme Hipster

A multiplayer party game where players guess when TV show theme songs premiered by placing years on their personal timeline.

## Tech Stack

- **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Realtime)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Run the schema file:
   - Copy and paste the contents of `supabase/schema.sql` into the SQL Editor
   - Click "Run" to execute
4. Seed the database:
   - Copy and paste the contents of `supabase/seed.sql` into the SQL Editor
   - Click "Run" to execute

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Where to find these values:**
- Go to your Supabase project dashboard
- Navigate to Settings → API
- `NEXT_PUBLIC_SUPABASE_URL` = Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key (⚠️ Keep this secret! Never commit it to git)

### 4. Enable Realtime

In your Supabase dashboard:
1. Go to Database → Replication
2. Enable replication for the following tables:
   - `lobbies`
   - `players`
   - `game_state`
   - `timelines`
   - `attempts`

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Play

1. **Create or Join a Game**
   - Host creates a new game and gets a 6-character join code
   - Players join using the join code

2. **Lobby**
   - Host sets target score (5, 10, or custom)
   - Host starts the game when ready

3. **Gameplay**
   - Each player starts with 2 random years on their timeline
   - Each round, a random TV show theme song is played
   - The DJ (player to the left of the guesser) plays the song
   - The guesser selects a range placement:
     - **Before X**: Show premiered before or in year X
     - **Between X and Y**: Show premiered between X and Y (inclusive)
     - **After Y**: Show premiered in or after year Y
   - If correct, the show's premiere year is added to the player's timeline
   - If wrong, the guess passes to the next player (clockwise)
   - If the DJ fails, no one scores
   - First player to reach the target score wins!

## Game Rules

- **Tie Rules**: Boundaries count as wins
  - "Before X" is correct if `show_year <= X`
  - "Between X and Y" is correct if `X <= show_year <= Y`
  - "After Y" is correct if `show_year >= Y`
- **Timeline**: Duplicate years are allowed (multiset)
- **Score**: Your score equals the number of years in your timeline

## Project Structure

```
├── app/
│   ├── actions/
│   │   ├── game.ts          # Game logic server actions
│   │   └── lobby.ts         # Lobby management server actions
│   ├── game/[code]/         # Game page (main gameplay)
│   ├── lobby/[code]/        # Lobby/waiting room
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page (create/join)
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client-side Supabase (anon key)
│   │   └── server.ts        # Server-side Supabase (service role)
│   ├── types.ts             # TypeScript type definitions
│   └── utils/
│       ├── join-code.ts     # Join code generation
│       └── player.ts        # Player ID localStorage utilities
├── supabase/
│   ├── schema.sql           # Database schema + RLS policies
│   └── seed.sql             # Seed data (TV shows)
└── README.md
```

## Security Notes

- The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS)
- Server actions use the service role key for writes
- Client-side code only uses the anon key for reads
- Never expose the service role key in client-side code

## Development

- The app uses Supabase Realtime for live updates
- Player IDs are stored in localStorage (no authentication required for MVP)
- All game state mutations go through server actions for security

## License

MIT
