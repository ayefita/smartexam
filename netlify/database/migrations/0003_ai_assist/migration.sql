CREATE TABLE IF NOT EXISTS ai_suggestions (
  id text PRIMARY KEY,
  organization_id text,
  kind text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'suggested',
  source text NOT NULL DEFAULT 'model',
  created_by text,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_entity ON ai_suggestions(kind, entity_id);
