# Deploy to Vercel

Quick deployment checklist for TV Theme Hipster.

## Prerequisites

- GitHub repository with your code
- Supabase project set up with database schema and seed data
- Vercel account (free tier works)

## Step-by-Step Deployment

### 1. Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel will auto-detect Next.js settings

### 2. Configure Environment Variables

In Vercel project settings → Environment Variables, add:

**Required Variables:**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find these:**
- Supabase Dashboard → Settings → API
- Copy the values exactly (no quotes, no spaces)

**Important:**
- Set all three variables for **Production**, **Preview**, and **Development** environments
- `SUPABASE_SERVICE_ROLE_KEY` is secret - never expose it publicly

### 3. Configure Build Settings

Vercel should auto-detect:
- **Framework Preset:** Next.js
- **Build Command:** `next build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

### 4. Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Check build logs for any errors

### 5. Verify Deployment

**Health Check:**
- Visit `https://your-project.vercel.app/api/health`
- Should return: `{ "ok": true, "timestamp": "...", "service": "tv-theme-hipster" }`

**Test Game Flow:**
1. Open the deployed URL
2. Create a game (enter name, get join code)
3. Open in another browser/incognito window
4. Join with the code
5. Set target score and start game
6. Verify realtime updates work

### 6. Troubleshooting

**Build Fails:**
- Check build logs in Vercel dashboard
- Verify all env vars are set correctly
- Ensure `npm run build` works locally first

**Health Check Fails:**
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check Supabase project is active
- Verify database schema is set up

**Realtime Not Working:**
- Check Supabase Dashboard → Database → Replication
- Ensure replication is enabled for: `lobbies`, `players`, `game_state`, `timelines`, `attempts`

**Environment Variables Not Working:**
- Redeploy after adding env vars (they're injected at build time)
- Check variable names match exactly (case-sensitive)
- Verify no extra spaces or quotes

## Post-Deployment

- Set up custom domain (optional) in Vercel project settings
- Monitor deployments in Vercel dashboard
- Check function logs for any runtime errors

## Quick Test Checklist

- [ ] Health endpoint returns `{ ok: true }`
- [ ] Can create a lobby
- [ ] Can join a lobby with code
- [ ] Can set target score
- [ ] Can start game
- [ ] Videos load for DJ
- [ ] Guessing interface appears
- [ ] Realtime updates work (test in 2 browsers)
- [ ] Game completes successfully

