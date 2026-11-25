import { headerIndex } from "./csv";
import { query, tx, usingLocalFile } from "./db";
import { gradeAttempt } from "./grading";
import {
  bool,
  cleanMedia,
  formatAddis,
  iso,
  makeCode,
  num,
  parseJson,
  shuffle,
} from "./format";
import { enqueueNotification, releaseLine, resultMessage, scheduleMessage } from "./notify";
import { calibrateQuestions } from "./calibrate";
import { hashPassword } from "./password";
import { refreshRisk } from "./risk";
import { normalizeEthiopianPhone } from "./phone";
import {
  candidateCanSeeScore,
  candidateResultState,
  defaultReleaseAt,
  examWindow,
  type ResultMessage,
} from "./results";
import type {
  Actor,
  Answer,
  Attempt,
  Category,
  Department,
  Difficulty,
  Exam,
  ExamStatus,
  Group,
  Option,
  Organization,
  OrgType,
  Pair,
  PaperQuestion,
  PresentedQuestion,
  Question,
  QuestionType,
  ReleaseMode,
  Role,
  SelectionMode,
  User,
} from "./types";

export type Fail = { ok: false; error: string };
export type Ok<T extends object = object> = { ok: true } & T;

const TYPES = new Set<QuestionType>(["single", "multiple", "true_false", "short", "blank", "matching", "essay"]);
const SUSPICIOUS = new Set(["tab_switch", "fullscreen_exit", "fullscreen_denied", "camera_denied", "paste", "blur"]);

let lastReleaseRun = 0;

export function isStaff(user: User) {
  return user.role === "super_admin" || user.role === "exam_manager";
}

export function managesOrg(user: User, organizationId: string | null | undefined) {
  if (user.role === "super_admin") return true;
  return user.role === "exam_manager" && !!organizationId && user.organizationId === organizationId;
}

function scopedOrg(user: User) {
  return user.role === "super_admin" ? null : user.organizationId;
}

async function audit(
  actor: Pick<User, "id" | "fullName" | "organizationId"> | null,
  action: string,
  entity: string,
  entityId: string,
  detail: string,
  organizationId?: string | null,
) {
  await query(
    `insert into audit_logs (id, actor_id, actor_name, organization_id, action, entity, entity_id, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      crypto.randomUUID(),
      actor?.id ?? null,
      actor?.fullName ?? "System",
      organizationId ?? actor?.organizationId ?? null,
      action,
      entity,
      entityId,
      detail.slice(0, 500),
    ],
  );
}

function mapUser(row: Record<string, unknown>): User {
  const locale = String(row.locale || "en");
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as Role,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    organizationName: String(row.organization_name ?? ""),
    phone: String(row.phone ?? ""),
    locale: locale === "am" || locale === "om" ? locale : "en",
    active: bool(row.active),
    createdAt: iso(row.created_at) || "",
    mustChangePassword: bool(row.must_change_password),
    candidateNumber: String(row.candidate_number ?? ""),
  };
}

function mapOrg(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as OrgType,
    code: String(row.code),
    city: String(row.city ?? ""),
    createdAt: iso(row.created_at) || "",
  };
}

function mapExam(row: Record<string, unknown>): Exam {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name ?? ""),
    categoryId: String(row.category_id),
    categoryCode: String(row.category_code ?? ""),
    categoryNameEn: String(row.category_name_en ?? ""),
    categoryNameAm: String(row.category_name_am ?? ""),
    categoryNameOm: String(row.category_name_om ?? ""),
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: String(row.department_name ?? ""),
    title: String(row.title),
    description: String(row.description ?? ""),
    instructions: String(row.instructions ?? ""),
    durationMinutes: num(row.duration_minutes),
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    passMark: num(row.pass_mark, 50),
    shuffleQuestions: bool(row.shuffle_questions),
    shuffleOptions: bool(row.shuffle_options),
    resultRelease: row.result_release === "scheduled" ? "scheduled" : "instant",
    resultReleaseAt: iso(row.result_release_at),
    releaseOverridden: bool(row.release_overridden),
    selectionMode: (row.selection_mode as SelectionMode) || "manual",
    randomCount: num(row.random_count),
    proctorWebcam: bool(row.proctor_webcam),
    proctorFullscreen: bool(row.proctor_fullscreen),
    status: row.status as ExamStatus,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: iso(row.created_at) || "",
    updatedAt: iso(row.updated_at) || "",
  };
}

function mapQuestion(row: Record<string, unknown>): Question {
  const kind = String(row.media_kind ?? "");
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name ?? ""),
    type: row.type as QuestionType,
    stem: String(row.stem),
    explanation: String(row.explanation ?? ""),
    subject: String(row.subject ?? ""),
    topic: String(row.topic ?? ""),
    difficulty: (row.difficulty as Difficulty) || "medium",
    options: parseJson<Option[]>(row.options, []),
    correctOptionIds: parseJson<string[]>(row.correct_option_ids, []),
    acceptedAnswers: parseJson<string[]>(row.accepted_answers, []),
    pairs: parseJson<Pair[]>(row.pairs, []),
    mediaUrl: String(row.media_url ?? ""),
    mediaKind: kind === "image" || kind === "audio" ? kind : "",
    mediaAlt: String(row.media_alt ?? ""),
    points: num(row.points, 1),
    status: row.status === "draft" ? "draft" : "published",
    calibratedDifficulty: row.calibrated_difficulty === "easy" || row.calibrated_difficulty === "medium" || row.calibrated_difficulty === "hard" ? row.calibrated_difficulty : "",
    observedRate: row.observed_rate == null ? null : num(row.observed_rate),
    timesAsked: num(row.times_asked),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: iso(row.created_at) || "",
    updatedAt: iso(row.updated_at) || "",
  };
}

function paperFromQuestion(question: Question, points = question.points): PaperQuestion {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    explanation: question.explanation,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    options: question.options,
    correctOptionIds: question.correctOptionIds,
    acceptedAnswers: question.acceptedAnswers,
    pairs: question.pairs,
    mediaUrl: question.mediaUrl,
    mediaKind: question.mediaKind,
    mediaAlt: question.mediaAlt,
    points,
  };
}

function mapAttempt(row: Record<string, unknown>, withPaper = false): Attempt {
  return {
    id: String(row.id),
    examId: String(row.exam_id),
    candidateId: String(row.candidate_id),
    candidateName: String(row.candidate_name ?? ""),
    candidateEmail: String(row.candidate_email ?? ""),
    status: row.status === "submitted" ? "submitted" : "in_progress",
    gradingStatus: row.grading_status === "finalized" || row.grading_status === "pending_manual" ? row.grading_status : "auto",
    startedAt: iso(row.started_at) || "",
    submittedAt: iso(row.submitted_at),
    deadlineAt: iso(row.deadline_at) || "",
    score: row.score == null ? null : num(row.score),
    maxScore: row.max_score == null ? null : num(row.max_score),
    percentage: row.percentage == null ? null : num(row.percentage),
    passed: row.passed == null ? null : bool(row.passed),
    tabSwitchCount: num(row.tab_switch_count),
    suspiciousCount: num(row.suspicious_count),
    sessionToken: row.session_token ? String(row.session_token) : null,
    questionOrder: parseJson<string[]>(row.question_order, []),
    optionOrders: parseJson<Record<string, string[]>>(row.option_orders, {}),
    matchingOrders: parseJson<Record<string, string[]>>(row.matching_orders, {}),
    paper: withPaper ? parseJson<PaperQuestion[]>(row.paper, []) : [],
    verificationCode: row.verification_code ? String(row.verification_code) : null,
    submitReason: String(row.submit_reason ?? ""),
    resultEmailedAt: iso(row.result_emailed_at),
  };
}

function mapAnswer(row: Record<string, unknown>): Answer {
  return {
    attemptId: String(row.attempt_id),
    questionId: String(row.question_id),
    selectedOptionIds: parseJson<string[]>(row.selected_option_ids, []),
    textAnswer: String(row.text_answer ?? ""),
    matching: parseJson<Record<string, string>>(row.matching, {}),
    flagged: bool(row.flagged),
    isCorrect: row.is_correct == null ? null : bool(row.is_correct),
    pointsAwarded: row.points_awarded == null ? null : num(row.points_awarded),
    manualComment: String(row.manual_comment ?? ""),
    updatedAt: iso(row.updated_at) || "",
  };
}

const EXAM_SELECT = `
  select e.*, o.name as organization_name, c.code as category_code,
         c.name_en as category_name_en, c.name_am as category_name_am, c.name_om as category_name_om,
         coalesce(d.name, '') as department_name
  from exams e
  join organizations o on o.id = e.organization_id
  join exam_categories c on c.id = e.category_id
  left join departments d on d.id = e.department_id
`;

export async function listOrganizations() {
  const rows = await query(`select * from organizations order by name`);
  return rows.map(mapOrg);
}

export async function saveOrganization(
  actor: User,
  input: { id?: string; name: string; type: string; code: string; city: string },
): Promise<Ok<{ id: string }> | Fail> {
  if (actor.role !== "super_admin") return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const type = input.type;
  if (!name || !code || !["university", "school", "employer"].includes(type)) return { ok: false, error: "validation" };
  if (input.id) {
    await query(`update organizations set name = $1, type = $2, code = $3, city = $4 where id = $5`, [
      name,
      type,
      code,
      input.city.trim(),
      input.id,
    ]);
    await audit(actor, "update", "organization", input.id, name);
    return { ok: true, id: input.id };
  }
  const id = crypto.randomUUID();
  try {
    await query(`insert into organizations (id, name, type, code, city) values ($1,$2,$3,$4,$5)`, [
      id,
      name,
      type,
      code,
      input.city.trim(),
    ]);
  } catch {
    return { ok: false, error: "email_taken" };
  }
  await audit(actor, "create", "organization", id, name);
  return { ok: true, id };
}

export async function listDepartments(actor: User) {
  const org = scopedOrg(actor);
  const rows = await query(
    `select d.*, o.name as organization_name
     from departments d join organizations o on o.id = d.organization_id
     where ($1::text is null or d.organization_id = $1)
     order by o.name, d.name`,
    [org],
  );
  return rows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name ?? ""),
    name: String(row.name),
    kind: row.kind === "position" ? "position" : "department",
    createdAt: iso(row.created_at) || "",
  })) as Department[];
}

export async function saveDepartment(
  actor: User,
  input: { id?: string; organizationId: string; name: string; kind: string },
): Promise<Ok<{ id: string }> | Fail> {
  if (!managesOrg(actor, input.organizationId)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "validation" };
  const kind = input.kind === "position" ? "position" : "department";
  if (input.id) {
    const rows = await query(`select organization_id from departments where id = $1`, [input.id]);
    if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
    await query(`update departments set name = $1, kind = $2, organization_id = $3 where id = $4`, [
      name,
      kind,
      input.organizationId,
      input.id,
    ]);
    await audit(actor, "update", "department", input.id, name, input.organizationId);
    return { ok: true, id: input.id };
  }
  const id = crypto.randomUUID();
  await query(`insert into departments (id, organization_id, name, kind) values ($1,$2,$3,$4)`, [
    id,
    input.organizationId,
    name,
    kind,
  ]);
  await audit(actor, "create", "department", id, name, input.organizationId);
  return { ok: true, id };
}

export async function deleteDepartment(actor: User, id: string): Promise<Ok | Fail> {
  const rows = await query(`select organization_id, name from departments where id = $1`, [id]);
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  await query(`delete from departments where id = $1`, [id]);
  await audit(actor, "delete", "department", id, String(rows[0].name), String(rows[0].organization_id));
  return { ok: true };
}

export async function listCategories() {
  const rows = await query(`select * from exam_categories order by sort_order, name_en`);
  return rows.map(
    (row) =>
      ({
        id: String(row.id),
        code: String(row.code),
        nameEn: String(row.name_en),
        nameAm: String(row.name_am),
        nameOm: String(row.name_om),
        descriptionEn: String(row.description_en ?? ""),
        sortOrder: num(row.sort_order),
      }) as Category,
  );
}

export async function saveCategory(
  actor: User,
  input: { id?: string; code: string; nameEn: string; nameAm: string; nameOm: string; descriptionEn: string },
): Promise<Ok<{ id: string }> | Fail> {
  if (actor.role !== "super_admin") return { ok: false, error: "forbidden" };
  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!code || !input.nameEn.trim()) return { ok: false, error: "validation" };
  const nameAm = input.nameAm.trim() || input.nameEn.trim();
  const nameOm = input.nameOm.trim() || input.nameEn.trim();
  if (input.id) {
    await query(
      `update exam_categories set code = $1, name_en = $2, name_am = $3, name_om = $4, description_en = $5 where id = $6`,
      [code, input.nameEn.trim(), nameAm, nameOm, input.descriptionEn.trim(), input.id],
    );
    await audit(actor, "update", "category", input.id, input.nameEn.trim());
    return { ok: true, id: input.id };
  }
  const id = crypto.randomUUID();
  const sort = (await query(`select coalesce(max(sort_order), 0) + 1 as n from exam_categories`))[0];
  await query(
    `insert into exam_categories (id, code, name_en, name_am, name_om, description_en, sort_order) values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, code, input.nameEn.trim(), nameAm, nameOm, input.descriptionEn.trim(), num(sort?.n, 1)],
  );
  await audit(actor, "create", "category", id, input.nameEn.trim());
  return { ok: true, id };
}

