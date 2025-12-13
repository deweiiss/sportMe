-- Migration: Add plan_data column to training_plans table
-- This column stores the new JSON format (meta, periodization_overview, schedule)
-- Note: week1-week4 columns have been removed in a later migration

-- Add plan_data JSONB column
ALTER TABLE training_plans 
ADD COLUMN IF NOT EXISTS plan_data JSONB;

-- Add index on plan_data for better query performance
CREATE INDEX IF NOT EXISTS idx_training_plans_plan_data ON training_plans USING GIN (plan_data);

-- Add comment to document the column
COMMENT ON COLUMN training_plans.plan_data IS 'Stores training plan in new JSON format with meta, periodization_overview, and schedule structure';

