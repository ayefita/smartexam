-- Indexes for the foreign keys the Supabase advisor flagged.
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_groups_department ON candidate_groups(department_id);
CREATE INDEX IF NOT EXISTS idx_groups_org ON candidate_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question ON exam_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_exams_category ON exams(category_id);
CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_department ON exams(department_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_proctor_attempt ON proctor_events(attempt_id, created_at);
CREATE INDEX IF NOT EXISTS idx_questions_created_by ON questions(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_otp_user ON verification_codes(user_id);
-- Finding overdue attempts quickly.
CREATE INDEX IF NOT EXISTS idx_attempts_live_deadline ON attempts(deadline_at) WHERE status = 'in_progress';

-- Exam options (all off by default).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS access_code text NOT NULL DEFAULT '';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS block_copy boolean NOT NULL DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS tab_limit integer NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS negative_mark numeric NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS blueprint jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS extra_minutes integer NOT NULL DEFAULT 0;

-- Extra time for a student, set before they start.
CREATE TABLE IF NOT EXISTS exam_accommodations (
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extra_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_accommodations_user ON exam_accommodations(user_id);

-- Lets the app skip the boot-time schema check when nothing changed.
CREATE TABLE IF NOT EXISTS app_meta (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- On Supabase the app runs as smartexam_app and every table has row level security on.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartexam_app') THEN
    ALTER TABLE exam_accommodations OWNER TO smartexam_app;
    ALTER TABLE app_meta OWNER TO smartexam_app;
  END IF;
END $$;
ALTER TABLE exam_accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;
