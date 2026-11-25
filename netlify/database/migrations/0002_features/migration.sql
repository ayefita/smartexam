ALTER TABLE questions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS calibrated_difficulty text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS observed_rate numeric;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS times_asked integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS disconnect_count integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS answered_count integer NOT NULL DEFAULT 0;
