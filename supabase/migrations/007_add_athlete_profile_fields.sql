-- Add athlete profile fields to athletes table
-- All fields are nullable to support: missing Strava data, user deletion, and optional fields

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS weight DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS bikes JSONB,
  ADD COLUMN IF NOT EXISTS shoes JSONB,
  ADD COLUMN IF NOT EXISTS city VARCHAR(255),
  ADD COLUMN IF NOT EXISTS state VARCHAR(255),
  ADD COLUMN IF NOT EXISTS country VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sex VARCHAR(1) CHECK (sex IN ('M', 'F')),
  ADD COLUMN IF NOT EXISTS birthday DATE;

-- Add index for location-based queries (optional, but can be useful)
CREATE INDEX IF NOT EXISTS idx_athletes_country ON athletes(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_athletes_city ON athletes(city) WHERE city IS NOT NULL;

