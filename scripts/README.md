# Scripts

This directory contains utility scripts for the SportMe application.

## test-supabase-connection.js

Tests the connection to Supabase and verifies the database structure.

### Usage

```bash
npm run test:supabase
```

or

```bash
node scripts/test-supabase-connection.js
```

### Prerequisites

Make sure you have set the following environment variables in your `.env` file:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `VITE_SUPABASE_SERVICE_ROLE_KEY` (optional) - Your Supabase service role key

### What it does

1. Tests basic connection to Supabase
2. Verifies that all required tables exist:
   - `athletes`
   - `activities`
   - `training_plans`
   - `sync_logs`
3. Tests Row Level Security (RLS) policies (if service key is provided)

### Expected Output

```
🔍 Testing Supabase Connection...

✅ Environment variables found
   URL: https://xxxxx.supabase.co...
   Anon Key: eyJhbGciOiJIUzI1NiIs...

📡 Testing basic connection...
✅ Connection successful!

📊 Testing table structure...

✅ athletes - exists and accessible
✅ activities - exists and accessible
✅ training_plans - exists and accessible
✅ sync_logs - exists and accessible

🔒 Testing Row Level Security...

✅ RLS policies are configured

🎉 All tests passed! Your Supabase setup is ready to use.
```

