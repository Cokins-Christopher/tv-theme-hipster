# Quick Database Check

If you're getting "Not enough shows in database" error, follow these steps:

## Step 1: Verify Shows Table Has Data

1. Go to your Supabase Dashboard
2. Click on **SQL Editor** (left sidebar)
3. Run this query:

```sql
SELECT COUNT(*) FROM shows;
```

**Expected result**: Should show 24 (or however many shows you seeded)

**If it shows 0**: You need to run the seed file (see Step 2)

## Step 2: Run the Seed File

1. In Supabase Dashboard → **SQL Editor**
2. Click **New query**
3. Open `supabase/seed.sql` from your project
4. Copy ALL the contents
5. Paste into SQL Editor
6. Click **Run** (or Cmd/Ctrl + Enter)
7. You should see: "Success. 24 rows inserted" (or similar)

## Step 3: Verify Again

Run the count query again:
```sql
SELECT COUNT(*) FROM shows;
```

Should now show 24.

## Step 4: Check RLS Policies

Make sure the shows table has read access:

```sql
SELECT * FROM pg_policies WHERE tablename = 'shows';
```

Should show a policy allowing SELECT.

## Common Issues

- **"relation 'shows' does not exist"**: You need to run `schema.sql` first
- **"0 rows"**: You need to run `seed.sql`
- **Permission denied**: Check RLS policies (though service role should bypass RLS)

