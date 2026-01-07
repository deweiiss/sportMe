-- Migration: Add injuries and environment fields to athletes table
-- These fields store user-provided information that may be extracted from chat conversations

-- Add injuries column (text field for injury history/current injuries)
ALTER TABLE athletes
ADD COLUMN IF NOT EXISTS injuries TEXT DEFAULT NULL;

-- Add environment column (text field for training environment description)
ALTER TABLE athletes
ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT NULL;

-- Add comments explaining the columns
COMMENT ON COLUMN athletes.injuries IS
'Injury history and current injuries described by the user. Can be updated from chat conversations or manually entered.';

COMMENT ON COLUMN athletes.environment IS
'Training environment description (e.g., "hilly terrain", "flat city streets", "high altitude", "hot and humid"). Can be updated from chat conversations or manually entered.';
