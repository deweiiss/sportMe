-- Migration: Add is_archived column to training_plans table
-- This allows users to manually archive plans and have only one "active" plan at a time

-- Add is_archived column (defaults to false)
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false NOT NULL;

-- Add index for filtering archived plans
CREATE INDEX IF NOT EXISTS idx_training_plans_is_archived
ON training_plans(is_archived);

-- Add comment explaining the column
COMMENT ON COLUMN training_plans.is_archived IS
'Whether the plan has been manually archived by the user. Only one non-archived plan should exist at a time (enforced by application logic).';
