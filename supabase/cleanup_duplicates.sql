-- Cleanup script to remove duplicate shows
-- This keeps only the entries with search URLs (the newer ones)
-- and removes the old entries with direct video URLs

-- IMPORTANT: First, we need to handle foreign key constraints
-- Update game_state to point to search URL versions where possible
-- For shows that are referenced in active games, we'll need to handle them carefully

-- Step 1: Find duplicate shows and identify which ones to keep (search URLs)
WITH duplicates_to_delete AS (
  SELECT s1.id
  FROM shows s1
  WHERE s1.youtube_url LIKE '%watch?v=%'
    AND s1.youtube_url NOT LIKE '%results?search_query=%'
    AND EXISTS (
      SELECT 1 FROM shows s2
      WHERE s2.show_name = s1.show_name
        AND s2.network = s1.network
        AND s2.artist = s1.artist
        AND s2.premiere_year = s1.premiere_year
        AND s2.youtube_url LIKE '%results?search_query=%'
    )
)
-- Step 2: Update game_state to point to search URL versions
UPDATE game_state gs
SET show_id = (
  SELECT s2.id
  FROM shows s2
  WHERE s2.show_name = (
    SELECT show_name FROM shows WHERE id = gs.show_id
  )
  AND s2.network = (
    SELECT network FROM shows WHERE id = gs.show_id
  )
  AND s2.youtube_url LIKE '%results?search_query=%'
  LIMIT 1
)
WHERE gs.show_id IN (SELECT id FROM duplicates_to_delete)
  AND EXISTS (
    SELECT 1 FROM shows s2
    WHERE s2.show_name = (SELECT show_name FROM shows WHERE id = gs.show_id)
      AND s2.network = (SELECT network FROM shows WHERE id = gs.show_id)
      AND s2.youtube_url LIKE '%results?search_query=%'
  );

-- Step 3: Now delete the duplicate shows with direct URLs
DELETE FROM shows
WHERE youtube_url LIKE '%watch?v=%'
  AND youtube_url NOT LIKE '%results?search_query=%'
  AND id IN (
    SELECT s1.id
    FROM shows s1
    WHERE EXISTS (
      SELECT 1 FROM shows s2
      WHERE s2.show_name = s1.show_name
        AND s2.network = s1.network
        AND s2.artist = s1.artist
        AND s2.premiere_year = s1.premiere_year
        AND s2.youtube_url LIKE '%results?search_query=%'
    )
  );

-- Verify the cleanup
SELECT show_name, network, COUNT(*) as count
FROM shows
GROUP BY show_name, network
HAVING COUNT(*) > 1
ORDER BY count DESC;