export async function listUsers(actor: User) {
  const org = scopedOrg(actor);
  const rows = await query(
    `select u.*, coalesce(o.name, '') as organization_name
     from users u left join organizations o on o.id = u.organization_id
     where ($1::text is null or u.organization_id = $1)
     order by u.full_name`,
    [org],
  );
  return rows.map(mapUser);
}

export async function saveUser(
  actor: User,
  input: {
    id?: string;
    email: string;
    fullName: string;
    role: string;
    organizationId: string | null;
    phone: string;
    password?: string;
    active?: boolean;
  },
): Promise<Ok<{ id: string }> | Fail> {
  if (!isStaff(actor)) return { ok: false, error: "forbidden" };
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone.trim() ? normalizeEthiopianPhone(input.phone) : "";
  if (input.phone.trim() && !phone) return { ok: false, error: "phone" };
  let role = input.role as Role;
  if (!email || !fullName || !email.includes("@")) return { ok: false, error: "validation" };
  if (actor.role === "exam_manager") {
    role = "candidate";
    if (input.organizationId !== actor.organizationId) return { ok: false, error: "forbidden" };
  }
  if (!["super_admin", "exam_manager", "candidate"].includes(role)) return { ok: false, error: "validation" };
  if (role !== "super_admin" && !input.organizationId) return { ok: false, error: "validation" };
  if (input.organizationId && !managesOrg(actor, input.organizationId) && actor.role !== "super_admin") {
    return { ok: false, error: "forbidden" };
  }
  const organizationId = role === "super_admin" ? null : input.organizationId;
  if (input.id) {
    const current = await query(`select role, organization_id from users where id = $1`, [input.id]);
    if (!current[0]) return { ok: false, error: "not_found" };
    if (actor.role === "exam_manager" && String(current[0].organization_id) !== actor.organizationId) {
      return { ok: false, error: "forbidden" };
    }
    if (input.password && input.password.length < 8) return { ok: false, error: "password" };
    if (input.password) {
      const hash = await hashPassword(input.password);
      await query(
        `update users set email = $1, full_name = $2, role = $3, organization_id = $4, phone = $5, password_hash = $6, active = $7 where id = $8`,
        [email, fullName, role, organizationId, phone || "", hash, input.active !== false, input.id],
      );
    } else {
      await query(
        `update users set email = $1, full_name = $2, role = $3, organization_id = $4, phone = $5, active = $6 where id = $7`,
        [email, fullName, role, organizationId, phone || "", input.active !== false, input.id],
      );
    }
    await audit(actor, "update", "user", input.id, email, organizationId);
    return { ok: true, id: input.id };
  }
  if (!input.password || input.password.length < 8) return { ok: false, error: "password" };
  const id = crypto.randomUUID();
  try {
    await query(
      `insert into users (id, email, password_hash, full_name, role, organization_id, phone, active) values ($1,$2,$3,$4,$5,$6,$7, true)`,
      [id, email, await hashPassword(input.password), fullName, role, organizationId, phone || ""],
    );
  } catch {
    return { ok: false, error: "email_taken" };
  }
  await audit(actor, "create", "user", id, email, organizationId);
  return { ok: true, id };
}

export async function registerCandidate(input: {
  email: string;
  fullName: string;
  organizationId: string;
  phone: string;
  password: string;
}): Promise<Ok<{ id: string }> | Fail> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName || !input.organizationId || input.password.length < 8) return { ok: false, error: "validation" };
  const org = await query(`select id from organizations where id = $1`, [input.organizationId]);
  if (!org[0]) return { ok: false, error: "validation" };
  const id = crypto.randomUUID();
  try {
    await query(
      `insert into users (id, email, password_hash, full_name, role, organization_id, phone) values ($1,$2,$3,$4,'candidate',$5,$6)`,
      [id, email, await hashPassword(input.password), fullName, input.organizationId, input.phone.trim()],
    );
  } catch {
    return { ok: false, error: "email_taken" };
  }
  await audit(null, "register", "user", id, email, input.organizationId);
  return { ok: true, id };
}

export async function listGroups(actor: User) {
  const org = scopedOrg(actor);
  const rows = await query(
    `select g.*, o.name as organization_name,
            (select count(*) from group_members m where m.group_id = g.id) as member_count
     from candidate_groups g join organizations o on o.id = g.organization_id
     where ($1::text is null or g.organization_id = $1)
     order by g.name`,
    [org],
  );
  return rows.map(
    (row) =>
      ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        organizationName: String(row.organization_name ?? ""),
        departmentId: row.department_id ? String(row.department_id) : null,
        name: String(row.name),
        memberCount: num(row.member_count),
        createdAt: iso(row.created_at) || "",
      }) as Group,
  );
}

export async function getGroup(actor: User, id: string) {
  const rows = await query(
    `select g.*, o.name as organization_name,
            (select count(*) from group_members m where m.group_id = g.id) as member_count
     from candidate_groups g join organizations o on o.id = g.organization_id where g.id = $1`,
    [id],
  );
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return null;
  const members = await query(`select user_id from group_members where group_id = $1`, [id]);
  return {
    group: {
      id: String(rows[0].id),
      organizationId: String(rows[0].organization_id),
      organizationName: String(rows[0].organization_name ?? ""),
      departmentId: rows[0].department_id ? String(rows[0].department_id) : null,
      name: String(rows[0].name),
      memberCount: num(rows[0].member_count),
      createdAt: iso(rows[0].created_at) || "",
    } as Group,
    memberIds: members.map((row) => String(row.user_id)),
  };
}

export async function saveGroup(
  actor: User,
  input: { id?: string; organizationId: string; name: string; departmentId: string | null; memberIds: string[] },
): Promise<Ok<{ id: string }> | Fail> {
  if (!managesOrg(actor, input.organizationId)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "validation" };
  const id = input.id || crypto.randomUUID();
  await tx(async (q) => {
    if (input.id) {
      await q(`update candidate_groups set name = $1, organization_id = $2, department_id = $3 where id = $4`, [
        name,
        input.organizationId,
        input.departmentId,
        id,
      ]);
      await q(`delete from group_members where group_id = $1`, [id]);
    } else {
      await q(`insert into candidate_groups (id, organization_id, department_id, name) values ($1,$2,$3,$4)`, [
        id,
        input.organizationId,
        input.departmentId,
        name,
      ]);
    }
    for (const userId of input.memberIds) {
      const user = await q(`select id, role, organization_id from users where id = $1 and role = 'candidate'`, [userId]);
      if (!user[0]) continue;
      await q(`insert into group_members (group_id, user_id) values ($1,$2) on conflict do nothing`, [id, userId]);
    }
  });
  await audit(actor, input.id ? "update" : "create", "group", id, name, input.organizationId);
  return { ok: true, id };
}

