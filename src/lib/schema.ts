export const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  code text NOT NULL UNIQUE,
  city text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  phone text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT 'en',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'department',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_categories (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_am text NOT NULL,
  name_om text NOT NULL,
  description_en text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidate_groups (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id text REFERENCES departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id text NOT NULL REFERENCES candidate_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  stem text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'medium',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_url text NOT NULL DEFAULT '',
  media_kind text NOT NULL DEFAULT '',
  media_alt text NOT NULL DEFAULT '',
  points integer NOT NULL DEFAULT 1,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES exam_categories(id),
  department_id text REFERENCES departments(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  pass_mark numeric NOT NULL DEFAULT 50,
  shuffle_questions boolean NOT NULL DEFAULT true,
  shuffle_options boolean NOT NULL DEFAULT true,
  result_release text NOT NULL DEFAULT 'instant',
  result_release_at timestamptz,
  release_overridden boolean NOT NULL DEFAULT false,
  selection_mode text NOT NULL DEFAULT 'manual',
  random_count integer NOT NULL DEFAULT 0,
  proctor_webcam boolean NOT NULL DEFAULT false,
  proctor_fullscreen boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 1,
  PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS exam_assignments (
  id text PRIMARY KEY,
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  assignee_type text NOT NULL,
  assignee_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, assignee_type, assignee_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id text PRIMARY KEY,
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  grading_status text NOT NULL DEFAULT 'auto',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  deadline_at timestamptz NOT NULL,
  score numeric,
  max_score numeric,
  percentage numeric,
  passed boolean,
  tab_switch_count integer NOT NULL DEFAULT 0,
  suspicious_count integer NOT NULL DEFAULT 0,
  session_token text,
  question_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  option_orders jsonb NOT NULL DEFAULT '{}'::jsonb,
  matching_orders jsonb NOT NULL DEFAULT '{}'::jsonb,
  paper jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_code text UNIQUE,
  submit_reason text NOT NULL DEFAULT '',
  result_emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS answers (
  attempt_id text NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  selected_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  text_answer text NOT NULL DEFAULT '',
  matching jsonb NOT NULL DEFAULT '{}'::jsonb,
  flagged boolean NOT NULL DEFAULT false,
  is_correct boolean,
  points_awarded numeric,
  manual_comment text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS proctor_events (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text NOT NULL DEFAULT '',
  snapshot text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  ref_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT '',
  organization_id text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_org ON questions(organization_id);
CREATE INDEX IF NOT EXISTS idx_exams_org ON exams(organization_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate ON attempts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_channel text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS verification_codes (
  id text PRIMARY KEY,
  purpose text NOT NULL,
  channel text NOT NULL,
  destination text NOT NULL,
  code_hash text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_lookup ON verification_codes(destination, purpose, created_at);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS calibrated_difficulty text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS observed_rate numeric;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS times_asked integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS disconnect_count integer NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS answered_count integer NOT NULL DEFAULT 0;

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
`;
