-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/Athletes table
-- Stores Strava user information and tokens
CREATE TABLE IF NOT EXISTS athletes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strava_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  firstname VARCHAR(255),
  lastname VARCHAR(255),
  profile_medium TEXT,
  profile TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activities table
-- Stores Strava activities
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strava_id BIGINT UNIQUE NOT NULL,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  name VARCHAR(255),
  type VARCHAR(50), -- e.g., 'Ride', 'Run', 'Swim'
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  start_date_local TIMESTAMP WITH TIME ZONE NOT NULL,
  distance DECIMAL(10, 2), -- in meters
  moving_time INTEGER, -- in seconds
  elapsed_time INTEGER, -- in seconds
  total_elevation_gain DECIMAL(10, 2), -- in meters
  average_speed DECIMAL(10, 2), -- in m/s
  max_speed DECIMAL(10, 2), -- in m/s
  average_cadence DECIMAL(5, 2),
  average_watts DECIMAL(8, 2),
  weighted_average_watts DECIMAL(8, 2),
  kilojoules DECIMAL(10, 2),
  device_watts BOOLEAN,
  has_heartrate BOOLEAN,
  average_heartrate DECIMAL(5, 2),
  max_heartrate DECIMAL(5, 2),
  calories INTEGER,
  description TEXT,
  raw_data JSONB, -- Store full Strava response for future use
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Plans table
-- Stores generated training plans
CREATE TABLE IF NOT EXISTS training_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  plan_type VARCHAR(50) NOT NULL, -- 'ftp', 'base', 'vo2max'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekly_hours VARCHAR(20), -- e.g., '5-8h'
  week1 JSONB NOT NULL,
  week2 JSONB NOT NULL,
  week3 JSONB NOT NULL,
  week4 JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync Logs table
-- Tracks sync operations for debugging and monitoring
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'activities', 'full_sync'
  status VARCHAR(20) NOT NULL, -- 'success', 'error', 'partial'
  activities_synced INTEGER DEFAULT 0,
  activities_created INTEGER DEFAULT 0,
  activities_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities(athlete_id);
CREATE INDEX IF NOT EXISTS idx_activities_strava_id ON activities(strava_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date);
CREATE INDEX IF NOT EXISTS idx_activities_start_date_local ON activities(start_date_local);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_training_plans_athlete_id ON training_plans(athlete_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_start_date ON training_plans(start_date);
CREATE INDEX IF NOT EXISTS idx_sync_logs_athlete_id ON sync_logs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at
CREATE TRIGGER update_athletes_updated_at
  BEFORE UPDATE ON athletes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_plans_updated_at
  BEFORE UPDATE ON training_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
-- Note: This assumes you'll use Supabase Auth. For now, we'll use a service role key
-- You may want to adjust these policies based on your auth setup
CREATE POLICY "Users can view own athlete data"
  ON athletes FOR SELECT
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can update own athlete data"
  ON athletes FOR UPDATE
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can view own activities"
  ON activities FOR SELECT
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can view own training plans"
  ON training_plans FOR SELECT
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can insert own training plans"
  ON training_plans FOR INSERT
  WITH CHECK (true); -- Adjust based on your auth setup

CREATE POLICY "Users can update own training plans"
  ON training_plans FOR UPDATE
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can delete own training plans"
  ON training_plans FOR DELETE
  USING (true); -- Adjust based on your auth setup

CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (true); -- Adjust based on your auth setup

