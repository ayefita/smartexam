import { randomInt } from "crypto";
import { headerIndex } from "./csv";
import { query } from "./db";
import { assignedCandidates, getExam, managesOrg } from "./domain";
import { appOrigin, formatAddis } from "./format";
import { dictionaries, fill } from "./i18n";
import { sendEmail } from "./messaging";
import { hashPassword, verifyPassword } from "./password";
import { normalizeEthiopianPhone } from "./phone";
import type { Exam, Locale, User } from "./types";

/** Rows per import file. Hashing and inserts for this many fit well inside one serverless request. */
export const IMPORT_MAX_ROWS = 200;
/** Recipients per batch request. The client sends the next batch when one returns. */
export const BATCH_SIZE = 25;
/** Stop starting new work after this long so a request finishes before the function time limit. */
const TIME_BUDGET_MS = 18_000;

// No 0/O, 1/l/I: easy to read off a printed slip.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMP_PASSWORD = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{10}$/;

export function tempPassword(length = 10) {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
    if (/[0-9]/.test(out) && /[a-z]/.test(out) && /[A-Z]/.test(out)) return out;
  }
}

export type CredentialStatus = "created" | "existing" | "reset" | "error";

export type CredentialRow = {
  line: number;
  userId: string;
  fullName: string;
  email: string;
  candidateNumber: string;
  status: CredentialStatus;
  /** Only present right after it was generated. Never stored in plain text. */
  password?: string;
  error?: string;
};

export type DeliveryResult = { userId: string; ok: boolean; error?: string };

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    }),
  );
  return out;
}

