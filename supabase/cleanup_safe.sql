-- Safe cleanup: Removes duplicates while preserving active games
-- This script keeps search URL entries and removes direct URL duplicates
-- It also handles foreign key constraints properly

-- Step 1: Update game_state to use search URL versions where duplicates exist
UPDATE game_state gs
SET show_id = (
  SELECT s2.id
  FROM shows s1
  JOIN shows s2 ON (
    s1.show_name = s2.show_name
    AND s1.network = s2.network
    AND s1.artist = s2.artist
    AND s1.premiere_year = s2.premiere_year
  )
  WHERE s1.id = gs.show_id
    AND s1.youtube_url LIKE '%watch?v=%'
    AND s1.youtube_url NOT LIKE '%results?search_query=%'
    AND s2.youtube_url LIKE '%results?search_query=%'
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM shows s1
  JOIN shows s2 ON (
    s1.show_name = s2.show_name
    AND s1.network = s2.network
    AND s1.artist = s2.artist
    AND s1.premiere_year = s2.premiere_year
  )
  WHERE s1.id = gs.show_id
    AND s1.youtube_url LIKE '%watch?v=%'
    AND s1.youtube_url NOT LIKE '%results?search_query=%'
    AND s2.youtube_url LIKE '%results?search_query=%'
);

-- Step 2: Delete duplicate shows with direct URLs (only if they have a search URL duplicate)
DELETE FROM shows
WHERE youtube_url LIKE '%watch?v=%'
  AND youtube_url NOT LIKE '%results?search_query=%'
  AND EXISTS (
    SELECT 1
    FROM shows s2
    WHERE s2.show_name = shows.show_name
      AND s2.network = shows.network
      AND s2.artist = shows.artist
      AND s2.premiere_year = shows.premiere_year
      AND s2.youtube_url LIKE '%results?search_query=%'
  )
  AND id NOT IN (
    -- Don't delete if still referenced in game_state (shouldn't happen after step 1, but safety check)
    SELECT DISTINCT show_id FROM game_state WHERE show_id IS NOT NULL
  );

-- Step 3: Verify cleanup
SELECT 
  show_name, 
  network, 
  COUNT(*) as count,
  STRING_AGG(DISTINCT CASE WHEN youtube_url LIKE '%results?search_query=%' THEN 'SEARCH' ELSE 'DIRECT' END, ', ') as url_types
FROM shows
GROUP BY show_name, network
HAVING COUNT(*) > 1
ORDER BY count DESC;

