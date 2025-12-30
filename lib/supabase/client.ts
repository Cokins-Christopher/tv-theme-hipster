/**
 * CLIENT-SIDE: uses anon key only
 * Safe to use in client components
 */

import { createClient } from '@supabase/supabase-js';

// Access env vars directly (Next.js embeds NEXT_PUBLIC_* vars at build time)
// Fallback to empty string if not set (will be caught by validation)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate env vars
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}\n` +
    `Please set these in Vercel Project Settings → Environment Variables and redeploy.`
  );
}

// Client-side Supabase client with anon key (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

