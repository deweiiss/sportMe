-- Clear Database Script (SQL version)
-- 
-- This script clears all data from the database except the athletes table.
-- It will delete:
-- - All activities
-- - All training plans
-- - All sync logs
-- 
-- The athletes table will remain intact.
-- 
-- WARNING: This will permanently delete all data from these tables!
-- Use with caution. Make sure to backup your data if needed.

-- Delete in order to respect foreign key constraints
-- (CASCADE will handle related records automatically)

-- Clear sync logs
DELETE FROM sync_logs;

-- Clear activities
DELETE FROM activities;

-- Clear training plans
DELETE FROM training_plans;

-- Note: Athletes table is NOT cleared
-- If you want to clear athletes as well, uncomment the line below:
-- DELETE FROM athletes;

