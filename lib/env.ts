/**
 * Environment variable validation
 * Validates required env vars at runtime with clear error messages
 */

function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  
  if (required && (!value || value.trim() === '')) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `Please set ${name} in your .env.local file or Vercel environment variables.`
    );
  }
  
  return value || '';
}

/**
 * Server-side environment variables
 * These should NEVER be exposed to the client
 */
export function getServerEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() can only be called on the server');
  }

  return {
    SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  };
}

/**
 * Client-side environment variables
 * These are safe to use in client components
 */
export function getClientEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

/**
 * Validate all required environment variables
 * Call this at build time or app startup
 */
export function validateEnv() {
  const errors: string[] = [];

  // Server-side checks (only run on server)
  if (typeof window === 'undefined') {
    try {
      getServerEnv();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Client-side checks (always run)
  try {
    getClientEnv();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}

