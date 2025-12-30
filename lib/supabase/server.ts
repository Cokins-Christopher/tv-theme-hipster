/**
 * SERVER ONLY: uses service role key
 * This file must NEVER be imported in client components
 */

import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '../env';

// Validate env vars at module load time
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

// Server-side client with service role key (bypasses RLS)
// This client has full database access and should only be used in server actions/API routes
export const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

