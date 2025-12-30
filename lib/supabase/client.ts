/**
 * CLIENT-SIDE: uses anon key only
 * Safe to use in client components
 */

import { createClient } from '@supabase/supabase-js';
import { getClientEnv } from '../env';

// Validate env vars at module load time
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getClientEnv();

// Client-side Supabase client with anon key (respects RLS)
export const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