export async function listQuestions(
  actor: User,
  filters: { q?: string; subject?: string; difficulty?: string; type?: string } = {},
) {
  const org = scopedOrg(actor);
  const term = (filters.q || "").trim().replace(/[%_]/g, "");
  const rows = await query(
    `select q.*, o.name as organization_name
     from questions q join organizations o on o.id = q.organization_id
     where ($1::text is null or q.organization_id = $1)
       and ($2::text = '' or q.stem ilike $3 or q.subject ilike $3 or q.topic ilike $3)
       and ($4::text = '' or q.subject = $4)
       and ($5::text = '' or q.difficulty = $5)
       and ($6::text = '' or q.type = $6)
     order by q.updated_at desc`,
    [org, term, `%${term}%`, filters.subject || "", filters.difficulty || "", filters.type || ""],
  );
  return rows.map(mapQuestion);
}

export async function getQuestion(actor: User, id: string) {
  const rows = await query(
    `select q.*, o.name as organization_name from questions q join organizations o on o.id = q.organization_id where q.id = $1`,
    [id],
  );
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return null;
  return mapQuestion(rows[0]);
}

export type QuestionInput = {
  id?: string;
  organizationId: string;
  type: string;
  stem: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: string;
  options: Option[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  pairs: Pair[];
  mediaUrl: string;
  mediaKind: string;
  mediaAlt: string;
  points: number;
};

function validateQuestion(input: QuestionInput): Fail | null {
  const type = input.type as QuestionType;
  if (!TYPES.has(type) || !input.stem.trim() || !input.subject.trim()) return { ok: false, error: "validation" };
  if (!Number.isInteger(input.points) || input.points < 1 || input.points > 100) return { ok: false, error: "validation" };
  if (type === "single" || type === "multiple") {
    const options = input.options.filter((option) => option.text.trim());
    if (options.length < 2) return { ok: false, error: "validation" };
    if (input.correctOptionIds.length < 1) return { ok: false, error: "validation" };
    if (type === "single" && input.correctOptionIds.length !== 1) return { ok: false, error: "validation" };
  }
  if (type === "true_false" && !["true", "false"].includes(input.correctOptionIds[0] || "")) {
    return { ok: false, error: "validation" };
  }
  if ((type === "short" || type === "blank") && input.acceptedAnswers.filter(Boolean).length < 1) {
    return { ok: false, error: "validation" };
  }
  if (type === "matching" && input.pairs.filter((pair) => pair.left.trim() && pair.right.trim()).length < 2) {
    return { ok: false, error: "validation" };
  }
  if (input.mediaUrl.trim() && !input.mediaAlt.trim()) return { ok: false, error: "validation" };
  return null;
}

export async function saveQuestion(actor: User, input: QuestionInput): Promise<Ok<{ id: string }> | Fail> {
  if (!managesOrg(actor, input.organizationId)) return { ok: false, error: "forbidden" };
  const invalid = validateQuestion(input);
  if (invalid) return invalid;
  const media = cleanMedia(input.mediaUrl, input.mediaKind);
  if (media.error) return { ok: false, error: media.error };
  const type = input.type as QuestionType;
  const options =
    type === "true_false"
      ? [
          { id: "true", text: "True" },
          { id: "false", text: "False" },
        ]
      : input.options.filter((option) => option.text.trim()).map((option) => ({ id: option.id || crypto.randomUUID(), text: option.text.trim() }));
  const correct = type === "true_false" ? [input.correctOptionIds[0]] : input.correctOptionIds.filter((id) => options.some((option) => option.id === id));
  const pairs = input.pairs
    .filter((pair) => pair.left.trim() && pair.right.trim())
    .map((pair) => ({ id: pair.id || crypto.randomUUID(), left: pair.left.trim(), right: pair.right.trim() }));
  const accepted = input.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean);
  const difficulty = ["easy", "medium", "hard"].includes(input.difficulty) ? input.difficulty : "medium";
  const fields = [
    input.organizationId,
    type,
    input.stem.trim(),
    input.explanation.trim(),
    input.subject.trim(),
    (input.topic.trim() || input.subject.trim()),
    difficulty,
    JSON.stringify(options),
    JSON.stringify(correct),
    JSON.stringify(accepted),
    JSON.stringify(pairs),
    media.url,
    media.kind,
    input.mediaAlt.trim(),
    input.points,
  ];
  if (input.id) {
    const current = await query(`select organization_id from questions where id = $1`, [input.id]);
    if (!current[0] || !managesOrg(actor, String(current[0].organization_id))) return { ok: false, error: "forbidden" };
    await query(
      `update questions set organization_id = $1, type = $2, stem = $3, explanation = $4, subject = $5, topic = $6,
        difficulty = $7, options = $8::jsonb, correct_option_ids = $9::jsonb, accepted_answers = $10::jsonb, pairs = $11::jsonb,
        media_url = $12, media_kind = $13, media_alt = $14, points = $15, updated_at = now() where id = $16`,
      [...fields, input.id],
    );
    await audit(actor, "update", "question", input.id, input.stem.trim().slice(0, 80), input.organizationId);
    return { ok: true, id: input.id };
  }
  const id = crypto.randomUUID();
  await query(
    `insert into questions (id, organization_id, type, stem, explanation, subject, topic, difficulty, options, correct_option_ids, accepted_answers, pairs, media_url, media_kind, media_alt, points, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)`,
    [id, ...fields, actor.id],
  );
  await audit(actor, "create", "question", id, input.stem.trim().slice(0, 80), input.organizationId);
  return { ok: true, id };
}

export async function deleteQuestion(actor: User, id: string): Promise<Ok | Fail> {
  const rows = await query(`select organization_id, stem from questions where id = $1`, [id]);
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  const used = await query(`select 1 from exam_questions where question_id = $1 limit 1`, [id]);
  if (used.length) return { ok: false, error: "used" };
  await query(`delete from questions where id = $1`, [id]);
  await audit(actor, "delete", "question", id, String(rows[0].stem).slice(0, 80), String(rows[0].organization_id));
  return { ok: true };
}

function normalizeType(value: string): QuestionType | null {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, QuestionType> = {
    single: "single",
    mcq: "single",
    multiple_choice: "single",
    multiple: "multiple",
    multi: "multiple",
    true_false: "true_false",
    tf: "true_false",
    boolean: "true_false",
    short: "short",
    short_answer: "short",
    blank: "blank",
    fill: "blank",
    fill_in_the_blank: "blank",
    matching: "matching",
    match: "matching",
    essay: "essay",
  };
  return aliases[key] ?? null;
}

export async function importQuestionRows(actor: User, organizationId: string, table: string[][]): Promise<Ok<{ imported: number; skipped: number }> | Fail> {
  if (!managesOrg(actor, organizationId)) return { ok: false, error: "forbidden" };
  if (table.length < 2) return { ok: false, error: "file" };
  const col = headerIndex(table[0]);
  let imported = 0;
  let skipped = 0;
  for (const row of table.slice(1)) {
    const type = normalizeType(col(row, "type"));
    const stem = col(row, "stem", "question");
    if (!type || !stem) {
      skipped += 1;
      continue;
    }
    const letters = ["a", "b", "c", "d", "e", "f"];
    const options = letters
      .map((letter) => ({ id: `opt_${letter}`, text: col(row, `option_${letter}`, letter) }))
      .filter((option) => option.text);
    const correctRaw = col(row, "correct", "answer");
    const correctLetters = correctRaw.split(/[|,;]/).map((part) => part.trim().toLowerCase()).filter(Boolean);
    let correctOptionIds = correctLetters
      .map((letter) => (letter.length === 1 ? `opt_${letter}` : letter))
      .filter((id) => options.some((option) => option.id === id) || id === "true" || id === "false");
    if (type === "true_false") {
      const token = correctRaw.trim().toLowerCase();
      correctOptionIds = token === "false" || token === "f" ? ["false"] : ["true"];
    }
    const accepted = col(row, "accepted", "accepted_answers")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const pairs = col(row, "pairs")
      .split("|")
      .map((part) => {
        const [left, right] = part.split("=");
        return { id: crypto.randomUUID(), left: (left || "").trim(), right: (right || "").trim() };
      })
      .filter((pair) => pair.left && pair.right);
    const saved = await saveQuestion(actor, {
      organizationId,
      type,
      stem,
      explanation: col(row, "explanation"),
      subject: col(row, "subject") || "General",
      topic: col(row, "topic"),
      difficulty: col(row, "difficulty") || "medium",
      options,
      correctOptionIds,
      acceptedAnswers: accepted,
      pairs,
      mediaUrl: col(row, "media_url"),
      mediaKind: col(row, "media_kind") || "image",
      mediaAlt: col(row, "media_alt"),
      points: Math.max(1, num(col(row, "points"), 1)),
    });
    if (saved.ok) imported += 1;
    else skipped += 1;
  }
  await audit(actor, "import", "question", organizationId, `${imported} imported, ${skipped} skipped`, organizationId);
  return { ok: true, imported, skipped };
}

export async function listExams(actor: User) {
  const org = scopedOrg(actor);
  const rows = await query(`${EXAM_SELECT} where ($1::text is null or e.organization_id = $1) order by e.updated_at desc`, [org]);
  return rows.map(mapExam);
}

export async function getExam(id: string) {
  const rows = await query(`${EXAM_SELECT} where e.id = $1`, [id]);
  return rows[0] ? mapExam(rows[0]) : null;
}

