-- Add user_id column to athletes table to link to auth.users
ALTER TABLE athletes 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_athletes_user_id ON athletes(user_id);

-- Make user_id NOT NULL after adding (for new records)
-- Note: Existing records will have NULL user_id, which is fine for migration
-- You may want to handle existing data separately

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view own athlete data" ON athletes;
DROP POLICY IF EXISTS "Users can update own athlete data" ON athletes;
DROP POLICY IF EXISTS "Users can insert own athlete data" ON athletes;
DROP POLICY IF EXISTS "Users can view own activities" ON activities;
DROP POLICY IF EXISTS "Users can insert own activities" ON activities;
DROP POLICY IF EXISTS "Users can update own activities" ON activities;
DROP POLICY IF EXISTS "Users can view own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can insert own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can update own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can delete own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can view own sync logs" ON sync_logs;
DROP POLICY IF EXISTS "Users can insert own sync logs" ON sync_logs;
DROP POLICY IF EXISTS "Users can update own sync logs" ON sync_logs;

-- New RLS policies using auth.uid() for user-specific access

-- Athletes policies
CREATE POLICY "Users can view own athlete data"
  ON athletes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own athlete data"
  ON athletes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own athlete data"
  ON athletes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Activities policies (linked via athlete_id)
CREATE POLICY "Users can view own activities"
  ON activities FOR SELECT
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own activities"
  ON activities FOR INSERT
  WITH CHECK (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own activities"
  ON activities FOR UPDATE
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

-- Training plans policies (linked via athlete_id)
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

-- Sync logs policies (linked via athlete_id)
CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sync logs"
  ON sync_logs FOR INSERT
  WITH CHECK (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own sync logs"
  ON sync_logs FOR UPDATE
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

