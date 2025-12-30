# .env.local Troubleshooting

## The Error You're Seeing

```
Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in your .env.local
```

This means Next.js can't find the `SUPABASE_SERVICE_ROLE_KEY` variable.

## ✅ Correct .env.local Format

Your `.env.local` file should look **exactly** like this (no quotes, no spaces around `=`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0NTE5MjgwMCwiZXhwIjoxOTYwNzY4ODAwfQ.xxxxx
```

## ❌ Common Mistakes

### 1. Quotes Around Values
```env
# ❌ WRONG
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# ✅ CORRECT
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Spaces Around Equals
```env
# ❌ WRONG
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ✅ CORRECT
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Wrong Variable Name
```env
# ❌ WRONG
SUPABASE_SERVICE_KEY=...
SERVICE_ROLE_KEY=...
SUPABASE_ROLE_KEY=...

# ✅ CORRECT
SUPABASE_SERVICE_ROLE_KEY=...
```

### 4. Missing Variable
Make sure you have **all three** variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5. File in Wrong Location
The `.env.local` file must be in the **project root** (same folder as `package.json`):

```
tv-theme-hipster/
├── .env.local          ← HERE
├── package.json
├── app/
├── lib/
└── ...
```

## 🔧 Fix Steps

1. **Open `.env.local` in your editor**

2. **Check each line:**
   - No quotes around values
   - No spaces before/after `=`
   - Exact variable names (case-sensitive)
   - All three variables present

3. **Save the file**

4. **Restart your dev server:**
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

   ⚠️ **Important**: Next.js only reads `.env.local` on startup. You MUST restart after changing it!

## 🧪 Quick Test

After fixing, you should see:
- No error messages in terminal
- Home page loads at http://localhost:3000
- You can create/join a game

## 📍 Where to Find Your Keys

1. Go to [supabase.com](https://supabase.com) → Your Project
2. Click **Settings** (gear icon) → **API**
3. You'll see:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ (secret!)

## Still Not Working?

1. **Double-check the file name**: Must be exactly `.env.local` (not `.env`, `.env.local.txt`, etc.)

2. **Check for hidden characters**: Copy-paste the variable names from this guide

3. **Verify file encoding**: Should be UTF-8 (most editors default to this)

4. **Try creating a fresh file**:
   ```bash
   # Delete old one
   rm .env.local
   
   # Create new one with correct format
   # (copy the format from above)
   ```

5. **Check terminal output**: After restarting, you should NOT see the error message

