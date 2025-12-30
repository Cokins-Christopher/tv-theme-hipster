// Quick script to check if .env.local is set up correctly
// Run: node check-env.js

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found!');
  console.log('\nCreate it in the project root with:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your_url');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

console.log('📋 Checking .env.local file...\n');

const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

let allGood = true;

for (const varName of requiredVars) {
  const found = lines.some(line => {
    const match = line.match(/^([^=]+)=(.+)$/);
    return match && match[1].trim() === varName;
  });
  
  if (found) {
    const line = lines.find(l => l.includes(varName));
    const value = line.split('=')[1]?.trim() || '';
    if (value && value !== 'your_url_here' && value !== 'your_anon_key_here' && value !== 'your_service_role_key_here') {
      console.log(`✅ ${varName} is set (${value.length} characters)`);
    } else {
      console.log(`⚠️  ${varName} is set but appears to be a placeholder`);
      allGood = false;
    }
  } else {
    console.log(`❌ ${varName} is MISSING`);
    allGood = false;
  }
}

console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('✅ All environment variables are set correctly!');
  console.log('\n💡 If you still see errors, try:');
  console.log('   1. Stop the dev server (Ctrl+C)');
  console.log('   2. Restart: npm run dev');
} else {
  console.log('❌ Some variables are missing or incorrect');
  console.log('\n📝 Your .env.local should look like this:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('\n⚠️  Make sure:');
  console.log('   - No spaces around the = sign');
  console.log('   - No quotes around the values');
  console.log('   - No trailing spaces');
}

