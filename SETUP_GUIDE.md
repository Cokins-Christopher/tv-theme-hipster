# Step-by-Step Setup & Play Guide

## Part 1: Initial Setup (One-Time)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: `tv-theme-hipster` (or any name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
   - Click "Create new project"
5. Wait 2-3 minutes for project to initialize

### Step 3: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. You'll see:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   - **service_role** key (long string, keep this secret!)

### Step 4: Create Environment File

1. In your project root, create a file named `.env.local`
2. Add these three lines (replace with your actual values):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important**: 
- Replace `xxxxx` with your actual project ID
- Copy the full keys from Supabase dashboard
- Never commit this file to git (it should already be in .gitignore)

### Step 5: Set Up Database Schema

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `supabase/schema.sql` from your project
4. Copy ALL the contents
5. Paste into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

### Step 6: Seed the Database

1. Still in SQL Editor, click **New query**
2. Open `supabase/seed.sql` from your project
3. Copy ALL the contents
4. Paste into the SQL Editor
5. Click **Run**
6. You should see "Success. 24 rows inserted" (or similar)

### Step 7: Enable Realtime

1. In Supabase dashboard, go to **Database** → **Replication** (left sidebar)
2. For each of these tables, toggle the switch to **ON**:
   - ✅ `lobbies`
   - ✅ `players`
   - ✅ `game_state`
   - ✅ `timelines`
   - ✅ `attempts`
3. Leave `shows` OFF (we don't need realtime for it)

### Step 8: Start the Development Server

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 16.1.1
  - Local:        http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Part 2: Playing the Game

### Step 1: Create a Game (Host)

1. Open http://localhost:3000
2. You should see "TV Theme Hipster" with two tabs: "Create Game" and "Join Game"
3. Make sure "Create Game" tab is selected
4. Enter your name (e.g., "Alice")
5. Click **"Create Game"**
6. You'll be redirected to the lobby page
7. **Write down the 6-letter join code** (e.g., "ABC123") - you'll need this!

### Step 2: Join the Game (Player 2+)

**Option A: Same Computer (Testing)**
- Open a new browser tab (or incognito/private window)
- Go to http://localhost:3000
- Click **"Join Game"** tab
- Enter a different name (e.g., "Bob")
- Enter the join code from Step 1
- Click **"Join Game"**

**Option B: Different Device**
- Make sure both devices are on the same network
- Find your computer's local IP address:
  - Mac: System Settings → Network → your connection → IP address
  - Windows: `ipconfig` in terminal, look for IPv4 Address
- On the other device, go to `http://YOUR_IP:3000` (e.g., `http://192.168.1.100:3000`)
- Join with the same code

### Step 3: Set Target Score (Host Only)

1. In the lobby, you should see all players listed
2. As the host, you'll see "Game Settings" section
3. Choose a target score:
   - Click **"5"** for a quick game
   - Click **"10"** for a longer game
   - Or enter a custom number and click **"Set"**
4. The current target will be shown below

### Step 4: Start the Game (Host Only)

1. Make sure you have at least 2 players in the lobby
2. Click **"Start Game"** button
3. Everyone will be redirected to the game page

### Step 5: Understanding the Game Screen

You'll see:
- **Top**: Round number, target score, your current score
- **Turn Info**: Who is guessing, who is the DJ
- **Scores**: All players' current scores
- **Your Timeline**: Your years (starts with 2 random years)

### Step 6: Playing a Round

#### If You're the DJ:
1. You'll see an embedded YouTube player
2. Click the play button to hear the theme song
3. When ready, click **"Ready - Start Guessing"**
4. The guesser can now make their guess

#### If It's Your Turn to Guess:
1. You'll see "Your Turn to Guess" section
2. Choose a guess type:
   - **Before X**: Show premiered before or in year X
   - **Between X & Y**: Show premiered between X and Y (inclusive)
   - **After Y**: Show premiered in or after year Y
3. Tap years from your timeline to select:
   - For "Before": Tap one year (becomes X)
   - For "Between": Tap two years (first = X, second = Y, must be X < Y)
   - For "After": Tap one year (becomes Y)
4. Review your selection (shown in purple box)
5. Click **"Submit Guess"**

#### What Happens Next:

**If you're correct:**
- The show's premiere year is added to your timeline
- Your score increases by 1
- Round ends, everyone sees the answer
- Host clicks "Next Round" to continue

**If you're wrong:**
- Guess passes to the next player (clockwise)
- They get to try
- This continues until someone is correct OR it reaches the DJ
- If DJ fails, no one scores, round ends

### Step 7: Winning the Game

- First player to reach the target score wins!
- Game status changes to "finished"
- You can see final scores

---

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env.local` exists in the project root
- Check that all three variables are set
- Restart the dev server after creating/editing `.env.local`

### "Failed to generate unique join code"
- Very rare, just try creating a new game

### "Invalid join code"
- Make sure you're using the exact 6-letter code (case-insensitive)
- Check for typos

### Realtime not working (updates not showing)
- Go to Supabase → Database → Replication
- Make sure all 5 tables have replication enabled
- Refresh the browser

### Can't see YouTube videos
- The seed data uses placeholder URLs
- Replace them in the database with real YouTube embed URLs
- Format: `https://www.youtube.com/watch?v=VIDEO_ID`
- Or use: `https://www.youtube.com/embed/VIDEO_ID`

### Game stuck / not advancing
- Check browser console for errors (F12)
- Make sure server actions are working (check terminal)
- Try refreshing the page

---

## Quick Test Flow

1. **Terminal 1**: Run `npm run dev`
2. **Browser Tab 1**: Create game as "Alice" → Get code "ABC123"
3. **Browser Tab 2** (incognito): Join as "Bob" with code "ABC123"
4. **Tab 1**: Set target to 5, click "Start Game"
5. **Tab 1**: If you're DJ, click "Ready"
6. **Tab 2**: If you're guessing, select "Before 2000", submit
7. See result, host clicks "Next Round"
8. Repeat until someone wins!

---

## Next Steps After Setup

- Replace placeholder YouTube URLs with real ones
- Add more shows to the database
- Customize the UI colors/styling
- Add sound effects or animations
- Implement a winner celebration screen

Enjoy playing! 🎮

