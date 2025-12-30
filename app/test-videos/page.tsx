'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { resolveShowVideoId } from '@/app/actions/shows';
import type { Show } from '@/lib/types';

export default function TestVideosPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    fetchShows();
  }, []);

  const fetchShows = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('shows')
        .select('*')
        .order('premiere_year', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setShows(data || []);
    } catch (err) {
      setError('Failed to fetch shows');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveVideo = async (showId: string) => {
    setResolving(prev => new Set(prev).add(showId));
    setError('');

    try {
      const result = await resolveShowVideoId(showId);
      
      if ('error' in result) {
        setError(`Failed to resolve: ${result.error}`);
      } else {
        // Refetch shows to get updated video ID
        await fetchShows();
      }
    } catch (err) {
      setError('Failed to resolve video');
      console.error(err);
    } finally {
      setResolving(prev => {
        const next = new Set(prev);
        next.delete(showId);
        return next;
      });
    }
  };

  const getEmbedUrl = (show: Show): string | null => {
    if (show.youtube_video_id) {
      return `https://www.youtube.com/embed/${show.youtube_video_id}`;
    }
    
    // If it's a direct video URL, convert to embed
    if (show.youtube_url.includes('watch?v=')) {
      return show.youtube_url.replace('watch?v=', 'embed/');
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading shows...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-900">Video Test Page</h1>
          <p className="mt-2 text-gray-600">
            Test all {shows.length} shows. Click "Resolve Video" to automatically find and embed the first available video from search results.
          </p>
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shows.map((show) => {
            const embedUrl = getEmbedUrl(show);
            const isResolving = resolving.has(show.id);
            const isSearchUrl = show.youtube_url.includes('results?search_query=');

            return (
              <div
                key={show.id}
                className="rounded-2xl bg-white p-4 shadow-lg"
              >
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-gray-900">{show.show_name}</h2>
                  <p className="text-sm text-gray-600">{show.network} • {show.artist}</p>
                  <p className="text-xs text-gray-500">Premiered: {show.premiere_year}</p>
                </div>

                {/* Video Embed or Placeholder */}
                <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
                  {embedUrl ? (
                    <iframe
                      width="100%"
                      height="100%"
                      src={embedUrl}
                      title={show.show_name}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white">
                      <div className="text-center">
                        <p className="mb-2 text-sm">No video loaded</p>
                        {isSearchUrl && (
                          <p className="text-xs text-gray-400">Click "Resolve Video" to load</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status and Actions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Status:</span>
                    <span
                      className={`rounded px-2 py-1 font-medium ${
                        show.youtube_video_id
                          ? 'bg-green-100 text-green-700'
                          : isSearchUrl
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {show.youtube_video_id
                        ? '✓ Resolved'
                        : isSearchUrl
                        ? '⏳ Not Resolved'
                        : 'Direct URL'}
                    </span>
                  </div>

                  {show.youtube_video_id && (
                    <div className="text-xs text-gray-500">
                      Video ID: {show.youtube_video_id}
                    </div>
                  )}

                  {isSearchUrl && !show.youtube_video_id && (
                    <button
                      onClick={() => handleResolveVideo(show.id)}
                      disabled={isResolving}
                      className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                    >
                      {isResolving ? 'Resolving...' : 'Resolve Video'}
                    </button>
                  )}

                  {show.youtube_video_id && (
                    <button
                      onClick={() => handleResolveVideo(show.id)}
                      disabled={isResolving}
                      className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50"
                    >
                      {isResolving ? 'Re-resolving...' : 'Re-resolve Video'}
                    </button>
                  )}

                  <a
                    href={show.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Open YouTube
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Summary</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-purple-50 p-4">
              <p className="text-sm text-gray-600">Total Shows</p>
              <p className="text-2xl font-bold text-purple-600">{shows.length}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-green-600">
                {shows.filter(s => s.youtube_video_id).length}
              </p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {shows.filter(s => !s.youtube_video_id && s.youtube_url.includes('results?search_query=')).length}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-gray-600">Direct URLs</p>
              <p className="text-2xl font-bold text-blue-600">
                {shows.filter(s => !s.youtube_url.includes('results?search_query=')).length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

