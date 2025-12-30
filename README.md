# TV Theme Hipster 🎵

A multiplayer party game inspired by "Hipster" where players guess when TV show theme songs premiered by placing years on their personal timeline. No exact year guessing required—just relative placement!

## 🎮 What is This Game?

**TV Theme Hipster** is a real-time multiplayer web game where:

- Players listen to TV show theme songs
- Each player has a personal timeline of premiere years
- Players guess where a show's premiere year fits relative to their timeline
- First player to reach the target score wins!

### How It Works

1. **Timeline-Based Guessing**: Instead of guessing exact years, players place shows relative to years they already have
2. **Relative Placement**: Choose "Before X", "Between X and Y", or "After Y"
3. **Progressive Scoring**: Correct guesses add the show's year to your timeline, expanding your knowledge
4. **Real-Time Multiplayer**: All players see updates instantly via Supabase Realtime

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)

### Installation

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd tv-theme-hipster
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Supabase Database**

   Create a new project at [supabase.com](https://supabase.com), then:

   - Open the SQL Editor in your Supabase dashboard
   - Run `supabase/schema.sql` to create all tables and policies
   - Run `supabase/seed.sql` to populate with TV shows
   - If you have an existing database, run `supabase/migration_add_youtube_video_id.sql` first

4. **Configure Environment Variables**

   Create a `.env.local` file in the root directory:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

   Find these values in: **Supabase Dashboard → Settings → API**

5. **Enable Realtime**

   In Supabase Dashboard → Database → Replication, enable replication for:

   - `lobbies`
   - `players`
   - `game_state`
   - `timelines`
   - `attempts`

6. **Run the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎯 How to Play

### Starting a Game

1. **Host creates a game**

   - Enter your name on the home page
   - Click "Create Game"
   - Share the 6-character join code with friends

2. **Players join**

   - Enter your name
   - Enter the join code
   - Wait in the lobby

3. **Host sets up**
   - Choose target score (5, 10, or custom)
   - Click "Start Game" when everyone is ready

### Gameplay Flow

**Each Round:**

1. **DJ Plays the Song**

   - One player is the DJ (starts with the host)
   - DJ sees the show name and plays the YouTube video
   - DJ clicks "Ready - Start Guessing" when ready

2. **Guesser Makes a Choice**

   - One player is the guesser (rotates each round)
   - Guesser sees their timeline with years
   - Select where the show's premiere year fits:
     - **Before X**: Show premiered before or in year X
     - **Between X and Y**: Show premiered between X and Y (inclusive)
     - **After Y**: Show premiered in or after year Y

3. **Result**

   - ✅ **Correct**: Year is added to your timeline, round ends, you become the next DJ
   - ❌ **Wrong**: Next player (clockwise) gets to guess
   - If the DJ is reached without a correct guess, round ends with no points

4. **Next Round**
   - Host clicks "Next Round" to continue
   - Roles rotate: Previous correct guesser becomes DJ, next player becomes guesser

### Winning

- First player to reach the target score wins!
- Game ends and shows final scoreboard with everyone's timelines

## 📋 Game Rules

### Tie Rules (Boundaries Count as Wins)

- **"Before X"** is correct if `show_year <= X`
- **"Between X and Y"** is correct if `X <= show_year <= Y`
- **"After Y"** is correct if `show_year >= Y`

### Timeline Rules

- Each player starts with 2 random years
- Duplicate years are allowed (multiset)
- Your score = number of years in your timeline

### Role Rotation

- Host is always the first DJ
- Second player is always the first guesser
- After each correct guess, the guesser becomes the next DJ
- Roles rotate clockwise around the table

## 🛠️ Tech Stack

- **Next.js 16** (App Router) - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Backend (PostgreSQL + Realtime subscriptions)
- **Server Actions** - Secure server-side mutations

## 📁 Project Structure

```
├── app/
│   ├── actions/
│   │   ├── game.ts          # Game logic (start, submit guess, advance round)
│   │   ├── lobby.ts         # Lobby management (create, join, set score)
│   │   └── shows.ts         # Video resolution from YouTube search URLs
│   ├── game/[code]/         # Main game page (real-time gameplay)
│   ├── lobby/[code]/        # Lobby/waiting room
│   ├── test-videos/         # Test page to preview all videos
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page (create/join)
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client-side Supabase (anon key)
│   │   └── server.ts        # Server-side Supabase (service role)
│   ├── types.ts             # TypeScript type definitions
│   └── utils/
│       ├── join-code.ts     # 6-character join code generation
│       └── player.ts        # Player ID localStorage utilities
├── supabase/
│   ├── schema.sql           # Database schema + RLS policies
│   ├── seed.sql             # Seed data (24 TV shows)
│   └── migration_add_youtube_video_id.sql  # Migration for existing DBs
└── README.md
```

## 🎬 Video System

The game uses YouTube search URLs that automatically resolve to the first available video:

- Videos are resolved on-demand when a game starts
- If the first video is unavailable, the system tries the next result
- Resolved video IDs are cached in the database
- Test all videos at `/test-videos` page

## 🔒 Security

- **Server Actions**: All mutations go through server actions (never expose service role key)
- **Row Level Security (RLS)**: Database policies control access
- **Client vs Server**:
  - Client uses anon key (read-only with RLS)
  - Server uses service role key (bypasses RLS for writes)
- **No Authentication**: MVP uses anonymous player IDs stored in localStorage

## 🧪 Testing

- **Test Videos Page**: Visit `/test-videos` to preview all shows and test video resolution
- **Local Development**: Run `npm run dev` and open multiple browser windows to test multiplayer

## 📝 Development Notes

- **Realtime Updates**: Uses Supabase Realtime subscriptions for live game state
- **Polling Fallback**: Includes polling mechanism for critical state transitions
- **Mobile-First**: Designed for mobile web (PWA-ready)
- **No External APIs**: All functionality uses Supabase (no paid APIs required)

### Build & Deploy

**Local build:**

```bash
npm run build    # Build for production
npm run start    # Start production server
npm run check    # Type check + lint
```

**Health check:**

- Local: `http://localhost:3000/api/health`
- Production: `https://your-domain.vercel.app/api/health`

### Environment Variables

**Server-only (never exposed to client):**

- `SUPABASE_SERVICE_ROLE_KEY` - Used only in server actions/API routes

**Client-safe (exposed via `NEXT_PUBLIC_` prefix):**

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (respects RLS)

All env vars are validated at runtime with clear error messages.

## 🐛 Troubleshooting

**Videos not loading?**

- Check that Realtime is enabled in Supabase
- Visit `/test-videos` to resolve videos manually
- Check browser console for errors

**Game state not updating?**

- Verify Realtime replication is enabled for all game tables
- Check that environment variables are set correctly
- Restart the dev server after changing `.env.local`

**Database errors?**

- Make sure you ran `schema.sql` first
- Then run `seed.sql` to populate shows
- Check Supabase dashboard for any errors

## 📄 License

MIT

---

**Enjoy playing TV Theme Hipster!** 🎉