async function audit(actor: User, action: string, entity: string, entityId: string, detail: string, organizationId: string | null) {
  await query(
    `insert into audit_logs (id, actor_id, actor_name, organization_id, action, entity, entity_id, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [crypto.randomUUID(), actor.id, actor.fullName, organizationId, action, entity, entityId, detail.slice(0, 500)],
  );
}

export async function managedExam(actor: User, examId: string, organizationId?: string) {
  if (!examId) return null;
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return null;
  if (organizationId && exam.organizationId !== organizationId) return null;
  return exam;
}

type ImportInput = {
  organizationId: string;
  groupId: string;
  newGroupName: string;
  examId: string;
  resetExisting: boolean;
  table: string[][];
};

export async function importCandidates(actor: User, input: ImportInput) {
  if (!managesOrg(actor, input.organizationId)) return { ok: false as const, error: "forbidden" };
  const org = await query(`select id from organizations where id = $1`, [input.organizationId]);
  if (!org[0]) return { ok: false as const, error: "validation" };
  const [header, ...body] = input.table;
  if (!header) return { ok: false as const, error: "file" };
  if (body.length > IMPORT_MAX_ROWS) return { ok: false as const, error: "too_many" };
  const col = headerIndex(header);

  let exam: Exam | null = null;
  if (input.examId) {
    exam = await managedExam(actor, input.examId, input.organizationId);
    if (!exam) return { ok: false as const, error: "bad_exam" };
  }

  let groupId = "";
  if (input.groupId) {
    const group = await query(`select id from candidate_groups where id = $1 and organization_id = $2`, [input.groupId, input.organizationId]);
    if (!group[0]) return { ok: false as const, error: "validation" };
    groupId = input.groupId;
  } else if (input.newGroupName.trim()) {
    const name = input.newGroupName.trim().slice(0, 120);
    const found = await query(`select id from candidate_groups where organization_id = $1 and lower(name) = lower($2) limit 1`, [input.organizationId, name]);
    if (found[0]) groupId = String(found[0].id);
    else {
      groupId = crypto.randomUUID();
      await query(`insert into candidate_groups (id, organization_id, name) values ($1,$2,$3)`, [groupId, input.organizationId, name]);
      await audit(actor, "create", "group", groupId, name, input.organizationId);
    }
  }

  // Validate every row first, then do the database work.
  const seen = new Set<string>();
  type Planned = { line: number; fullName: string; email: string; phone: string; candidateNumber: string; error?: string };
  const planned: Planned[] = body.map((row, index) => {
    const line = index + 2;
    const fullName = col(row, "full_name", "name", "fullname", "candidate_name", "student_name").replace(/\s+/g, " ").slice(0, 160);
    const email = col(row, "email", "e-mail", "email_address", "username").toLowerCase();
    const rawPhone = col(row, "phone", "phone_number", "mobile", "telephone");
    const candidateNumber = col(row, "candidate_number", "id_number", "id", "student_id", "index_number", "number", "registration_number").slice(0, 60);
    const phone = rawPhone ? normalizeEthiopianPhone(rawPhone) : "";
    const base = { line, fullName, email, phone: phone || "", candidateNumber };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ...base, error: "rowInvalidEmail" };
    if (!fullName) return { ...base, error: "rowMissingName" };
    if (rawPhone && !phone) return { ...base, error: "rowPhone" };
    if (seen.has(email)) return { ...base, error: "rowDuplicate" };
    seen.add(email);
    return base;
  });

  // One lookup for every email in the file, then bulk writes, so a full file needs only a handful of round trips.
  const emails = planned.filter((item) => !item.error).map((item) => item.email);
  const found = emails.length
    ? await query(`select id, email, role, organization_id, full_name, candidate_number from users where email = any($1::text[])`, [emails])
    : [];
  const byEmail = new Map(found.map((row) => [String(row.email), row]));
  const rows: CredentialRow[] = await pool(planned, 4, async (item): Promise<CredentialRow> => {
    const shell = { line: item.line, userId: "", fullName: item.fullName, email: item.email, candidateNumber: item.candidateNumber };
    if (item.error) return { ...shell, status: "error", error: item.error };
    const current = byEmail.get(item.email);
    if (!current) return { ...shell, userId: crypto.randomUUID(), status: "created", password: tempPassword() };
    if (current.role !== "candidate" || String(current.organization_id || "") !== input.organizationId) {
      return { ...shell, status: "error", error: "rowOtherOrg" };
    }
    const userId = String(current.id);
    const number = item.candidateNumber || String(current.candidate_number || "");
    if (input.resetExisting) {
      const password = tempPassword();
      await query(
        `update users set password_hash = $1, must_change_password = true, active = true, candidate_number = $2 where id = $3`,
        [await hashPassword(password), number, userId],
      );
      await query(`delete from sessions where user_id = $1`, [userId]);
      return { ...shell, userId, fullName: String(current.full_name), candidateNumber: number, status: "reset", password };
    }
    if (item.candidateNumber && item.candidateNumber !== String(current.candidate_number || "")) {
      await query(`update users set candidate_number = $1 where id = $2`, [item.candidateNumber, userId]);
    }
    return { ...shell, userId, fullName: String(current.full_name), candidateNumber: number, status: "existing" };
  });

  const fresh = rows.filter((row) => row.status === "created");
  if (fresh.length) {
    const phoneByLine = new Map(planned.map((item) => [item.line, item.phone]));
    const hashes = await pool(fresh, 4, (row) => hashPassword(row.password as string));
    const inserted = await query(
      `insert into users (id, email, password_hash, full_name, role, organization_id, phone, active, verification_channel, must_change_password, candidate_number)
       select r.id, r.email, r.hash, r.name, 'candidate', $6, r.phone, true, 'email', true, r.num
       from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $7::text[]) as r(id, email, hash, name, phone, num)
       on conflict (email) do nothing
       returning id`,
      [
        fresh.map((row) => row.userId),
        fresh.map((row) => row.email),
        hashes,
        fresh.map((row) => row.fullName),
        fresh.map((row) => phoneByLine.get(row.line) || ""),
        input.organizationId,
        fresh.map((row) => row.candidateNumber),
      ],
    );
    const ok = new Set(inserted.map((row) => String(row.id)));
    for (const row of fresh) {
      if (ok.has(row.userId)) continue;
      // Someone registered this email between the lookup and the insert.
      row.status = "error";
      row.error = "rowOtherOrg";
      row.userId = "";
      delete row.password;
    }
  }

  const placed = rows.filter((row) => row.userId);
  if (groupId && placed.length) {
    await query(
      `insert into group_members (group_id, user_id) select $1, u from unnest($2::text[]) as u on conflict do nothing`,
      [groupId, placed.map((row) => row.userId)],
    );
  }
  if (exam) {
    const targets = groupId ? [{ type: "group", id: groupId }] : placed.map((row) => ({ type: "user", id: row.userId }));
    if (targets.length) {
      await query(
        `insert into exam_assignments (id, exam_id, assignee_type, assignee_id)
         select gen_random_uuid()::text, $1, $2, a from unnest($3::text[]) as a
         on conflict (exam_id, assignee_type, assignee_id) do nothing`,
        [exam.id, groupId ? "group" : "user", targets.map((target) => target.id)],
      );
    }
    await audit(actor, "assign", "exam", exam.id, `import:${targets.length} ${groupId ? "group" : "user"}`, exam.organizationId);
  }
  const count = (status: CredentialStatus) => rows.filter((row) => row.status === status).length;
  await audit(
    actor,
    "import",
    "user",
    groupId || input.organizationId,
    `candidates created ${count("created")}, existing ${count("existing")}, reset ${count("reset")}, errors ${count("error")}`,
    input.organizationId,
  );
  return { ok: true as const, rows, examId: exam?.id || "", groupId };
}

/** Candidates this actor may manage, in the requested order. */
async function managedCandidates(actor: User, userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, BATCH_SIZE);
  if (!ids.length) return [];
  const rows = await query(
    `select u.*, coalesce(o.name, '') as organization_name from users u
     left join organizations o on o.id = u.organization_id
     where u.id = any($1::text[]) and u.role = 'candidate'`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is Record<string, unknown> => !!row && managesOrg(actor, row.organization_id ? String(row.organization_id) : null));
}

export type LoginMail = { fullName: string; email: string; password: string; organizationName: string; locale: Locale; exam: Exam | null };

export function loginEmail(input: LoginMail) {
  const t = mailText[input.locale] || mailText.en;
  const login = `${appOrigin()}/login`;
  const lines = [
    fill(t.hello, { name: input.fullName }),
    "",
    fill(t.lead, { org: input.organizationName || "SmartExam" }),
    "",
    `${t.signIn}: ${login}`,
    `${t.username}: ${input.email}`,
    `${t.password}: ${input.password}`,
    "",
    t.change,
  ];
  if (input.exam) {
    lines.push(
      "",
      `${t.exam}: ${input.exam.title}`,
      `${t.window}: ${examWindowText(input.exam, input.locale)}`,
      `${t.link}: ${examLink(input.exam.id)}`,
    );
  }
  lines.push("", t.ignore, "", "Smart Online Examination System");
  return { subject: input.exam ? fill(t.subjectExam, { exam: input.exam.title }) : t.subject, body: lines.join("\n") };
}

export function examLink(examId: string) {
  return `${appOrigin()}/take/${examId}`;
}

export function examWindowText(exam: Pick<Exam, "startAt" | "endAt">, locale: Locale) {
  const zone = dictionaries[locale]?.zone || "Addis Ababa time";
  if (!exam.startAt && !exam.endAt) return "—";
  return `${formatAddis(exam.startAt, locale)} – ${formatAddis(exam.endAt, locale)} (${zone})`;
}

const mailText: Record<Locale, Record<string, string>> = {
  en: {
    subject: "SmartExam: your sign-in details",
    subjectExam: "SmartExam: your sign-in details for {exam}",
    hello: "Hello {name},",
    lead: "{org} has created a SmartExam account for you.",
    signIn: "Sign-in page",
    username: "Username",
    password: "Temporary password",
    change: "You will be asked to choose your own password the first time you sign in.",
    exam: "Exam",
    window: "Exam window",
    link: "Exam link",
    ignore: "If you were not expecting this message, you can ignore it.",
  },
  am: {
    subject: "SmartExam: የመግቢያ መረጃዎ",
    subjectExam: "SmartExam: ለ{exam} የመግቢያ መረጃዎ",
    hello: "ሰላም {name}፣",
    lead: "{org} የSmartExam መለያ ፈጥሮልዎታል።",
    signIn: "የመግቢያ ገጽ",
    username: "የተጠቃሚ ስም",
    password: "ጊዜያዊ የይለፍ ቃል",
    change: "ለመጀመሪያ ጊዜ ሲገቡ የራስዎን የይለፍ ቃል እንዲመርጡ ይጠየቃሉ።",
    exam: "ፈተና",
    window: "የፈተና ጊዜ",
    link: "የፈተና አገናኝ",
    ignore: "ይህን መልዕክት ካልጠበቁ ችላ ማለት ይችላሉ።",
  },
  om: {
    subject: "SmartExam: odeeffannoo seenumsa keessanii",
    subjectExam: "SmartExam: odeeffannoo seenumsa {exam}",
    hello: "Akkam {name},",
    lead: "{org} herrega SmartExam isiniif uumeera.",
    signIn: "Fuula seenumsaa",
    username: "Maqaa fayyadamaa",
    password: "Jecha iccitii yeroo",
    change: "Yeroo jalqabaaf yommuu seentan jecha iccitii mataa keessanii akka filattan ni gaafatamtu.",
    exam: "Qormaata",
    window: "Yeroo qormaataa",
    link: "Liinkii qormaataa",
    ignore: "Ergaa kana hin eegne yoo taate, dhiisuu dandeessu.",
  },
};

function localeOf(row: Record<string, unknown>): Locale {
  const value = String(row.locale || "en");
  return value === "am" || value === "om" ? value : "en";
}

/**
 * Emails sign-in details. Each password is checked against the stored hash first, so only the
 * real current temporary password can be sent. Runs one message at a time and stops starting new
 * ones near the time budget; unprocessed ids come back in `pending` for the next request.
 */
export async function emailLogins(actor: User, items: { userId: string; password: string }[], examId: string) {
  const started = Date.now();
  const exam = examId ? await managedExam(actor, examId) : null;
  const wanted = items.slice(0, BATCH_SIZE).filter((item) => TEMP_PASSWORD.test(item.password));
  const people = new Map((await managedCandidates(actor, wanted.map((item) => item.userId))).map((row) => [String(row.id), row]));
  const results: DeliveryResult[] = [];
  const pending: string[] = [];
  for (const item of items.slice(0, BATCH_SIZE)) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      pending.push(item.userId);
      continue;
    }
    const person = people.get(item.userId);
    if (!person || !TEMP_PASSWORD.test(item.password)) {
      results.push({ userId: item.userId, ok: false, error: "forbidden" });
      continue;
    }
    if (!(await verifyPassword(item.password, String(person.password_hash)))) {
      results.push({ userId: item.userId, ok: false, error: "password_changed" });
      continue;
    }
    const mail = loginEmail({
      fullName: String(person.full_name),
      email: String(person.email),
      password: item.password,
      organizationName: String(person.organization_name || ""),
      locale: localeOf(person),
      exam,
    });
    try {
      const sent = await sendEmail(String(person.email), mail.subject, mail.body);
      results.push(sent.ok ? { userId: item.userId, ok: true } : { userId: item.userId, ok: false, error: sent.error || "send failed" });
    } catch (error) {
      results.push({ userId: item.userId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : "send failed" });
    }
  }
  const sent = results.filter((row) => row.ok).length;
  await audit(actor, "email_logins", "user", exam?.id || "", `sent ${sent}, failed ${results.length - sent}${exam ? ` for ${exam.title}` : ""}`, exam?.organizationId ?? actor.organizationId);
  return { results, pending };
}

/** Gives each candidate a new temporary password (signing them out), then emails it. */
export async function resetAndEmailLogins(actor: User, userIds: string[], examId: string) {
  const started = Date.now();
  const exam = examId ? await managedExam(actor, examId) : null;
  if (examId && !exam) return { rows: [] as CredentialRow[], results: [] as DeliveryResult[], pending: [] as string[], error: "forbidden" };
  const people = await managedCandidates(actor, userIds);
  const rows: CredentialRow[] = [];
  const results: DeliveryResult[] = [];
  const pending: string[] = [];
  for (const person of people) {
    const userId = String(person.id);
    if (Date.now() - started > TIME_BUDGET_MS) {
      pending.push(userId);
      continue;
    }
    const password = tempPassword();
    await query(`update users set password_hash = $1, must_change_password = true, active = true where id = $2`, [await hashPassword(password), userId]);
    await query(`delete from sessions where user_id = $1`, [userId]);
    rows.push({ line: rows.length + 1, userId, fullName: String(person.full_name), email: String(person.email), candidateNumber: String(person.candidate_number || ""), status: "reset", password });
    const mail = loginEmail({ fullName: String(person.full_name), email: String(person.email), password, organizationName: String(person.organization_name || ""), locale: localeOf(person), exam });
    try {
      const sent = await sendEmail(String(person.email), mail.subject, mail.body);
      results.push(sent.ok ? { userId, ok: true } : { userId, ok: false, error: sent.error || "send failed" });
    } catch (error) {
      results.push({ userId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : "send failed" });
    }
  }
  const sent = results.filter((row) => row.ok).length;
  await audit(actor, "reset_logins", "user", exam?.id || rows[0]?.userId || "", `reset ${rows.length}, emailed ${sent}${exam ? ` for ${exam.title}` : ""}`, exam?.organizationId ?? (people[0]?.organization_id ? String(people[0].organization_id) : actor.organizationId));
  return { rows, results, pending, error: "" };
}

export async function examLoginTargets(actor: User, examId: string) {
  const exam = await managedExam(actor, examId);
  if (!exam) return null;
  const people = await assignedCandidates(examId);
  return people.filter((person) => managesOrg(actor, person.organizationId)).map((person) => person.id);
}

/** Rebuilds file rows from the database so downloaded names and numbers match the accounts. */
export async function credentialFileRows(actor: User, items: { userId: string; password?: string; status?: string }[]) {
  const list = items.slice(0, IMPORT_MAX_ROWS);
  const ids = [...new Set(list.map((item) => item.userId).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await query(`select id, full_name, email, candidate_number, organization_id, role from users where id = any($1::text[]) and role = 'candidate'`, [ids]);
  const byId = new Map(rows.filter((row) => managesOrg(actor, row.organization_id ? String(row.organization_id) : null)).map((row) => [String(row.id), row]));
  const allowed: CredentialStatus[] = ["created", "existing", "reset"];
  return list.flatMap((item, index): CredentialRow[] => {
    const row = byId.get(item.userId);
    if (!row) return [];
    const status = allowed.includes(item.status as CredentialStatus) ? (item.status as CredentialStatus) : "existing";
    return [{
      line: index + 1,
      userId: item.userId,
      fullName: String(row.full_name),
      email: String(row.email),
      candidateNumber: String(row.candidate_number || ""),
      status,
      password: item.password && TEMP_PASSWORD.test(item.password) ? item.password : undefined,
    }];
  });
}

export async function changeOwnPassword(user: User, password: string, confirm: string) {
  if (password.length < 8) return { ok: false as const, error: "password" };
  if (password !== confirm) return { ok: false as const, error: "password_match" };
  const rows = await query(`select password_hash from users where id = $1`, [user.id]);
  if (rows[0] && (await verifyPassword(password, String(rows[0].password_hash)))) return { ok: false as const, error: "same_password" };
  await query(`update users set password_hash = $1, must_change_password = false where id = $2`, [await hashPassword(password), user.id]);
  await audit(user, "change_password", "user", user.id, user.email, user.organizationId);
  return { ok: true as const };
}

/** Change your own password from the account menu: the current password is required. */
export async function changePasswordWithCurrent(user: User, current: string, password: string, confirm: string) {
  const rows = await query(`select password_hash from users where id = $1`, [user.id]);
  if (!rows[0] || !(await verifyPassword(current, String(rows[0].password_hash)))) return { ok: false as const, error: "current_password" };
  return changeOwnPassword(user, password, confirm);
}

/** Super admin sets a new password for anyone. Their old sessions end, so the new password is needed. */
export async function adminSetPassword(actor: User, userId: string, password: string, mustChange: boolean) {
  if (actor.role !== "super_admin") return { ok: false as const, error: "forbidden" };
  if (password.length < 8) return { ok: false as const, error: "password" };
  const rows = await query(`select id, email, organization_id from users where id = $1`, [userId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const self = userId === actor.id;
  await query(`update users set password_hash = $1, must_change_password = $2 where id = $3`, [await hashPassword(password), mustChange && !self, userId]);
  if (!self) await query(`delete from sessions where user_id = $1`, [userId]);
  await audit(actor, "set_password", "user", userId, String(rows[0].email), rows[0].organization_id ? String(rows[0].organization_id) : null);
  return { ok: true as const };
}
