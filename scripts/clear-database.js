/**
 * Clear Database Script
 * 
 * This script clears all data from the database except the athletes table.
 * It will delete:
 * - All activities
 * - All training plans
 * - All sync logs
 * 
 * The athletes table will remain intact.
 * 
 * Usage:
 *   node scripts/clear-database.js
 * 
 * Make sure to set the following environment variables:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_SERVICE_ROLE_KEY (required for this operation)
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
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log('🗑️  Database Clear Script\n');

// Check if credentials are set
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase credentials!');
  console.error('   Please set the following in your .env file:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - VITE_SUPABASE_SERVICE_ROLE_KEY (required for this operation)');
  process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`   Service Key: ${supabaseServiceKey.substring(0, 20)}...\n`);

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Tables to clear (in order to respect foreign key constraints)
const tablesToClear = [
  'sync_logs',
  'activities',
  'training_plans'
];

async function clearDatabase() {
  try {
    console.log('📊 Starting database clear operation...\n');

    let totalDeleted = 0;

    for (const table of tablesToClear) {
      try {
        // First, count records
        const { count, error: countError } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (countError) {
          console.error(`⚠️  Error counting ${table}:`, countError.message);
          continue;
        }

        const recordCount = count || 0;

        if (recordCount === 0) {
          console.log(`✅ ${table}: Already empty (0 records)`);
          continue;
        }

        // Delete all records
        // Supabase requires a filter, so we use a condition that matches all UUIDs
        // Since all tables use UUID primary keys, we can use id >= zero UUID which matches all
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .gte('id', '00000000-0000-0000-0000-000000000000'); // Matches all UUIDs (all are >= zero UUID)

        if (deleteError) {
          console.error(`❌ Error deleting from ${table}:`, deleteError.message);
          continue;
        }

        console.log(`✅ ${table}: Deleted ${recordCount} record(s)`);
        totalDeleted += recordCount;
      } catch (err) {
        console.error(`❌ Error processing ${table}:`, err.message);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total records deleted: ${totalDeleted}`);
    console.log(`   Athletes table: Preserved (not cleared)`);
    console.log('\n✅ Database clear operation completed!\n');
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

// Confirm before proceeding
console.log('⚠️  WARNING: This will delete ALL data from:');
tablesToClear.forEach(table => {
  console.log(`   - ${table}`);
});
console.log('\n   The athletes table will NOT be cleared.\n');

// For safety, require confirmation via command line argument
const args = process.argv.slice(2);
if (args[0] !== '--confirm') {
  console.log('⚠️  To proceed, run with --confirm flag:');
  console.log('   node scripts/clear-database.js --confirm\n');
  process.exit(0);
}

// Run the clear operation
clearDatabase().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

