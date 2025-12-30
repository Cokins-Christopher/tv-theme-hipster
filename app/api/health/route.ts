/**
 * SERVER ONLY: Health check endpoint
 * Checks server env vars and Supabase connectivity
 */

import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  try {
    // Check server environment variables
    const env = getServerEnv();
    
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { ok: false, error: 'Missing required environment variables' },
        { status: 500 }
      );
    }

    // Check Supabase connectivity
    const { error } = await supabaseAdmin
      .from('shows')
      .select('id')
      .limit(1);

    if (error) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Supabase connection failed',
          details: error.message 
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ 
      ok: true,
      timestamp: new Date().toISOString(),
      service: 'tv-theme-hipster'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        ok: false, 
        error: 'Health check failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

