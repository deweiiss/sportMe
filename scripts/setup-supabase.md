# Supabase Setup Guide

This guide will help you set up Supabase for the SportMe application.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A Supabase project created

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in project details:
   - Name: `sportme` (or your preferred name)
   - Database Password: Choose a strong password (save it!)
   - Region: Choose closest to you
4. Wait for the project to be created (takes a few minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (this is your `VITE_SUPABASE_URL`)
   - **anon/public key** (this is your `VITE_SUPABASE_ANON_KEY`)
   - **service_role key** (this is your `VITE_SUPABASE_SERVICE_ROLE_KEY` - keep this secret!)

## Step 3: Set Environment Variables

Create a `.env` file in the root of your project (if it doesn't exist) and add:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Important:** The `.env` file is already in `.gitignore`, so your keys won't be committed to git.

## Step 4: Run Database Migration

You have two options to run the migration:

### Option A: Using Supabase Dashboard (Recommended for beginners)

1. Go to your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file `supabase/migrations/001_initial_schema.sql`
5. Copy the entire contents
6. Paste into the SQL Editor
7. Click **Run** (or press Cmd/Ctrl + Enter)
8. You should see "Success. No rows returned"

### Option B: Using Supabase CLI (Advanced)

If you have the Supabase CLI installed:

```bash
supabase db push
```

## Step 5: Test the Connection

Run the connection test script:

```bash
node scripts/test-supabase-connection.js
```

You should see:
- ✅ Connection successful
- ✅ All tables exist and accessible
- 🎉 All tests passed!

## Step 6: Verify Tables

In your Supabase dashboard:
1. Go to **Table Editor**
2. You should see the following tables:
   - `athletes`
   - `activities`
   - `training_plans`
   - `sync_logs`

## Troubleshooting

### "Table does not exist" error
- Make sure you've run the migration script (Step 4)
- Check that the migration completed successfully

### "Connection refused" or network errors
- Verify your `VITE_SUPABASE_URL` is correct
- Check that your Supabase project is active (not paused)

### RLS (Row Level Security) errors
- The migration script sets up basic RLS policies
- For production, you may want to customize these based on your auth setup

## Next Steps

Once the database is set up:
1. The app will automatically sync Strava activities to Supabase
2. Training plans will be saved to the database instead of localStorage
3. You can query your data using the Supabase dashboard or API

## Security Notes

- **Never commit** your `.env` file to git
- The `VITE_SUPABASE_SERVICE_ROLE_KEY` bypasses RLS - use it carefully
- For production, consider using Supabase Auth for user authentication
- Regularly rotate your API keys

