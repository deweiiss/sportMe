-- Chat sessions table to group conversations
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_updated ON chat_sessions(last_updated DESC);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions"
  ON chat_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Add chat_id to chat_messages and backfill with new session if missing
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);

-- Backfill: create a session per user if messages exist without chat_id
DO $$
DECLARE
  rec RECORD;
  new_session UUID;
BEGIN
  FOR rec IN SELECT DISTINCT user_id FROM chat_messages WHERE chat_id IS NULL LOOP
    INSERT INTO chat_sessions (user_id, title)
    VALUES (rec.user_id, 'Conversation')
    RETURNING id INTO new_session;

    UPDATE chat_messages
    SET chat_id = new_session
    WHERE user_id = rec.user_id AND chat_id IS NULL;
  END LOOP;
END $$;

-- Ensure chat_id is required going forward
ALTER TABLE chat_messages
  ALTER COLUMN chat_id SET NOT NULL;

-- Update RLS for chat_messages to include chat_id
DROP POLICY IF EXISTS "Users can view own chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own chat messages" ON chat_messages;

CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

