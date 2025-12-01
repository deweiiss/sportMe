-- Migration: Ensure training_plans table structure is complete for localStorage migration
-- This migration ensures all necessary columns exist and RLS policies are correct

-- Ensure weekly_hours column exists (it should already exist from 001_initial_schema.sql, but make sure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_plans' 
    AND column_name = 'weekly_hours'
  ) THEN
    ALTER TABLE training_plans ADD COLUMN weekly_hours VARCHAR(20);
  END IF;
END $$;

-- Verify RLS is enabled (should already be enabled from previous migrations)
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

-- Ensure all necessary RLS policies exist (should already exist from 003_add_user_authentication.sql)
-- But we'll verify and create if missing

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can insert own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can update own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can delete own training plans" ON training_plans;

-- Recreate policies to ensure they're correct
CREATE POLICY "Users can view own training plans"
  ON training_plans FOR SELECT
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own training plans"
  ON training_plans FOR INSERT
  WITH CHECK (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own training plans"
  ON training_plans FOR UPDATE
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own training plans"
  ON training_plans FOR DELETE
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

-- Add index on created_at for sorting (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_training_plans_created_at ON training_plans(created_at DESC);

-- Add index on plan_type for filtering (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_training_plans_plan_type ON training_plans(plan_type);

