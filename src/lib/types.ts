export type Role = "super_admin" | "exam_manager" | "candidate";
export type Locale = "en" | "am" | "om";
export type QuestionType = "single" | "multiple" | "true_false" | "short" | "blank" | "matching" | "essay";
export type Difficulty = "easy" | "medium" | "hard";
export type ReleaseMode = "instant" | "scheduled";
export type SelectionMode = "manual" | "random_fixed" | "random_each";
export type OrgType = "university" | "school" | "employer";
export type ExamStatus = "draft" | "published" | "closed";

export type Option = { id: string; text: string };
export type Pair = { id: string; left: string; right: string };

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string | null;
  organizationName: string;
  phone: string;
  locale: Locale;
  active: boolean;
  createdAt: string;
  /** Staff-created accounts must replace their temporary password at first sign-in. */
  mustChangePassword?: boolean;
  /** Optional ID or index number supplied on import. */
  candidateNumber?: string;
};

export type Organization = {
  id: string;
  name: string;
  type: OrgType;
  code: string;
  city: string;
  createdAt: string;
};

export type Department = {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  kind: "department" | "position";
  createdAt: string;
};

export type Category = {
  id: string;
  code: string;
  nameEn: string;
  nameAm: string;
  nameOm: string;
  descriptionEn: string;
  sortOrder: number;
};

export type Group = {
  id: string;
  organizationId: string;
  organizationName: string;
  departmentId: string | null;
  name: string;
  memberCount: number;
  createdAt: string;
};

export type Question = {
  id: string;
  organizationId: string;
  organizationName: string;
  type: QuestionType;
  stem: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  options: Option[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  pairs: Pair[];
  mediaUrl: string;
  mediaKind: "" | "image" | "audio";
  mediaAlt: string;
  points: number;
  status: "draft" | "published";
  calibratedDifficulty: Difficulty | "";
  observedRate: number | null;
  timesAsked: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaperQuestion = {
  id: string;
  type: QuestionType;
  stem: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  options: Option[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  pairs: Pair[];
  mediaUrl: string;
  mediaKind: string;
  mediaAlt: string;
  points: number;
};

export type Exam = {
  id: string;
  organizationId: string;
  organizationName: string;
  categoryId: string;
  categoryCode: string;
  categoryNameEn: string;
  categoryNameAm: string;
  categoryNameOm: string;
  departmentId: string | null;
  departmentName: string;
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  startAt: string | null;
  endAt: string | null;
  passMark: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultRelease: ReleaseMode;
  resultReleaseAt: string | null;
  releaseOverridden: boolean;
  selectionMode: SelectionMode;
  randomCount: number;
  proctorWebcam: boolean;
  proctorFullscreen: boolean;
  status: ExamStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Attempt = {
  id: string;
  examId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  status: "in_progress" | "submitted";
  gradingStatus: "auto" | "pending_manual" | "finalized";
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  tabSwitchCount: number;
  suspiciousCount: number;
  sessionToken: string | null;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  matchingOrders: Record<string, string[]>;
  paper: PaperQuestion[];
  verificationCode: string | null;
  submitReason: string;
  resultEmailedAt: string | null;
};

export type Answer = {
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string;
  matching: Record<string, string>;
  flagged: boolean;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  manualComment: string;
  updatedAt: string;
};

export type PresentedQuestion = {
  id: string;
  type: QuestionType;
  stem: string;
  subject: string;
  topic: string;
  points: number;
  mediaUrl: string;
  mediaKind: string;
  mediaAlt: string;
  options: Option[];
  left: Option[];
  right: Option[];
};

export type Actor = User;
