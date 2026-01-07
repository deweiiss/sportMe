-- Migration: Add field_sources JSONB column to track data provenance
-- This allows tracking whether fields are auto-populated from Strava or manually edited by user

-- Add field_sources column to store metadata about field origins
ALTER TABLE athletes
ADD COLUMN IF NOT EXISTS field_sources JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN athletes.field_sources IS
'Tracks the source of each field value. Keys are field names, values are objects with "source" (strava|manual|chat) and "updated_at" (timestamp).
Example: {"weight": {"source": "strava", "updated_at": "2025-01-07T10:30:00Z"}, "firstname": {"source": "manual", "updated_at": "2025-01-07T11:00:00Z"}}';

-- Add index for JSONB queries (optional, for future optimization)
CREATE INDEX IF NOT EXISTS idx_athletes_field_sources
ON athletes USING gin(field_sources);
