-- Add missing RLS INSERT and UPDATE policies
-- These are required for the sync functionality to work

-- Allow inserting athlete data
CREATE POLICY "Users can insert own athlete data"
  ON athletes FOR INSERT
  WITH CHECK (true);

-- Allow inserting activities
CREATE POLICY "Users can insert own activities"
  ON activities FOR INSERT
  WITH CHECK (true);

-- Allow updating activities
CREATE POLICY "Users can update own activities"
  ON activities FOR UPDATE
  USING (true);

-- Allow inserting sync logs
CREATE POLICY "Users can insert own sync logs"
  ON sync_logs FOR INSERT
  WITH CHECK (true);

-- Allow updating sync logs
CREATE POLICY "Users can update own sync logs"
  ON sync_logs FOR UPDATE
  USING (true);

