'use server';

import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Checks if a YouTube video is available/embeddable
 */
async function checkVideoAvailability(videoId: string): Promise<boolean> {
  try {
    // Try to fetch the oEmbed API to check if video exists and is embeddable
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return !!data.html; // If we get HTML back, video is embeddable
    }
    
    // If oEmbed fails, try checking the video page directly
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (videoPageResponse.ok) {
      const html = await videoPageResponse.text();
      // Check if video is unavailable (common patterns)
      if (html.includes('Video unavailable') || html.includes('Private video') || html.includes('This video is not available')) {
        return false;
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[checkVideoAvailability] Error checking video ${videoId}:`, error);
    return false;
  }
}

/**
 * Resolves a YouTube search URL to multiple video IDs
 * Returns an array of video IDs found in the search results
 */
async function resolveYouTubeSearchUrl(searchUrl: string, maxResults = 5): Promise<string[]> {
  try {
    // Extract search query from URL
    const url = new URL(searchUrl);
    const searchQuery = url.searchParams.get('search_query');
    
    if (!searchQuery) {
      console.error('[resolveYouTubeSearch] No search_query found in URL');
      return [];
    }

    // Fetch the YouTube search page
    const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error('[resolveYouTubeSearch] Failed to fetch YouTube search page:', response.status);
      return [];
    }

    const html = await response.text();
    const videoIds: string[] = [];
    
    // YouTube stores video data in a script tag with var ytInitialData
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.+?});/);
    
    if (ytInitialDataMatch) {
      try {
        const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
        
        // Navigate through YouTube's data structure to find videos
        const contents = ytInitialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        
        if (contents && Array.isArray(contents)) {
          for (const section of contents) {
            const items = section?.itemSectionRenderer?.contents;
            if (items && Array.isArray(items)) {
              for (const item of items) {
                if (item.videoRenderer?.videoId) {
                  const videoId = item.videoRenderer.videoId;
                  if (!videoIds.includes(videoId)) {
                    videoIds.push(videoId);
                    if (videoIds.length >= maxResults) {
                      break;
                    }
                  }
                }
              }
            }
            if (videoIds.length >= maxResults) {
              break;
            }
          }
        }
      } catch (parseError) {
        console.error('[resolveYouTubeSearch] Failed to parse ytInitialData:', parseError);
      }
    }
    
    // Fallback: Extract video IDs from HTML patterns
    if (videoIds.length === 0) {
      const videoIdMatches = html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
      for (const match of videoIdMatches) {
        if (match[1] && !videoIds.includes(match[1])) {
          videoIds.push(match[1]);
          if (videoIds.length >= maxResults) {
            break;
          }
        }
      }
    }
    
    console.log(`[resolveYouTubeSearch] Found ${videoIds.length} video IDs`);
    return videoIds;
  } catch (error) {
    console.error('[resolveYouTubeSearch] Error resolving YouTube search URL:', error);
    return [];
  }
}

/**
 * Resolves a YouTube search URL to a video ID and caches it in the database
 */
export async function resolveShowVideoId(showId: string): Promise<{ videoId: string } | { error: string }> {
  try {
    // Get the show
    const { data: show, error: showError } = await supabaseAdmin
      .from('shows')
      .select('youtube_url, youtube_video_id')
      .eq('id', showId)
      .single();

    if (showError || !show) {
      return { error: 'Show not found' };
    }

    // If we already have a video ID, return it
    if (show.youtube_video_id) {
      return { videoId: show.youtube_video_id };
    }

    // Check if it's a search URL
    if (!show.youtube_url.includes('results?search_query=')) {
      // It's already a direct video URL, extract the video ID
      const videoIdMatch = show.youtube_url.match(/(?:watch\?v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        // Check if video is available before caching
        const isAvailable = await checkVideoAvailability(videoId);
        if (isAvailable) {
          // Cache it
          await supabaseAdmin
            .from('shows')
            .update({ youtube_video_id: videoId })
            .eq('id', showId);
          return { videoId };
        } else {
          return { error: 'Video is unavailable or not embeddable' };
        }
      }
      return { error: 'Invalid YouTube URL format' };
    }

    // Resolve the search URL - get multiple video IDs
    const videoIds = await resolveYouTubeSearchUrl(show.youtube_url, 5);
    
    if (videoIds.length === 0) {
      return { error: 'Could not find any videos in search results' };
    }

    // Try each video ID until we find one that's available
    let resolvedVideoId: string | null = null;
    for (const videoId of videoIds) {
      console.log(`[resolveShowVideoId] Checking video availability: ${videoId}`);
      const isAvailable = await checkVideoAvailability(videoId);
      
      if (isAvailable) {
        resolvedVideoId = videoId;
        console.log(`[resolveShowVideoId] Found available video: ${videoId}`);
        break;
      } else {
        console.log(`[resolveShowVideoId] Video ${videoId} is unavailable, trying next...`);
      }
    }
    
    if (!resolvedVideoId) {
      return { error: `None of the ${videoIds.length} videos found are available or embeddable` };
    }

    // Cache the video ID in the database
    await supabaseAdmin
      .from('shows')
      .update({ youtube_video_id: resolvedVideoId })
      .eq('id', showId);

    return { videoId: resolvedVideoId };
  } catch (error) {
    console.error('[resolveShowVideoId] Error:', error);
    return { error: 'An unexpected error occurred' };
  }
}

