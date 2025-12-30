#!/usr/bin/env node

/**
 * Build-time environment variable checker
 * Runs during Vercel build to verify all required env vars are set
 */

const requiredVars = {
  // Client-side (NEXT_PUBLIC_*)
  client: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ],
  // Server-side
  server: [
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL', // Also needed server-side
  ],
};

function checkEnvVars() {
  const isVercel = process.env.VERCEL === '1';
  const vercelEnv = process.env.VERCEL_ENV || 'local';
  
  console.log(`\n🔍 Checking environment variables...`);
  console.log(`Environment: ${vercelEnv}`);
  console.log(`Platform: ${isVercel ? 'Vercel' : 'Local'}\n`);

  const missing = [];
  const allVars = [...new Set([...requiredVars.client, ...requiredVars.server])];

  for (const varName of allVars) {
    const value = process.env[varName];
    const isSet = value && value.trim() !== '';
    
    if (isSet) {
      // Show first/last few chars for verification (don't expose full secrets)
      const preview = varName.includes('KEY') || varName.includes('SECRET')
        ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`✅ ${varName}: ${preview}`);
    } else {
      console.log(`❌ ${varName}: MISSING`);
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error(`\n❌ Build failed: Missing ${missing.length} required environment variable(s)\n`);
    console.error('Missing variables:');
    missing.forEach(name => {
      console.error(`  - ${name}`);
    });
    console.error('\n💡 Fix:');
    if (isVercel) {
      console.error('  1. Go to Vercel Project Settings → Environment Variables');
      console.error(`  2. Add the missing variables for ${vercelEnv} environment`);
      console.error('  3. Redeploy your project');
    } else {
      console.error('  1. Create/update .env.local file in project root');
      console.error('  2. Add the missing variables');
      console.error('  3. Restart your dev server');
    }
    process.exit(1);
  }

  console.log(`\n✅ All environment variables are set!\n`);
}

checkEnvVars();

