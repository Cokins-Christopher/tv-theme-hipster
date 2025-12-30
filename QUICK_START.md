# Quick Start Checklist

## ✅ Pre-Flight Checklist

- [ ] `npm install` completed
- [ ] Supabase project created
- [ ] `.env.local` file created with 3 variables
- [ ] `schema.sql` run in Supabase SQL Editor
- [ ] `seed.sql` run in Supabase SQL Editor  
- [ ] Realtime enabled for 5 tables (lobbies, players, game_state, timelines, attempts)
- [ ] `npm run dev` running
- [ ] Browser open to http://localhost:3000

## 🎮 Test Game Flow (2 minutes)

1. **Tab 1**: Create game → Name: "Host" → Get code
2. **Tab 2** (incognito): Join game → Name: "Player" → Enter code
3. **Tab 1**: Set target to 5 → Click "Start Game"
4. **DJ**: Click "Ready" button
5. **Guesser**: Select "Before [year]" → Submit
6. **Host**: Click "Next Round"
7. Repeat until someone wins!

## 🔍 Common Issues

| Issue | Solution |
|-------|----------|
| "Missing environment variables" | Check `.env.local` exists, restart dev server |
| "Invalid join code" | Check code spelling, case doesn't matter |
| No realtime updates | Enable replication in Supabase dashboard |
| YouTube not loading | Seed data has placeholders, replace with real URLs |

## 📝 Your Supabase Credentials

When creating `.env.local`, you need:

1. **Project URL**: From Settings → API → Project URL
2. **Anon Key**: From Settings → API → anon public key  
3. **Service Role Key**: From Settings → API → service_role key (secret!)

---

**Full detailed guide**: See `SETUP_GUIDE.md`