export async function examQuestionLinks(examId: string) {
  const rows = await query(
    `select q.*, o.name as organization_name, eq.points as exam_points, eq.sort_order
     from exam_questions eq
     join questions q on q.id = eq.question_id
     join organizations o on o.id = q.organization_id
     where eq.exam_id = $1
     order by eq.sort_order, q.stem`,
    [examId],
  );
  return rows.map((row) => ({ ...mapQuestion(row), points: num(row.exam_points, num(row.points, 1)), sortOrder: num(row.sort_order) }));
}

export async function attemptCount(examId: string) {
  const rows = await query(`select count(*) as n from attempts where exam_id = $1`, [examId]);
  return num(rows[0]?.n);
}

export type ExamInput = {
  id?: string;
  organizationId: string;
  categoryId: string;
  departmentId: string | null;
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
  questionIds: string[];
  proctorWebcam: boolean;
  proctorFullscreen: boolean;
  status: ExamStatus;
};

export async function saveExam(actor: User, input: ExamInput): Promise<Ok<{ id: string }> | Fail> {
  if (!managesOrg(actor, input.organizationId)) return { ok: false, error: "forbidden" };
  const title = input.title.trim();
  if (!title || !input.categoryId) return { ok: false, error: "validation" };
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 360) {
    return { ok: false, error: "validation" };
  }
  if (input.passMark < 0 || input.passMark > 100) return { ok: false, error: "validation" };
  if (input.startAt && input.endAt && new Date(input.startAt).getTime() >= new Date(input.endAt).getTime()) {
    return { ok: false, error: "window_order" };
  }
  const questionIds = [...new Set(input.questionIds.filter(Boolean))];
  if (input.status !== "draft" && questionIds.length < 1) return { ok: false, error: "validation" };
  if (input.selectionMode === "random_each" && (input.randomCount < 1 || input.randomCount > questionIds.length)) {
    return { ok: false, error: "validation" };
  }
  const releaseAt =
    input.resultRelease === "scheduled"
      ? input.releaseOverridden && input.resultReleaseAt
        ? input.resultReleaseAt
        : defaultReleaseAt(input.endAt)
      : null;

  const existing = input.id ? await getExam(input.id) : null;
  if (input.id && (!existing || !managesOrg(actor, existing.organizationId))) return { ok: false, error: "forbidden" };
  const locked = input.id ? (await attemptCount(input.id)) > 0 : false;
  const id = input.id || crypto.randomUUID();

  const owned = questionIds.length
    ? await query(
        `select id, points from questions where organization_id = $1 and status = 'published' and id = any($2::text[])`,
        [input.organizationId, questionIds],
      )
    : [];
  if (owned.length !== questionIds.length && !locked) return { ok: false, error: "validation" };

  await tx(async (q) => {
    const params = [
      input.organizationId,
      input.categoryId,
      input.departmentId,
      title,
      input.description.trim(),
      input.instructions.trim(),
      locked && existing ? existing.durationMinutes : input.durationMinutes,
      input.startAt,
      input.endAt,
      input.passMark,
      locked && existing ? existing.shuffleQuestions : input.shuffleQuestions,
      locked && existing ? existing.shuffleOptions : input.shuffleOptions,
      input.resultRelease,
      releaseAt,
      input.resultRelease === "scheduled" ? input.releaseOverridden : false,
      locked && existing ? existing.selectionMode : input.selectionMode,
      locked && existing ? existing.randomCount : input.selectionMode === "random_each" ? input.randomCount : questionIds.length,
      input.proctorWebcam,
      input.proctorFullscreen,
      input.status,
      id,
    ];
    if (existing) {
      await q(
        `update exams set organization_id = $1, category_id = $2, department_id = $3, title = $4, description = $5,
          instructions = $6, duration_minutes = $7, start_at = $8, end_at = $9, pass_mark = $10,
          shuffle_questions = $11, shuffle_options = $12, result_release = $13, result_release_at = $14,
          release_overridden = $15, selection_mode = $16, random_count = $17, proctor_webcam = $18,
          proctor_fullscreen = $19, status = $20, updated_at = now() where id = $21`,
        params,
      );
      await q(`update attempts set passed = case when percentage is null then null else percentage >= $1 end where exam_id = $2`, [
        input.passMark,
        id,
      ]);
    } else {
      await q(
        `insert into exams (organization_id, category_id, department_id, title, description, instructions, duration_minutes,
          start_at, end_at, pass_mark, shuffle_questions, shuffle_options, result_release, result_release_at, release_overridden,
          selection_mode, random_count, proctor_webcam, proctor_fullscreen, status, id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [...params, actor.id],
      );
    }
    if (!locked) {
      await q(`delete from exam_questions where exam_id = $1`, [id]);
      const points = new Map(owned.map((row) => [String(row.id), num(row.points, 1)]));
      for (let index = 0; index < questionIds.length; index += 1) {
        await q(`insert into exam_questions (exam_id, question_id, sort_order, points) values ($1,$2,$3,$4)`, [
          id,
          questionIds[index],
          index,
          points.get(questionIds[index]) ?? 1,
        ]);
      }
    }
  });

  await audit(
    actor,
    existing ? "update" : "create",
    "exam",
    id,
    `${title} · ${input.resultRelease}${releaseAt ? ` · ${releaseAt}` : ""}`,
    input.organizationId,
  );
  if (input.status === "published") await notifyScheduledExam(id);
  if (input.resultRelease === "scheduled") await processDueReleases(true);
  return { ok: true, id };
}

export async function deleteExam(actor: User, id: string): Promise<Ok | Fail> {
  const exam = await getExam(id);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false, error: "forbidden" };
  if (exam.status !== "draft" || (await attemptCount(id)) > 0) return { ok: false, error: "used" };
  await query(`delete from exams where id = $1`, [id]);
  await audit(actor, "delete", "exam", id, exam.title, exam.organizationId);
  return { ok: true };
}

export async function releaseExamNow(actor: User, examId: string): Promise<Ok | Fail> {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false, error: "forbidden" };
  if (exam.resultRelease !== "scheduled") return { ok: false, error: "validation" };
  await query(`update exams set result_release_at = now(), release_overridden = true, updated_at = now() where id = $1`, [examId]);
  await audit(actor, "release", "exam", examId, exam.title, exam.organizationId);
  await processDueReleases(true);
  return { ok: true };
}

export async function listAssignments(examId: string) {
  return query(
    `select a.id, a.assignee_type, a.assignee_id,
            case when a.assignee_type = 'user' then u.full_name else g.name end as label
     from exam_assignments a
     left join users u on a.assignee_type = 'user' and u.id = a.assignee_id
     left join candidate_groups g on a.assignee_type = 'group' and g.id = a.assignee_id
     where a.exam_id = $1
     order by a.assignee_type, label`,
    [examId],
  );
}

export async function assignExam(actor: User, examId: string, assigneeType: string, assigneeId: string): Promise<Ok | Fail> {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false, error: "forbidden" };
  if (assigneeType !== "user" && assigneeType !== "group") return { ok: false, error: "validation" };
  await query(
    `insert into exam_assignments (id, exam_id, assignee_type, assignee_id) values ($1,$2,$3,$4)
     on conflict (exam_id, assignee_type, assignee_id) do nothing`,
    [crypto.randomUUID(), examId, assigneeType, assigneeId],
  );
  await audit(actor, "assign", "exam", examId, `${assigneeType}:${assigneeId}`, exam.organizationId);
  if (exam.status === "published") await notifyScheduledExam(examId);
  return { ok: true };
}

export async function unassignExam(actor: User, assignmentId: string): Promise<Ok | Fail> {
  const rows = await query(
    `select a.id, a.exam_id, e.organization_id from exam_assignments a join exams e on e.id = a.exam_id where a.id = $1`,
    [assignmentId],
  );
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  await query(`delete from exam_assignments where id = $1`, [assignmentId]);
  await audit(actor, "unassign", "exam", String(rows[0].exam_id), assignmentId, String(rows[0].organization_id));
  return { ok: true };
}

export async function assignedCandidates(examId: string) {
  const rows = await query(
    `select distinct u.* from users u
     where u.role = 'candidate' and u.active = true and (
       u.id in (select assignee_id from exam_assignments where exam_id = $1 and assignee_type = 'user')
       or u.id in (
         select m.user_id from exam_assignments a
         join group_members m on m.group_id = a.assignee_id
         where a.exam_id = $1 and a.assignee_type = 'group'
       )
     )`,
    [examId],
  );
  return rows.map((row) => mapUser({ ...row, organization_name: "" }));
}

export async function isAssigned(examId: string, userId: string) {
  const rows = await query(
    `select 1 from exam_assignments where exam_id = $1 and assignee_type = 'user' and assignee_id = $2
     union
     select 1 from exam_assignments a
     join group_members m on m.group_id = a.assignee_id
     where a.exam_id = $1 and a.assignee_type = 'group' and m.user_id = $2
     limit 1`,
    [examId, userId],
  );
  return rows.length > 0;
}

export async function notifyScheduledExam(examId: string) {
  const exam = await getExam(examId);
  if (!exam || exam.status !== "published") return;
  const people = await assignedCandidates(examId);
  for (const person of people) {
    const when = exam.resultReleaseAt ? formatAddis(exam.resultReleaseAt, person.locale) : "";
    const message = scheduleMessage(person.locale, {
      name: person.fullName,
      exam: exam.title,
      org: exam.organizationName,
      start: exam.startAt ? formatAddis(exam.startAt, person.locale) : releaseLine(person.locale, "instant", "").includes("mark") ? "Open now" : "Open now",
      end: exam.endAt ? formatAddis(exam.endAt, person.locale) : "—",
      duration: exam.durationMinutes,
      pass: exam.passMark,
      release: releaseLine(person.locale, exam.resultRelease, when),
    });
    await enqueueNotification({
      userId: person.id,
      email: person.email,
      subject: message.subject,
      body: message.body,
      kind: "schedule",
      refId: examId,
    });
  }
}

export type ExamCard = {
  exam: Exam;
  attemptId: string | null;
  attemptStatus: string | null;
  gradingStatus: string | null;
  percentage: number | null;
  passed: boolean | null;
  score: number | null;
  maxScore: number | null;
  window: ReturnType<typeof examWindow>;
  showScore: boolean;
  message: ResultMessage | null;
};

export async function listMyExams(actor: User): Promise<ExamCard[]> {
  const rows = await query(
    `${EXAM_SELECT.replace("select e.*", "select e.*, a.id as attempt_id, a.status as attempt_status, a.grading_status, a.percentage, a.passed, a.score, a.max_score, a.submitted_at as attempt_submitted")}
     left join attempts a on a.exam_id = e.id and a.candidate_id = $1
     where e.status = 'published' and (
       exists (select 1 from exam_assignments x where x.exam_id = e.id and x.assignee_type = 'user' and x.assignee_id = $1)
       or exists (
         select 1 from exam_assignments x
         join group_members m on m.group_id = x.assignee_id
         where x.exam_id = e.id and x.assignee_type = 'group' and m.user_id = $1
       )
     )
     order by e.title`,
    [actor.id],
  );
  return rows.map((row) => {
    const exam = mapExam(row);
    const attemptStatus = row.attempt_status ? String(row.attempt_status) : null;
    const gradingStatus = row.grading_status ? String(row.grading_status) : null;
    const stub = {
      status: attemptStatus === "submitted" ? "submitted" : "in_progress",
      gradingStatus: gradingStatus === "finalized" || gradingStatus === "pending_manual" ? gradingStatus : "auto",
    } as Attempt;
    const showScore = attemptStatus === "submitted" && candidateCanSeeScore(exam, stub);
    return {
      exam,
      attemptId: row.attempt_id ? String(row.attempt_id) : null,
      attemptStatus,
      gradingStatus,
      percentage: showScore && row.percentage != null ? num(row.percentage) : null,
      passed: showScore && row.passed != null ? bool(row.passed) : null,
      score: showScore && row.score != null ? num(row.score) : null,
      maxScore: showScore && row.max_score != null ? num(row.max_score) : null,
      window: examWindow(exam),
      showScore,
      message: attemptStatus === "submitted" ? candidateResultState(exam, stub) : null,
    };
  });
}

async function loadPaper(examId: string) {
  const links = await examQuestionLinks(examId);
  return links.map((question) => paperFromQuestion(question, question.points));
}

export async function startAttempt(actor: User, examId: string): Promise<Ok<{ attemptId: string; resumed: boolean }> | Fail> {
  if (actor.role !== "candidate") return { ok: false, error: "forbidden" };
  const exam = await getExam(examId);
  if (!exam || exam.status !== "published") return { ok: false, error: "not_found" };
  if (!(await isAssigned(examId, actor.id))) return { ok: false, error: "not_assigned" };
  const existingRows = await query(`select id, status from attempts where exam_id = $1 and candidate_id = $2`, [examId, actor.id]);
  if (existingRows[0]?.status === "submitted") return { ok: false, error: "already_submitted" };
  if (existingRows[0]?.status === "in_progress") return { ok: true, attemptId: String(existingRows[0].id), resumed: true };
  if (examWindow(exam) !== "open") return { ok: false, error: "window" };
  const pool = await loadPaper(examId);
  if (!pool.length) return { ok: false, error: "validation" };
  let chosen = pool;
  if (exam.selectionMode === "random_each") chosen = shuffle(pool).slice(0, Math.min(exam.randomCount || pool.length, pool.length));
  else if (exam.shuffleQuestions) chosen = shuffle(pool);
  const optionOrders: Record<string, string[]> = {};
  const matchingOrders: Record<string, string[]> = {};
  for (const question of chosen) {
    const optionIds = question.options.map((option) => option.id);
    const pairIds = question.pairs.map((pair) => pair.id);
    optionOrders[question.id] = exam.shuffleOptions ? shuffle(optionIds) : optionIds;
    matchingOrders[question.id] = exam.shuffleOptions ? shuffle(pairIds) : pairIds;
  }
  let deadline = Date.now() + exam.durationMinutes * 60_000;
  if (exam.endAt) deadline = Math.min(deadline, new Date(exam.endAt).getTime());
  const id = crypto.randomUUID();
  await query(
    `insert into attempts (id, exam_id, candidate_id, status, grading_status, deadline_at, question_order, option_orders, matching_orders, paper, last_seen_at)
     values ($1,$2,$3,'in_progress','auto',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb, now())`,
    [
      id,
      examId,
      actor.id,
      new Date(deadline).toISOString(),
      JSON.stringify(chosen.map((question) => question.id)),
      JSON.stringify(optionOrders),
      JSON.stringify(matchingOrders),
      JSON.stringify(chosen),
    ],
  );
  await audit(actor, "start", "attempt", id, exam.title, exam.organizationId);
  return { ok: true, attemptId: id, resumed: false };
}

export function presentQuestion(question: PaperQuestion, optionOrder: string[] = [], matchingOrder: string[] = []): PresentedQuestion {
  const optionsById = new Map(question.options.map((option) => [option.id, option]));
  const order = optionOrder.length ? optionOrder : question.options.map((option) => option.id);
  const rights = new Map(question.pairs.map((pair) => [pair.id, { id: pair.id, text: pair.right }]));
  const rightOrder = matchingOrder.length ? matchingOrder : question.pairs.map((pair) => pair.id);
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    subject: question.subject,
    topic: question.topic,
    points: question.points,
    mediaUrl: question.mediaUrl,
    mediaKind: question.mediaKind,
    mediaAlt: question.mediaAlt,
    options: order.map((id) => optionsById.get(id)).filter((option): option is Option => !!option),
    left: question.pairs.map((pair) => ({ id: pair.id, text: pair.left })),
    right: rightOrder.map((id) => rights.get(id)).filter((option): option is Option => !!option),
  };
}

export async function playerPayload(actor: User, attemptId: string) {
  const rows = await query(
    `select a.*, u.full_name as candidate_name, u.email as candidate_email
     from attempts a join users u on u.id = a.candidate_id where a.id = $1`,
    [attemptId],
  );
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const attempt = mapAttempt(rows[0], true);
  if (attempt.candidateId !== actor.id) return { ok: false as const, error: "forbidden" };
  if (attempt.status === "submitted") return { ok: false as const, error: "already_submitted", attemptId };
  const exam = await getExam(attempt.examId);
  if (!exam) return { ok: false as const, error: "not_found" };
  const byId = new Map(attempt.paper.map((question) => [question.id, question]));
  const questions = attempt.questionOrder
    .map((id) => byId.get(id))
    .filter((question): question is PaperQuestion => !!question)
    .map((question) => presentQuestion(question, attempt.optionOrders[question.id], attempt.matchingOrders[question.id]));
  const answerRows = await query(`select * from answers where attempt_id = $1`, [attemptId]);
  const answers = Object.fromEntries(answerRows.map((row) => {
    const answer = mapAnswer(row);
    return [answer.questionId, { selected: answer.selectedOptionIds, text: answer.textAnswer, matching: answer.matching, flagged: answer.flagged, updatedAt: answer.updatedAt }];
  }));
  return {
    ok: true as const,
    attemptId,
    examTitle: exam.title,
    durationMinutes: exam.durationMinutes,
    deadlineAt: attempt.deadlineAt,
    serverNow: new Date().toISOString(),
    proctorWebcam: exam.proctorWebcam,
    proctorFullscreen: exam.proctorFullscreen,
    questions,
    answers,
    tabSwitchCount: attempt.tabSwitchCount,
  };
}

async function ownLiveAttempt(actor: User, attemptId: string) {
  const rows = await query(`select * from attempts where id = $1 and candidate_id = $2`, [attemptId, actor.id]);
  if (!rows[0]) return null;
  return mapAttempt(rows[0], true);
}

async function holdSession(attemptId: string, tabId: string) {
  const rows = await query(
    `update attempts set session_token = $1
     where id = $2 and status = 'in_progress' and (session_token is null or session_token = $1)
     returning id`,
    [tabId, attemptId],
  );
  return rows.length > 0;
}

export async function claimAttempt(actor: User, attemptId: string, tabId: string): Promise<Ok | Fail> {
  const attempt = await ownLiveAttempt(actor, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };
  if (attempt.status !== "in_progress") return { ok: false, error: "already_submitted" };
  if (!(await holdSession(attemptId, tabId))) return { ok: false, error: "other_session" };
  return { ok: true };
}

export async function saveAnswer(
  actor: User,
  input: { attemptId: string; tabId: string; questionId: string; selected: string[]; text: string; matching: Record<string, string>; flagged: boolean },
): Promise<Ok<{ savedAt: string }> | Fail> {
  const attempt = await ownLiveAttempt(actor, input.attemptId);
  if (!attempt || attempt.status !== "in_progress") return { ok: false, error: "already_submitted" };
  if (new Date(attempt.deadlineAt).getTime() <= Date.now()) {
    await finishAttempt(input.attemptId, "timer");
    return { ok: false, error: "expired" };
  }
  if (!(await holdSession(input.attemptId, input.tabId))) return { ok: false, error: "other_session" };
  if (!attempt.paper.some((question) => question.id === input.questionId)) return { ok: false, error: "validation" };
  const selected = [...new Set(input.selected.map(String))].slice(0, 12);
  const text = input.text.slice(0, 20000);
  await query(
    `insert into answers (attempt_id, question_id, selected_option_ids, text_answer, matching, flagged, updated_at)
     values ($1,$2,$3::jsonb,$4,$5::jsonb,$6, now())
     on conflict (attempt_id, question_id) do update set
       selected_option_ids = excluded.selected_option_ids,
       text_answer = excluded.text_answer,
       matching = excluded.matching,
       flagged = excluded.flagged,
       updated_at = now()`,
    [input.attemptId, input.questionId, JSON.stringify(selected), text, JSON.stringify(input.matching || {}), input.flagged],
  );
  await query(
    `update attempts set last_seen_at = now(), answered_count = (
      select count(*) from answers where attempt_id = $1 and (
        jsonb_array_length(selected_option_ids) > 0 or length(text_answer) > 0 or matching::text not in ('{}','null')
      )
    ) where id = $1`,
    [input.attemptId],
  );
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function logProctor(
  actor: User,
  input: { attemptId: string; tabId: string; kind: string; detail?: string; snapshot?: string },
): Promise<Ok<{ suspicious: number; tabSwitches: number; risk: number }> | Fail> {
  const attempt = await ownLiveAttempt(actor, input.attemptId);
  if (!attempt || attempt.status !== "in_progress") return { ok: false, error: "already_submitted" };
  if (!(await holdSession(input.attemptId, input.tabId))) return { ok: false, error: "other_session" };
  const kind = input.kind.slice(0, 40);
  let snapshot = "";
  if (input.snapshot && input.snapshot.startsWith("data:image/jpeg") && input.snapshot.length < 150_000) {
    const count = await query(`select count(*) as n from proctor_events where attempt_id = $1 and kind = 'camera_snapshot'`, [input.attemptId]);
    if (num(count[0]?.n) < 24) snapshot = input.snapshot;
  }
  await query(`insert into proctor_events (id, attempt_id, kind, detail, snapshot) values ($1,$2,$3,$4,$5)`, [
    crypto.randomUUID(),
    input.attemptId,
    kind,
    (input.detail || "").slice(0, 200),
    snapshot,
  ]);
  if (kind === "tab_switch") {
    await query(`update attempts set tab_switch_count = tab_switch_count + 1, suspicious_count = suspicious_count + 1 where id = $1`, [input.attemptId]);
  } else if (SUSPICIOUS.has(kind)) {
    await query(`update attempts set suspicious_count = suspicious_count + 1 where id = $1`, [input.attemptId]);
  }
  await refreshRisk(input.attemptId);
  const fresh = await query(`select tab_switch_count, suspicious_count, risk_score from attempts where id = $1`, [input.attemptId]);
  return { ok: true, suspicious: num(fresh[0]?.suspicious_count), tabSwitches: num(fresh[0]?.tab_switch_count), risk: num(fresh[0]?.risk_score) };
}

async function finishAttempt(attemptId: string, reason: string) {
  await query(
    `update attempts set status = 'submitted', submitted_at = case when $2 = 'timer' then deadline_at else now() end, submit_reason = $2
     where id = $1 and status = 'in_progress'`,
    [attemptId, reason],
  );
  await gradeAttempt(attemptId);
  const paperRow = await query(`select paper from attempts where id = $1`, [attemptId]);
  const paper = parseJson<PaperQuestion[]>(paperRow[0]?.paper, []);
  await calibrateQuestions(paper.map((question) => question.id));
  await refreshRisk(attemptId);
  await maybeNotifyResult(attemptId);
}

export async function heartbeat(actor: User, attemptId: string, tabId: string) {
  const attempt = await ownLiveAttempt(actor, attemptId);
  if (!attempt || attempt.status !== "in_progress") return { ok: false as const, error: "already_submitted" };
  if (!(await holdSession(attemptId, tabId))) return { ok: false as const, error: "other_session" };
  const seen = await query(`select last_seen_at from attempts where id = $1`, [attemptId]);
  const last = seen[0]?.last_seen_at ? new Date(String(seen[0].last_seen_at)).getTime() : 0;
  if (last && Date.now() - last > 45_000) {
    await query(`insert into proctor_events (id, attempt_id, kind, detail) values ($1,$2,'disconnect','Heartbeat gap')`, [crypto.randomUUID(), attemptId]);
    await query(`update attempts set disconnect_count = disconnect_count + 1 where id = $1`, [attemptId]);
    await refreshRisk(attemptId);
  }
  const answered = await query(
    `select count(*) as n from answers where attempt_id = $1 and (
      jsonb_array_length(selected_option_ids) > 0 or length(text_answer) > 0 or matching::text not in ('{}','null')
    )`,
    [attemptId],
  );
  await query(`update attempts set last_seen_at = now(), answered_count = $2 where id = $1`, [attemptId, num(answered[0]?.n)]);
  return { ok: true as const, answered: num(answered[0]?.n) };
}

export async function liveBoard(actor: User, examId: string) {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return null;
  const rows = await query(
    `select a.id, a.status, a.deadline_at, a.last_seen_at, a.risk_score,
            (select count(*) from answers ans where ans.attempt_id = a.id and (
              jsonb_array_length(ans.selected_option_ids) > 0 or length(ans.text_answer) > 0 or ans.matching::text not in ('{}','null')
            )) as answered_count, a.question_order,
            a.disconnect_count, a.tab_switch_count, a.started_at, a.submitted_at, u.full_name
     from attempts a join users u on u.id = a.candidate_id
     where a.exam_id = $1
     order by a.status, u.full_name`,
    [examId],
  );
  for (const row of rows) await refreshRisk(String(row.id));
  const scored = await query(
    `select a.id, a.risk_score from attempts a where a.exam_id = $1`,
    [examId],
  );
  const risks = new Map(scored.map((row) => [String(row.id), num(row.risk_score)]));
  const now = Date.now();
  return {
    examTitle: exam.title,
    serverNow: new Date(now).toISOString(),
    sitting: rows.map((row) => {
      const last = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : 0;
      const inProgress = row.status === "in_progress";
      const online = inProgress && last > 0 && now - last < 25_000;
      const total = parseJson<string[]>(row.question_order, []).length;
      const deadline = new Date(String(row.deadline_at)).getTime();
      return {
        id: String(row.id),
        name: String(row.full_name),
        status: String(row.status),
        online,
        disconnected: inProgress && !online,
        answered: num(row.answered_count),
        total,
        secondsLeft: inProgress ? Math.max(0, Math.round((deadline - now) / 1000)) : 0,
        disconnects: num(row.disconnect_count),
        risk: risks.get(String(row.id)) ?? num(row.risk_score),
        tabSwitches: num(row.tab_switch_count),
        lastSeen: iso(row.last_seen_at),
      };
    }),
  };
}

export async function submitAttempt(actor: User, attemptId: string, tabId: string, reason: "manual" | "timer" = "manual"): Promise<Ok | Fail> {
  const attempt = await ownLiveAttempt(actor, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };
  if (attempt.status === "submitted") return { ok: true };
  const expired = new Date(attempt.deadlineAt).getTime() <= Date.now();
  if (!expired && !(await holdSession(attemptId, tabId))) return { ok: false, error: "other_session" };
  await finishAttempt(attemptId, expired ? "timer" : reason);
  return { ok: true };
}

export async function gradeEssays(
  actor: User,
  attemptId: string,
  grades: { questionId: string; points: number; comment: string }[],
): Promise<Ok | Fail> {
  const rows = await query(`select a.*, e.organization_id from attempts a join exams e on e.id = a.exam_id where a.id = $1`, [attemptId]);
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  const attempt = mapAttempt(rows[0], true);
  if (attempt.status !== "submitted") return { ok: false, error: "validation" };
  for (const grade of grades) {
    const question = attempt.paper.find((item) => item.id === grade.questionId && item.type === "essay");
    if (!question) continue;
    const points = Math.max(0, Math.min(question.points, Number(grade.points) || 0));
    await query(
      `update answers set points_awarded = $1, manual_comment = $2, updated_at = now() where attempt_id = $3 and question_id = $4`,
      [points, grade.comment.slice(0, 2000), attemptId, grade.questionId],
    );
  }
  await gradeAttempt(attemptId);
  const paperRow = await query(`select paper from attempts where id = $1`, [attemptId]);
  await calibrateQuestions(parseJson<PaperQuestion[]>(paperRow[0]?.paper, []).map((question) => question.id));
  await maybeNotifyResult(attemptId);
  await audit(actor, "grade", "attempt", attemptId, `${grades.length} essays`, String(rows[0].organization_id));
  return { ok: true };
}

export async function resetAttemptSession(actor: User, attemptId: string): Promise<Ok | Fail> {
  const rows = await query(`select a.id, e.organization_id from attempts a join exams e on e.id = a.exam_id where a.id = $1`, [attemptId]);
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  await query(`update attempts set session_token = null where id = $1 and status = 'in_progress'`, [attemptId]);
  await audit(actor, "reset_session", "attempt", attemptId, "", String(rows[0].organization_id));
  return { ok: true };
}

export async function ensureVerificationCode(attemptId: string) {
  const rows = await query(`select verification_code from attempts where id = $1`, [attemptId]);
  if (rows[0]?.verification_code) return String(rows[0].verification_code);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const updated = await query(
      `update attempts set verification_code = $1 where id = $2 and verification_code is null returning verification_code`,
      [code, attemptId],
    );
    if (updated[0]?.verification_code) return String(updated[0].verification_code);
    const again = await query(`select verification_code from attempts where id = $1`, [attemptId]);
    if (again[0]?.verification_code) return String(again[0].verification_code);
  }
  return "";
}

export async function maybeNotifyResult(attemptId: string) {
  const rows = await query(
    `select a.*, u.full_name as candidate_name, u.email as candidate_email, u.locale,
            e.result_release, e.result_release_at, e.title, e.organization_id
     from attempts a
     join users u on u.id = a.candidate_id
     join exams e on e.id = a.exam_id
     where a.id = $1`,
    [attemptId],
  );
  if (!rows[0]) return;
  const attempt = mapAttempt(rows[0]);
  const exam = {
    resultRelease: rows[0].result_release === "scheduled" ? "scheduled" : "instant",
    resultReleaseAt: iso(rows[0].result_release_at),
  } as Exam;
  if (!candidateCanSeeScore(exam, attempt) || attempt.resultEmailedAt) return;
  const code = await ensureVerificationCode(attemptId);
  const locale = rows[0].locale === "am" || rows[0].locale === "om" ? rows[0].locale : "en";
  const message = resultMessage(locale, {
    name: attempt.candidateName,
    exam: String(rows[0].title),
    score: String(attempt.score ?? 0),
    max: String(attempt.maxScore ?? 0),
    percentage: String(attempt.percentage ?? 0),
    passed: !!attempt.passed,
    code,
    attemptId,
  });
  const sent = await enqueueNotification({
    userId: attempt.candidateId,
    email: attempt.candidateEmail,
    subject: message.subject,
    body: message.body,
    kind: "result",
    refId: attemptId,
  });
  if (sent.status === "error") return;
  await query(`update attempts set result_emailed_at = now() where id = $1 and result_emailed_at is null`, [attemptId]);
}

export async function processDueReleases(force = false) {
  const now = Date.now();
  if (!force && now - lastReleaseRun < 15_000) return 0;
  lastReleaseRun = now;
  const expired = await query<{ id: string }>(`select id from attempts where status = 'in_progress' and deadline_at <= now()`);
  for (const row of expired) await finishAttempt(String(row.id), "timer");
  const due = await query<{ id: string }>(
    `select a.id from attempts a join exams e on e.id = a.exam_id
     where a.status = 'submitted' and a.grading_status = 'finalized' and a.result_emailed_at is null
       and (e.result_release = 'instant' or (e.result_release_at is not null and e.result_release_at <= now()))`,
  );
  for (const row of due) await maybeNotifyResult(String(row.id));
  return due.length;
}

export async function getResultView(actor: User, attemptId: string) {
  const rows = await query(
    `select a.*, u.full_name as candidate_name, u.email as candidate_email
     from attempts a join users u on u.id = a.candidate_id where a.id = $1`,
    [attemptId],
  );
  if (!rows[0]) return null;
  const attempt = mapAttempt(rows[0], true);
  const exam = await getExam(attempt.examId);
  if (!exam) return null;
  const staff = managesOrg(actor, exam.organizationId);
  const mine = actor.id === attempt.candidateId;
  if (!staff && !mine) return null;
  const showScore = staff || candidateCanSeeScore(exam, attempt);
  const message = candidateResultState(exam, attempt);
  if (showScore && attempt.gradingStatus === "finalized" && !attempt.verificationCode) {
    attempt.verificationCode = await ensureVerificationCode(attempt.id);
  }
  const answerRows = showScore ? await query(`select * from answers where attempt_id = $1`, [attemptId]) : [];
  const answers = new Map(answerRows.map((row) => [String(row.question_id), mapAnswer(row)]));
  const review = showScore
    ? attempt.paper.map((question) => ({
        question,
        answer: answers.get(question.id) || null,
      }))
    : [];
  return { exam, attempt: { ...attempt, paper: showScore ? attempt.paper : [] }, showScore, message, review, staff };
}

export async function listAttemptSummaries(examId: string) {
  const rows = await query(
    `select a.id, a.exam_id, a.candidate_id, a.status, a.grading_status, a.started_at, a.submitted_at, a.deadline_at,
            a.score, a.max_score, a.percentage, a.passed, a.tab_switch_count, a.suspicious_count, a.session_token,
            a.question_order, a.option_orders, a.matching_orders, a.verification_code, a.submit_reason, a.result_emailed_at,
            u.full_name as candidate_name, u.email as candidate_email
     from attempts a join users u on u.id = a.candidate_id
     where a.exam_id = $1
     order by a.percentage desc nulls last, a.submitted_at asc`,
    [examId],
  );
  return rows.map((row) => mapAttempt(row));
}

export async function examReport(actor: User, examId: string) {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return null;
  const attempts = await listAttemptSummaries(examId);
  const full = await query(
    `select id, paper from attempts where exam_id = $1 and status = 'submitted'`,
    [examId],
  );
  const papers = new Map(full.map((row) => [String(row.id), parseJson<PaperQuestion[]>(row.paper, [])]));
  const answerRows = await query(
    `select * from answers where attempt_id in (select id from attempts where exam_id = $1 and status = 'submitted')`,
    [examId],
  );
  const finalized = attempts.filter((attempt) => attempt.status === "submitted" && attempt.gradingStatus === "finalized" && attempt.percentage != null);
  const buckets = [
    { label: "0–49", count: 0 },
    { label: "50–59", count: 0 },
    { label: "60–69", count: 0 },
    { label: "70–79", count: 0 },
    { label: "80–89", count: 0 },
    { label: "90–100", count: 0 },
  ];
  for (const attempt of finalized) {
    const pct = attempt.percentage ?? 0;
    const index = pct < 50 ? 0 : pct < 60 ? 1 : pct < 70 ? 2 : pct < 80 ? 3 : pct < 90 ? 4 : 5;
    buckets[index].count += 1;
  }
  const questionMap = new Map<string, { id: string; stem: string; type: string; subject: string; topic: string; asked: number; correct: number; earned: number; possible: number }>();
  const topicMap = new Map<string, { topic: string; earned: number; possible: number }>();
  const answersByAttempt = new Map<string, Map<string, Answer>>();
  for (const row of answerRows) {
    const answer = mapAnswer(row);
    const bucket = answersByAttempt.get(answer.attemptId) ?? new Map<string, Answer>();
    bucket.set(answer.questionId, answer);
    answersByAttempt.set(answer.attemptId, bucket);
  }
  for (const [attemptId, paper] of papers) {
    const answers = answersByAttempt.get(attemptId) ?? new Map<string, Answer>();
    for (const question of paper) {
      const stat = questionMap.get(question.id) ?? {
        id: question.id,
        stem: question.stem,
        type: question.type,
        subject: question.subject,
        topic: question.topic,
        asked: 0,
        correct: 0,
        earned: 0,
        possible: 0,
      };
      const answer = answers.get(question.id);
      stat.asked += 1;
      stat.possible += question.points;
      stat.earned += answer?.pointsAwarded ?? 0;
      if (answer?.isCorrect) stat.correct += 1;
      questionMap.set(question.id, stat);
      const topic = topicMap.get(question.topic) ?? { topic: question.topic, earned: 0, possible: 0 };
      topic.earned += answer?.pointsAwarded ?? 0;
      topic.possible += question.points;
      topicMap.set(question.topic, topic);
    }
  }
  const events = await query(
    `select p.*, u.full_name from proctor_events p
     join attempts a on a.id = p.attempt_id
     join users u on u.id = a.candidate_id
     where a.exam_id = $1
     order by p.created_at desc limit 300`,
    [examId],
  );
  const average = finalized.length ? Math.round((finalized.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / finalized.length) * 10) / 10 : null;
  const passRate = finalized.length ? Math.round((finalized.filter((attempt) => attempt.passed).length / finalized.length) * 1000) / 10 : null;
  const highest = finalized.length ? Math.max(...finalized.map((attempt) => attempt.percentage ?? 0)) : null;
  let rank = 0;
  let lastPct: number | null = null;
  const ranked = finalized.map((attempt, index) => {
    if (attempt.percentage !== lastPct) rank = index + 1;
    lastPct = attempt.percentage;
    return { ...attempt, rank };
  });
  return {
    exam,
    attempts,
    ranked,
    distribution: buckets,
    questions: [...questionMap.values()],
    topics: [...topicMap.values()].sort((a, b) => a.earned / Math.max(1, a.possible) - b.earned / Math.max(1, b.possible)),
    events: events.map((row) => ({
      id: String(row.id),
      attemptId: String(row.attempt_id),
      candidateName: String(row.full_name),
      kind: String(row.kind),
      detail: String(row.detail ?? ""),
      snapshot: String(row.snapshot ?? ""),
      createdAt: iso(row.created_at) || "",
    })),
    average,
    passRate,
    highest,
    submitted: attempts.filter((attempt) => attempt.status === "submitted").length,
  };
}

export async function candidateHistory(actor: User, candidateId: string) {
  const personRows = await query(
    `select u.*, coalesce(o.name, '') as organization_name from users u left join organizations o on o.id = u.organization_id where u.id = $1`,
    [candidateId],
  );
  if (!personRows[0]) return null;
  const person = mapUser(personRows[0]);
  const allowed =
    actor.id === person.id ||
    actor.role === "super_admin" ||
    (actor.role === "exam_manager" && (person.organizationId === actor.organizationId || (await sharesExam(actor, person.id))));
  if (!allowed) return null;
  const rows = await query(
    `select a.id, a.exam_id, a.candidate_id, a.status, a.grading_status, a.started_at, a.submitted_at, a.deadline_at,
            a.score, a.max_score, a.percentage, a.passed, a.tab_switch_count, a.suspicious_count,
            a.verification_code, a.submit_reason, a.result_emailed_at, a.question_order, a.option_orders, a.matching_orders,
            u.full_name as candidate_name, u.email as candidate_email,
            e.title, e.result_release, e.result_release_at, e.pass_mark, c.code as category_code, o.name as organization_name
     from attempts a
     join users u on u.id = a.candidate_id
     join exams e on e.id = a.exam_id
     join exam_categories c on c.id = e.category_id
     join organizations o on o.id = e.organization_id
     where a.candidate_id = $1
     order by coalesce(a.submitted_at, a.started_at) desc`,
    [candidateId],
  );
  const items = rows.map((row) => {
    const attempt = mapAttempt(row);
    const examStub = {
      resultRelease: row.result_release === "scheduled" ? "scheduled" : "instant",
      resultReleaseAt: iso(row.result_release_at),
    } as Exam;
    const staff = actor.role !== "candidate";
    const showScore = staff || candidateCanSeeScore(examStub, attempt);
    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      title: String(row.title),
      organizationName: String(row.organization_name),
      categoryCode: String(row.category_code),
      status: attempt.status,
      gradingStatus: attempt.gradingStatus,
      submittedAt: attempt.submittedAt,
      startedAt: attempt.startedAt,
      percentage: showScore ? attempt.percentage : null,
      passed: showScore ? attempt.passed : null,
      score: showScore ? attempt.score : null,
      maxScore: showScore ? attempt.maxScore : null,
      showScore,
      message: attempt.status === "submitted" ? candidateResultState(examStub, attempt) : null,
      resultReleaseAt: examStub.resultReleaseAt,
      resultRelease: examStub.resultRelease,
      suspiciousCount: staff ? attempt.suspiciousCount : 0,
    };
  });
  return { person, items };
}

export async function refreshDifficulty(actor: User) {
  const org = scopedOrg(actor);
  const rows = await query(
    `select distinct a.question_id
     from answers a join questions q on q.id = a.question_id
     where ($1::text is null or q.organization_id = $1)`,
    [org],
  );
  await calibrateQuestions(rows.map((row) => String(row.question_id)));
}

export async function cohortAverages(examIds: string[]) {
  const ids = [...new Set(examIds.filter(Boolean))];
  if (!ids.length) return new Map<string, number>();
  const rows = await query(
    `select exam_id, round(avg(percentage)::numeric, 1) as average
     from attempts
     where status = 'submitted' and grading_status = 'finalized' and percentage is not null and exam_id = any($1::text[])
     group by exam_id`,
    [ids],
  );
  return new Map(rows.map((row) => [String(row.exam_id), num(row.average)]));
}

export async function publishQuestion(actor: User, id: string): Promise<Ok | Fail> {
  const rows = await query(`select organization_id, stem from questions where id = $1`, [id]);
  if (!rows[0] || !managesOrg(actor, String(rows[0].organization_id))) return { ok: false, error: "forbidden" };
  await query(`update questions set status = 'published', updated_at = now() where id = $1`, [id]);
  await audit(actor, "publish", "question", id, String(rows[0].stem).slice(0, 80), String(rows[0].organization_id));
  return { ok: true };
}

export async function saveDraftQuestions(
  actor: User,
  input: { organizationId: string; subject: string; topic: string; difficulty: string; drafts: QuestionInput[] },
): Promise<Ok<{ count: number }> | Fail> {
  if (!managesOrg(actor, input.organizationId)) return { ok: false, error: "forbidden" };
  let count = 0;
  for (const draft of input.drafts) {
    const saved = await saveQuestion(actor, { ...draft, organizationId: input.organizationId, id: undefined });
    if (!saved.ok) continue;
    await query(`update questions set status = 'draft', subject = $2, topic = $3 where id = $1`, [
      saved.id,
      input.subject.trim() || draft.subject,
      input.topic.trim() || draft.topic,
    ]);
    count += 1;
  }
  if (!count) return { ok: false, error: "validation" };
  return { ok: true, count };
}

async function sharesExam(actor: User, candidateId: string) {
  if (!actor.organizationId) return false;
  const rows = await query(
    `select 1 from attempts a join exams e on e.id = a.exam_id
     where a.candidate_id = $1 and e.organization_id = $2 limit 1`,
    [candidateId, actor.organizationId],
  );
  return rows.length > 0;
}

export async function topicStrength(actor: User, candidateId: string) {
  const history = await candidateHistory(actor, candidateId);
  if (!history) return null;
  const rows = await query(
    `select a.id, a.status, a.grading_status, a.paper, e.result_release, e.result_release_at
     from attempts a join exams e on e.id = a.exam_id
     where a.candidate_id = $1 and a.status = 'submitted'`,
    [candidateId],
  );
  const ids = rows.map((row) => String(row.id));
  const answerRows = ids.length
    ? await query(`select * from answers where attempt_id = any($1::text[])`, [ids])
    : [];
  const answers = new Map<string, Map<string, Answer>>();
  for (const row of answerRows) {
    const answer = mapAnswer(row);
    const bucket = answers.get(answer.attemptId) ?? new Map<string, Answer>();
    bucket.set(answer.questionId, answer);
    answers.set(answer.attemptId, bucket);
  }
  const topics = new Map<string, { topic: string; earned: number; possible: number }>();
  const scores: number[] = [];
  for (const row of rows) {
    const attempt = {
      status: "submitted" as const,
      gradingStatus: row.grading_status === "finalized" ? "finalized" as const : "pending_manual" as const,
    };
    const exam = { resultRelease: row.result_release === "scheduled" ? "scheduled" as const : "instant" as const, resultReleaseAt: iso(row.result_release_at) };
    if (actor.role === "candidate" && !candidateCanSeeScore(exam, attempt)) continue;
    if (attempt.gradingStatus !== "finalized") continue;
    const paper = parseJson<PaperQuestion[]>(row.paper, []);
    const mine = answers.get(String(row.id)) ?? new Map<string, Answer>();
    let earned = 0;
    let possible = 0;
    for (const question of paper) {
      const answer = mine.get(question.id);
      const topic = topics.get(question.topic) ?? { topic: question.topic, earned: 0, possible: 0 };
      topic.earned += answer?.pointsAwarded ?? 0;
      topic.possible += question.points;
      topics.set(question.topic, topic);
      earned += answer?.pointsAwarded ?? 0;
      possible += question.points;
    }
    if (possible) scores.push(Math.round((earned / possible) * 1000) / 10);
  }
  return {
    topics: [...topics.values()].sort((a, b) => b.possible - a.possible),
    scores,
  };
}

export async function dashboardCounts(actor: User) {
  const org = scopedOrg(actor);
  const [orgs, users, questions, exams, attempts] = await Promise.all([
    query(`select count(*) as n from organizations where ($1::text is null or id = $1)`, [org]),
    query(`select count(*) as n from users where ($1::text is null or organization_id = $1)`, [org]),
    query(`select count(*) as n from questions where ($1::text is null or organization_id = $1)`, [org]),
    query(`select count(*) as n from exams where ($1::text is null or organization_id = $1)`, [org]),
    query(
      `select count(*) as n from attempts a join exams e on e.id = a.exam_id where ($1::text is null or e.organization_id = $1)`,
      [org],
    ),
  ]);
  return {
    organizations: num(orgs[0]?.n),
    users: num(users[0]?.n),
    questions: num(questions[0]?.n),
    exams: num(exams[0]?.n),
    attempts: num(attempts[0]?.n),
  };
}

export async function listAudit(actor: User) {
  if (!isStaff(actor)) return [];
  const org = scopedOrg(actor);
  const rows = await query(
    `select * from audit_logs where ($1::text is null or organization_id = $1) order by created_at desc limit 300`,
    [org],
  );
  return rows.map((row) => ({
    id: String(row.id),
    actorName: String(row.actor_name ?? ""),
    action: String(row.action),
    entity: String(row.entity),
    entityId: String(row.entity_id ?? ""),
    detail: String(row.detail ?? ""),
    createdAt: iso(row.created_at) || "",
  }));
}

export async function listNotifications(actor: User) {
  const rows =
    actor.role === "super_admin"
      ? await query(`select n.*, coalesce(u.full_name, '') as full_name from notifications n left join users u on u.id = n.user_id order by n.created_at desc limit 300`)
      : actor.role === "exam_manager"
        ? await query(
            `select n.*, coalesce(u.full_name, '') as full_name from notifications n left join users u on u.id = n.user_id
             where u.organization_id = $1 order by n.created_at desc limit 300`,
            [actor.organizationId],
          )
        : await query(
            `select n.*, '' as full_name from notifications n where n.user_id = $1 order by n.created_at desc limit 100`,
            [actor.id],
          );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.full_name ?? ""),
    email: String(row.to_email),
    subject: String(row.subject),
    body: String(row.body),
    kind: String(row.kind),
    status: String(row.status),
    error: String(row.error ?? ""),
    createdAt: iso(row.created_at) || "",
  }));
}

export async function lookupVerification(code: string) {
  const rows = await query(
    `select a.*, u.full_name as candidate_name, e.title, e.result_release, e.result_release_at, o.name as organization_name, e.pass_mark
     from attempts a
     join users u on u.id = a.candidate_id
     join exams e on e.id = a.exam_id
     join organizations o on o.id = e.organization_id
     where a.verification_code = $1`,
    [code.trim().toUpperCase()],
  );
  if (!rows[0]) return null;
  const attempt = mapAttempt(rows[0]);
  const exam = { resultRelease: rows[0].result_release === "scheduled" ? "scheduled" as const : "instant" as const, resultReleaseAt: iso(rows[0].result_release_at) };
  if (!candidateCanSeeScore(exam, attempt)) return null;
  return {
    code: attempt.verificationCode,
    name: attempt.candidateName,
    exam: String(rows[0].title),
    organization: String(rows[0].organization_name),
    percentage: attempt.percentage,
    score: attempt.score,
    maxScore: attempt.maxScore,
    passed: attempt.passed,
    submittedAt: attempt.submittedAt,
    passMark: num(rows[0].pass_mark, 50),
  };
}

export async function loginAudit(user: User) {
  await audit(user, "login", "session", user.id, user.email, user.organizationId);
}

export async function restoreDemo(actor: User): Promise<Ok | Fail> {
  if (actor.role !== "super_admin") return { ok: false, error: "forbidden" };
  if (!usingLocalFile() && process.env.SEED_DEMO !== "true") return { ok: false, error: "restore_disabled" };
  const { reseed } = await import("./seed");
  await reseed();
  return { ok: true };
}

export async function questionsForEditor(actor: User, organizationId: string) {
  if (!managesOrg(actor, organizationId)) return [];
  const rows = await query(
    `select id, stem, type, subject, topic, difficulty, points from questions where organization_id = $1 and status = 'published' order by subject, stem`,
    [organizationId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    stem: String(row.stem),
    type: String(row.type),
    subject: String(row.subject),
    topic: String(row.topic),
    difficulty: String(row.difficulty),
    points: num(row.points, 1),
  }));
}

