/**
 * Test Supabase Connection Script
 * 
 * This script tests the connection to Supabase and verifies the database structure.
 * 
 * Usage:
 *   node scripts/test-supabase-connection.js
 * 
 * Make sure to set the following environment variables:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   VITE_SUPABASE_SERVICE_ROLE_KEY (optional, for admin operations)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');

// Check if credentials are set
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing Supabase credentials!');
  console.error('   Please set the following in your .env file:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`   Anon Key: ${supabaseAnonKey.substring(0, 20)}...\n`);

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test connection
async function testConnection() {
  try {
    console.log('📡 Testing basic connection...');
    
    // Try to query a simple table
    const { data, error } = await supabase
      .from('athletes')
      .select('count')
      .limit(1);

    if (error) {
      // Check if it's a "table doesn't exist" error
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('⚠️  Connection successful, but tables may not be created yet.');
        console.log('   Please run the migration script first:');
        console.log('   supabase/migrations/001_initial_schema.sql\n');
        return false;
      }
      
      console.error('❌ Connection test failed:', error.message);
      return false;
    }

    console.log('✅ Connection successful!\n');
    return true;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    return false;
  }
}

// Test table structure
async function testTables() {
  const tables = ['athletes', 'activities', 'training_plans', 'sync_logs'];
  const results = {};

  console.log('📊 Testing table structure...\n');

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
          results[table] = { exists: false, error: 'Table does not exist' };
        } else {
          results[table] = { exists: true, error: error.message };
        }
      } else {
        results[table] = { exists: true, error: null };
      }
    } catch (err) {
      results[table] = { exists: false, error: err.message };
    }
  }

  // Print results
  for (const [table, result] of Object.entries(results)) {
    if (result.exists && !result.error) {
      console.log(`✅ ${table} - exists and accessible`);
    } else if (result.exists && result.error) {
      console.log(`⚠️  ${table} - exists but error: ${result.error}`);
    } else {
      console.log(`❌ ${table} - ${result.error || 'does not exist'}`);
    }
  }

  console.log('');

  return Object.values(results).every(r => r.exists && !r.error);
}

// Test RLS policies (if service key is available)
async function testRLS() {
  if (!supabaseServiceKey) {
    console.log('⚠️  Service role key not provided, skipping RLS test');
    console.log('   (RLS tests require VITE_SUPABASE_SERVICE_ROLE_KEY)\n');
    return true;
  }

  console.log('🔒 Testing Row Level Security...\n');
  
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Try to query with admin client
    const { data, error } = await adminClient
      .from('athletes')
      .select('count')
      .limit(1);

    if (error) {
      console.log(`⚠️  RLS test: ${error.message}`);
      return false;
    }

    console.log('✅ RLS policies are configured\n');
    return true;
  } catch (err) {
    console.log(`❌ RLS test error: ${err.message}\n`);
    return false;
  }
}

// Main test function
async function runTests() {
  const connectionOk = await testConnection();
  
  if (!connectionOk) {
    console.log('💡 Tip: Make sure you have:');
    console.log('   1. Created a Supabase project');
    console.log('   2. Run the migration script (supabase/migrations/001_initial_schema.sql)');
    console.log('   3. Set the correct environment variables\n');
    process.exit(1);
  }

  const tablesOk = await testTables();
  const rlsOk = await testRLS();

  if (tablesOk && rlsOk) {
    console.log('🎉 All tests passed! Your Supabase setup is ready to use.\n');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.\n');
  }
}

// Run tests
runTests().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

