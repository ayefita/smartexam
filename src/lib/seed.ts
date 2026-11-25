import type { QueryFn } from "./db";
import { query, tx } from "./db";
import { num } from "./format";
import { gradeAttempt } from "./grading";
import { resultMessage, scheduleMessage } from "./notify";
import { hashPassword } from "./password";
import { defaultReleaseAt } from "./results";
import type { Difficulty, Locale, Option, Pair, PaperQuestion, QuestionType } from "./types";

type SeedQuestion = {
  id: string;
  org: string;
  type: QuestionType;
  stem: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  options: Option[];
  correct: string[];
  accepted: string[];
  pairs: Pair[];
  explanation: string;
  points: number;
  mediaUrl: string;
  mediaKind: string;
  mediaAlt: string;
};

const TRIANGLE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#f6f3ec"/><polygon points="36,150 210,150 210,48" fill="#e7f5ee" stroke="#0c5c40" stroke-width="3"/><text x="110" y="170" font-family="sans-serif" font-size="16" fill="#1a1814">3</text><text x="222" y="104" font-family="sans-serif" font-size="16" fill="#1a1814">4</text></svg>`,
)}`;

function choice(stem: string, subject: string, topic: string, difficulty: Difficulty, answers: string[], correctIndex: number | number[], explanation: string, extra: Partial<SeedQuestion> = {}): SeedQuestion {
  const options = answers.map((text, index) => ({ id: `opt_${index}`, text }));
  const correct = (Array.isArray(correctIndex) ? correctIndex : [correctIndex]).map((index) => `opt_${index}`);
  return {
    id: extra.id || "",
    org: extra.org || "",
    type: extra.type || (Array.isArray(correctIndex) && correctIndex.length > 1 ? "multiple" : "single"),
    stem,
    subject,
    topic,
    difficulty,
    options,
    correct,
    accepted: [],
    pairs: [],
    explanation,
    points: extra.points || 1,
    mediaUrl: extra.mediaUrl || "",
    mediaKind: extra.mediaKind || "",
    mediaAlt: extra.mediaAlt || "",
  };
}

const questions: SeedQuestion[] = [
  choice("In a relational database, what does SQL stand for?", "Computer Science", "Databases", "easy", ["Structured Query Language", "Simple Query List", "Sequential Question Logic", "Standard Queue Language"], 0, "SQL is Structured Query Language, the standard language for relational databases.", { id: "q_sql", org: "org_aau" }),
  choice("Which of these are JavaScript primitive values? Select every correct answer.", "Computer Science", "Programming", "medium", ["string", "number", "array", "boolean"], [0, 1, 3], "string, number, and boolean are primitives. An array is an object.", { id: "q_js", org: "org_aau", type: "multiple" }),
  { id: "q_unit", org: "org_aau", type: "true_false", stem: "A unit test is usually written to check one function or module.", subject: "Computer Science", topic: "Software engineering", difficulty: "easy", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: ["true"], accepted: [], pairs: [], explanation: "Unit tests target a small piece of behavior.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_tri", org: "org_aau", type: "short", stem: "The diagram shows a right triangle with legs 3 and 4. What is the length of the hypotenuse?", subject: "Computer Science", topic: "Discrete maths", difficulty: "easy", options: [], correct: [], accepted: ["5"], pairs: [], explanation: "By Pythagoras, 3² + 4² = 5².", points: 1, mediaUrl: TRIANGLE, mediaKind: "image", mediaAlt: "Right triangle with the horizontal leg labeled 3 and the vertical leg labeled 4." },
  { id: "q_au", org: "org_aau", type: "blank", stem: "The headquarters of the African Union is in ___.", subject: "Civics", topic: "Ethiopia", difficulty: "easy", options: [], correct: [], accepted: ["Addis Ababa", "Addis Abeba", "Finfinne"], pairs: [], explanation: "The African Union is headquartered in Addis Ababa.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_match", org: "org_aau", type: "matching", stem: "Match each regional state with its capital.", subject: "Civics", topic: "Ethiopia", difficulty: "medium", options: [], correct: [], accepted: [], pairs: [{ id: "oromia", left: "Oromia", right: "Finfinne" }, { id: "amhara", left: "Amhara", right: "Bahir Dar" }, { id: "sidama", left: "Sidama", right: "Hawassa" }, { id: "afar", left: "Afar", right: "Semera" }], explanation: "Oromia — Finfinne, Amhara — Bahir Dar, Sidama — Hawassa, Afar — Semera.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  choice("If f(x) = 2x + 3, what is f(4)?", "Mathematics", "Functions", "easy", ["11", "8", "14", "9"], 0, "2×4 + 3 = 11.", { id: "q_m1", org: "org_aau" }),
  choice("The solution of 3x − 6 = 0 is", "Mathematics", "Algebra", "easy", ["x = 2", "x = 3", "x = 6", "x = −2"], 0, "Add 6, then divide by 3.", { id: "q_m2", org: "org_aau" }),
  { id: "q_bio", org: "org_aau", type: "true_false", stem: "Mitochondria are the main site of cellular respiration.", subject: "Biology", topic: "Cells", difficulty: "easy", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: ["true"], accepted: [], pairs: [], explanation: "Most ATP from respiration is produced in mitochondria.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  choice("The SI unit of force is the", "Physics", "Mechanics", "easy", ["newton", "joule", "watt", "pascal"], 0, "Force is measured in newtons.", { id: "q_phy", org: "org_aau" }),
  choice("Which sentence is correct?", "English", "Grammar", "easy", ["She has lived in Addis Ababa since 2018.", "She has lived in Addis Ababa since 7 years.", "She live in Addis Ababa since 2018.", "She has live in Addis Ababa for 2018."], 0, "Use since with a starting point in time.", { id: "q_eng", org: "org_aau" }),
  choice("Which bodies are part of the federal government of Ethiopia? Select every correct answer.", "Civics", "Government", "medium", ["House of Peoples' Representatives", "House of Federation", "Crown Council", "Council of Ministers"], [0, 1, 3], "Ethiopia has two federal houses and a Council of Ministers. There is no Crown Council.", { id: "q_civ", org: "org_aau", type: "multiple" }),
  { id: "q_deriv", org: "org_aau", type: "short", stem: "The derivative of x² is", subject: "Mathematics", topic: "Calculus", difficulty: "medium", options: [], correct: [], accepted: ["2x", "2*x"], pairs: [], explanation: "d/dx of x² is 2x.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_hist", org: "org_aau", type: "true_false", stem: "Addis Ababa is the capital city of Ethiopia.", subject: "Geography", topic: "Ethiopia", difficulty: "easy", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: ["true"], accepted: [], pairs: [], explanation: "Addis Ababa is the capital.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_h2o", org: "org_aau", type: "short", stem: "The chemical formula of water is", subject: "Chemistry", topic: "Compounds", difficulty: "easy", options: [], correct: [], accepted: ["H2O", "H₂O"], pairs: [], explanation: "A water molecule is two hydrogen atoms and one oxygen atom.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  choice("Which are primary colours of light? Select every correct answer.", "Physics", "Waves", "medium", ["Red", "Green", "Blue", "Yellow"], [0, 1, 2], "The additive primaries of light are red, green, and blue.", { id: "q_color", org: "org_aau", type: "multiple" }),
  choice("Phishing is best described as", "Information security", "Threats", "easy", ["A fraudulent message that tries to steal credentials", "A hardware firewall", "A daily backup", "A strong password rule"], 0, "Phishing tricks a person into revealing secrets.", { id: "q_phish", org: "org_cbe" }),
  { id: "q_pass", org: "org_cbe", type: "true_false", stem: "A strong password should be shared with a supervisor so the account can be recovered.", subject: "Information security", topic: "Passwords", difficulty: "easy", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: ["false"], accepted: [], pairs: [], explanation: "Passwords are not shared. Use an approved recovery process.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_apt", org: "org_cbe", type: "short", stem: "A printer produces 12 pages a minute. How many pages does it produce in 5 minutes?", subject: "Aptitude", topic: "Arithmetic", difficulty: "easy", options: [], correct: [], accepted: ["60"], pairs: [], explanation: "12 × 5 = 60.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  choice("In a spreadsheet, which function adds a range of numbers?", "Information technology", "Spreadsheets", "easy", ["SUM", "AVG", "COUNT", "LOOKUP"], 0, "SUM adds the numbers in a range.", { id: "q_sum", org: "org_cbe" }),
  { id: "q_2fa", org: "org_cbe", type: "true_false", stem: "Two-factor authentication asks for two different kinds of evidence that you are the account holder.", subject: "Information security", topic: "Authentication", difficulty: "easy", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: ["true"], accepted: [], pairs: [], explanation: "Two factors might be a password and a phone code.", points: 1, mediaUrl: "", mediaKind: "", mediaAlt: "" },
  { id: "q_essay", org: "org_cbe", type: "essay", stem: "A colleague forwards you an email that asks for your core-banking password. In a short paragraph, say what you would do and what you would not do.", subject: "Information security", topic: "Phishing", difficulty: "medium", options: [], correct: [], accepted: [], pairs: [], explanation: "A strong answer refuses the request, does not click links, and reports the message to the bank's security team.", points: 5, mediaUrl: "", mediaKind: "", mediaAlt: "" },
];

const byId = new Map(questions.map((question) => [question.id, question]));

function paperOf(ids: string[]): PaperQuestion[] {
  return ids.map((id) => {
    const question = byId.get(id);
    if (!question) throw new Error(id);
    return {
      id: question.id,
      type: question.type,
      stem: question.stem,
      explanation: question.explanation,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      options: question.options,
      correctOptionIds: question.correct,
      acceptedAnswers: question.accepted,
      pairs: question.pairs,
      mediaUrl: question.mediaUrl,
      mediaKind: question.mediaKind,
      mediaAlt: question.mediaAlt,
      points: question.points,
    };
  });
}

function wrongAnswer(question: SeedQuestion) {
  if (question.type === "true_false") return { selected: [question.correct[0] === "true" ? "false" : "true"], text: "", matching: {}, points: null as number | null, comment: "" };
  if (question.type === "single") {
    const other = question.options.find((option) => !question.correct.includes(option.id));
    return { selected: other ? [other.id] : [], text: "", matching: {}, points: null, comment: "" };
  }
  if (question.type === "multiple") return { selected: question.correct.slice(0, 1), text: "", matching: {}, points: null, comment: "" };
  if (question.type === "matching") {
    const matching: Record<string, string> = {};
    if (question.pairs[0]) matching[question.pairs[0].id] = question.pairs[0].id;
    return { selected: [], text: "", matching, points: null, comment: "" };
  }
  return { selected: [], text: "incorrect", matching: {}, points: null, comment: "" };
}

function rightAnswer(question: SeedQuestion) {
  if (question.type === "short" || question.type === "blank") return { selected: [], text: question.accepted[0] || "", matching: {}, points: null as number | null, comment: "" };
  if (question.type === "matching") {
    const matching: Record<string, string> = {};
    for (const pair of question.pairs) matching[pair.id] = pair.id;
    return { selected: [], text: "", matching, points: null, comment: "" };
  }
  if (question.type === "essay") return { selected: [], text: "", matching: {}, points: null, comment: "" };
  return { selected: question.correct, text: "", matching: {}, points: null, comment: "" };
}

async function sit(
  q: QueryFn,
  input: {
    id: string;
    examId: string;
    candidateId: string;
    submittedAt: string;
    questionIds: string[];
    wrongIds?: string[];
    essay?: { text: string; points: number; comment: string };
    tabSwitches?: number;
    code?: string;
    emailed?: boolean;
  },
) {
  const paper = paperOf(input.questionIds);
  const orders: Record<string, string[]> = {};
  const matchingOrders: Record<string, string[]> = {};
  for (const question of paper) {
    orders[question.id] = question.options.map((option) => option.id);
    matchingOrders[question.id] = question.pairs.map((pair) => pair.id);
  }
  await q(
    `insert into attempts (id, exam_id, candidate_id, status, grading_status, started_at, deadline_at, question_order, option_orders, matching_orders, paper, tab_switch_count, suspicious_count)
     values ($1,$2,$3,'in_progress','auto',$4,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$9)`,
    [input.id, input.examId, input.candidateId, input.submittedAt, JSON.stringify(input.questionIds), JSON.stringify(orders), JSON.stringify(matchingOrders), JSON.stringify(paper), input.tabSwitches || 0],
  );
  const wrong = new Set(input.wrongIds || []);
  for (const question of paper) {
    const seed = byId.get(question.id)!;
    const answer = question.type === "essay" && input.essay
      ? { selected: [], text: input.essay.text, matching: {}, points: input.essay.points, comment: input.essay.comment }
      : wrong.has(question.id) ? wrongAnswer(seed) : rightAnswer(seed);
    await q(
      `insert into answers (attempt_id, question_id, selected_option_ids, text_answer, matching, points_awarded, manual_comment)
       values ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7)`,
      [input.id, question.id, JSON.stringify(answer.selected), answer.text, JSON.stringify(answer.matching), answer.points, answer.comment || ""],
    );
  }
  await gradeAttempt(input.id, q);
  await q(
    `update attempts set status = 'submitted', submitted_at = $2, submit_reason = 'manual', verification_code = $3, result_emailed_at = $4 where id = $1`,
    [input.id, input.submittedAt, input.code ?? null, input.emailed ? input.submittedAt : null],
  );
  if (input.tabSwitches) {
    for (let index = 0; index < input.tabSwitches; index += 1) {
      await q(`insert into proctor_events (id, attempt_id, kind, detail, created_at) values ($1,$2,'tab_switch','Left the exam window',$3)`, [
        crypto.randomUUID(),
        input.id,
        input.submittedAt,
      ]);
    }
  }
}

const WIPE = [
  "audit_logs",
  "notifications",
  "proctor_events",
  "answers",
  "attempts",
  "exam_assignments",
  "exam_questions",
  "exams",
  "questions",
  "group_members",
  "candidate_groups",
  "departments",
  "sessions",
  "users",
  "organizations",
  "exam_categories",
];

async function wipe(q: QueryFn) {
  for (const table of WIPE) await q(`delete from ${table}`);
}

async function runSeed(q: QueryFn, passwords: { admin: string; teach: string; take: string }) {
  const exitEnd = "2026-12-20T15:00:00.000Z";
  const entranceEnd = "2026-12-15T15:00:00.000Z";
  const entranceRelease = defaultReleaseAt(entranceEnd);
  const jobEnd = "2026-10-31T15:00:00.000Z";
  const jobRelease = defaultReleaseAt(jobEnd);

  await q(`insert into organizations (id, name, type, code, city) values
    ('org_aau','Addis Ababa University','university','AAU','Addis Ababa'),
    ('org_bole','Bole Secondary School','school','BOLE','Addis Ababa'),
    ('org_cbe','Commercial Bank of Ethiopia','employer','CBE','Addis Ababa')`);
  await q(`insert into exam_categories (id, code, name_en, name_am, name_om, description_en, sort_order) values
    ('cat_exit','exit','University exit','የዩኒቨርሲቲ መውጫ','Ba''umsa yunivarsiitii','Exit examinations for graduating classes',1),
    ('cat_entrance','entrance','Entrance','መግቢያ','Seensaa','School and university entrance examinations',2),
    ('cat_recruitment','recruitment','Job recruitment','የስራ ቅጥር','Qacarrii hojii','Recruitment tests for employers',3)`);
  await q(
    `insert into users (id, email, password_hash, full_name, role, organization_id, phone, locale) values
     ($1,'admin@smartexam.et',$2,'Selam Ayele','super_admin',null,'+251911000101','en'),
     ($3,'teacher@aau.edu.et',$4,'Hanna Bekele','exam_manager','org_aau','+251911000102','en'),
     ($5,'abel@student.et',$6,'Abel Bekele','candidate','org_aau','+251911000201','en'),
     ($7,'liya@student.et',$6,'ሊያ ታደሰ','candidate','org_aau','+251911000202','am'),
     ($8,'yonas@student.et',$6,'Yonas Alemu','candidate','org_aau','+251911000203','om')`,
    ["usr_admin", passwords.admin, "usr_teacher", passwords.teach, "usr_abel", passwords.take, "usr_liya", "usr_yonas"],
  );
  await q(`insert into departments (id, organization_id, name, kind) values
    ('dep_cs','org_aau','Computer Science','department'),
    ('dep_adm','org_aau','Undergraduate admissions','department'),
    ('dep_bole','org_bole','Natural science','department'),
    ('dep_it','org_cbe','Junior IT Officer','position')`);
  await q(`insert into candidate_groups (id, organization_id, department_id, name) values
    ('grp_exit','org_aau','dep_cs','CS graduating class'),
    ('grp_entrance','org_aau','dep_adm','Entrance applicants'),
    ('grp_job','org_cbe','dep_it','IT Officer applicants')`);
  for (const group of ["grp_exit", "grp_entrance", "grp_job"]) {
    for (const user of ["usr_abel", "usr_liya", "usr_yonas"]) {
      await q(`insert into group_members (group_id, user_id) values ($1,$2)`, [group, user]);
    }
  }
  for (const question of questions) {
    await q(
      `insert into questions (id, organization_id, type, stem, explanation, subject, topic, difficulty, options, correct_option_ids, accepted_answers, pairs, media_url, media_kind, media_alt, points, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,'usr_admin')`,
      [question.id, question.org, question.type, question.stem, question.explanation, question.subject, question.topic, question.difficulty, JSON.stringify(question.options), JSON.stringify(question.correct), JSON.stringify(question.accepted), JSON.stringify(question.pairs), question.mediaUrl, question.mediaKind, question.mediaAlt, question.points],
    );
  }
  await q(
    `insert into questions (id, organization_id, type, stem, explanation, subject, topic, difficulty, options, correct_option_ids, accepted_answers, pairs, points, created_by, status)
     values ('q_draft_fed','org_aau','single',$1,$2,'Civic education','Federalism','medium',$3::jsonb,'["a"]'::jsonb,'[]'::jsonb,'[]'::jsonb,1,'usr_teacher','draft')`,
    [
      "Which chamber of the Ethiopian parliament is the House of Peoples' Representatives?",
      "Draft from the question generator. Publish it before it can be placed on an exam.",
      JSON.stringify([
        { id: "a", text: "The lower house" },
        { id: "b", text: "The council of ministers" },
        { id: "c", text: "The supreme court" },
        { id: "d", text: "A regional council" },
      ]),
    ],
  );

  const exams = [
    {
      id: "ex_exit",
      org: "org_aau",
      category: "cat_exit",
      department: "dep_cs",
      title: "Computer Science Exit Examination",
      description: "Sample exit paper for the computer science graduating class. Results are instant: a candidate sees the mark on submit.",
      instructions: "You have one sitting. The clock keeps running if you refresh. Camera snapshots and fullscreen are requested. Your mark appears as soon as you submit.",
      duration: 12,
      start: "2026-11-20T15:00:00.000Z",
      end: exitEnd,
      pass: 50,
      release: "instant",
      releaseAt: null as string | null,
      mode: "manual",
      count: 6,
      webcam: true,
      fullscreen: true,
      questions: ["q_sql", "q_js", "q_unit", "q_tri", "q_au", "q_match"],
      group: "grp_exit",
    },
    {
      id: "ex_entrance",
      org: "org_aau",
      category: "cat_entrance",
      department: "dep_adm",
      title: "Undergraduate Entrance Sample",
      description: "Each candidate receives 5 questions drawn from a pool of 10. Results stay hidden until 14 days after the window closes.",
      instructions: "Your questions are drawn from a shared pool, so another candidate may see a different set. You will not see a mark after you submit. Results open on the published date, and an email is sent then.",
      duration: 10,
      start: "2026-11-01T15:00:00.000Z",
      end: entranceEnd,
      pass: 50,
      release: "scheduled",
      releaseAt: entranceRelease,
      mode: "random_each",
      count: 5,
      webcam: false,
      fullscreen: true,
      questions: ["q_m1", "q_m2", "q_bio", "q_phy", "q_eng", "q_civ", "q_deriv", "q_hist", "q_h2o", "q_color"],
      group: "grp_entrance",
    },
    {
      id: "ex_job",
      org: "org_cbe",
      category: "cat_recruitment",
      department: "dep_it",
      title: "Junior IT Officer Recruitment Test",
      description: "Recruitment paper with an essay. The window has closed. Results were scheduled for 14 days after the end date, and that date has passed.",
      instructions: "Objective questions are marked automatically. The essay is marked by a reviewer. Candidates see the final mark only on the scheduled release date.",
      duration: 20,
      start: "2026-10-01T15:00:00.000Z",
      end: jobEnd,
      pass: 60,
      release: "scheduled",
      releaseAt: jobRelease,
      mode: "manual",
      count: 6,
      webcam: false,
      fullscreen: true,
      questions: ["q_phish", "q_pass", "q_apt", "q_sum", "q_2fa", "q_essay"],
      group: "grp_job",
    },
  ];

  for (const exam of exams) {
    await q(
      `insert into exams (id, organization_id, category_id, department_id, title, description, instructions, duration_minutes, start_at, end_at, pass_mark, shuffle_questions, shuffle_options, result_release, result_release_at, release_overridden, selection_mode, random_count, proctor_webcam, proctor_fullscreen, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,true,$12,$13,false,$14,$15,$16,$17,'published','usr_admin')`,
      [exam.id, exam.org, exam.category, exam.department, exam.title, exam.description, exam.instructions, exam.duration, exam.start, exam.end, exam.pass, exam.release, exam.releaseAt, exam.mode, exam.count, exam.webcam, exam.fullscreen],
    );
    for (let index = 0; index < exam.questions.length; index += 1) {
      const question = byId.get(exam.questions[index])!;
      await q(`insert into exam_questions (exam_id, question_id, sort_order, points) values ($1,$2,$3,$4)`, [exam.id, question.id, index, question.points]);
    }
    await q(`insert into exam_assignments (id, exam_id, assignee_type, assignee_id) values ($1,$2,'group',$3)`, [crypto.randomUUID(), exam.id, exam.group]);
  }

  await sit(q, { id: "att_liya_exit", examId: "ex_exit", candidateId: "usr_liya", submittedAt: "2026-11-22T10:00:00.000Z", questionIds: exams[0].questions, wrongIds: ["q_sql"], code: "LYAEXIT2K7P", emailed: true });
  await sit(q, { id: "att_yonas_exit", examId: "ex_exit", candidateId: "usr_yonas", submittedAt: "2026-11-21T09:30:00.000Z", questionIds: exams[0].questions, wrongIds: ["q_sql", "q_js", "q_tri", "q_match"], tabSwitches: 2, code: "YNASEXIT4R", emailed: true });
  await sit(q, { id: "att_liya_ent", examId: "ex_entrance", candidateId: "usr_liya", submittedAt: "2026-11-18T08:00:00.000Z", questionIds: ["q_m1", "q_bio", "q_eng", "q_deriv", "q_h2o"] });
  await sit(q, { id: "att_yonas_ent", examId: "ex_entrance", candidateId: "usr_yonas", submittedAt: "2026-11-18T11:00:00.000Z", questionIds: ["q_m2", "q_phy", "q_civ", "q_hist", "q_color"], wrongIds: ["q_phy", "q_civ", "q_color"] });
  await sit(q, {
    id: "att_liya_job",
    examId: "ex_job",
    candidateId: "usr_liya",
    submittedAt: "2026-10-20T08:00:00.000Z",
    questionIds: exams[2].questions,
    essay: { text: "I would not send the password or open the link. I would report the email to the security team and warn my colleague.", points: 4, comment: "Clear refusal and a report path. Could name the internal channel." },
    code: "LYAJOB7KQ2",
    emailed: true,
  });
  await sit(q, {
    id: "att_yonas_job",
    examId: "ex_job",
    candidateId: "usr_yonas",
    submittedAt: "2026-10-21T08:00:00.000Z",
    questionIds: exams[2].questions,
    wrongIds: ["q_phish", "q_apt", "q_2fa"],
    essay: { text: "I might ask my supervisor if the mail is real before typing the password.", points: 2, comment: "Does not clearly refuse, and checking with a supervisor is not enough." },
    code: "YNAJOB8HM3",
    emailed: true,
  });

  const people = [
    { id: "usr_abel", name: "Abel Bekele", email: "abel@student.et", locale: "en" as Locale },
    { id: "usr_liya", name: "ሊያ ታደሰ", email: "liya@student.et", locale: "am" as Locale },
    { id: "usr_yonas", name: "Yonas Alemu", email: "yonas@student.et", locale: "om" as Locale },
  ];
  const orgName: Record<string, string> = { org_aau: "Addis Ababa University", org_cbe: "Commercial Bank of Ethiopia" };
  for (const exam of exams) {
    for (const person of people) {
      const release = exam.release === "instant" ? "You will see your mark as soon as you submit." : `Your mark stays hidden until ${exam.releaseAt}.`;
      const message = scheduleMessage(person.locale, {
        name: person.name,
        exam: exam.title,
        org: orgName[exam.org],
        start: exam.start,
        end: exam.end,
        duration: exam.duration,
        pass: exam.pass,
        release,
      });
      await q(
        `insert into notifications (id, user_id, to_email, subject, body, kind, ref_id, status) values ($1,$2,$3,$4,$5,'schedule',$6,'queued')`,
        [crypto.randomUUID(), person.id, person.email, message.subject, message.body, exam.id],
      );
    }
  }

  const resultMails = [
    ["att_liya_exit", "usr_liya", "ሊያ ታደሰ", "liya@student.et", "am", "Computer Science Exit Examination", "LYAEXIT2K7P"],
    ["att_yonas_exit", "usr_yonas", "Yonas Alemu", "yonas@student.et", "om", "Computer Science Exit Examination", "YNASEXIT4R"],
    ["att_liya_job", "usr_liya", "ሊያ ታደሰ", "liya@student.et", "am", "Junior IT Officer Recruitment Test", "LYAJOB7KQ2"],
    ["att_yonas_job", "usr_yonas", "Yonas Alemu", "yonas@student.et", "om", "Junior IT Officer Recruitment Test", "YNAJOB8HM3"],
  ] as const;
  for (const [attemptId, userId, name, email, locale, title, code] of resultMails) {
    const scored = await q(`select score, max_score, percentage, passed from attempts where id = $1`, [attemptId]);
    const row = scored[0];
    const message = resultMessage(locale, {
      name,
      exam: title,
      score: String(num(row?.score)),
      max: String(num(row?.max_score)),
      percentage: String(num(row?.percentage)),
      passed: row?.passed === true || row?.passed === "t" || row?.passed === "true",
      code,
      attemptId,
    });
    await q(
      `insert into notifications (id, user_id, to_email, subject, body, kind, ref_id, status) values ($1,$2,$3,$4,$5,'result',$6,'queued')`,
      [crypto.randomUUID(), userId, email, message.subject, message.body, attemptId],
    );
  }

  await q(
    `insert into audit_logs (id, actor_id, actor_name, organization_id, action, entity, entity_id, detail) values
     ($1,'usr_admin','Selam Ayele',null,'publish','exam','ex_exit','Computer Science Exit Examination · instant'),
     ($2,'usr_admin','Selam Ayele','org_aau','publish','exam','ex_entrance','Undergraduate Entrance Sample · scheduled'),
     ($3,'usr_admin','Selam Ayele','org_cbe','publish','exam','ex_job','Junior IT Officer Recruitment Test · scheduled')`,
    [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
  );
}

async function passwords() {
  const [admin, teach, take] = await Promise.all([
    hashPassword("SmartExam#Admin1"),
    hashPassword("SmartExam#Teach1"),
    hashPassword("SmartExam#Take1"),
  ]);
  return { admin, teach, take };
}

export async function seedIfEmpty(options?: { force?: boolean }) {
  const remote = Boolean(process.env.NETLIFY_DB_URL || process.env.DATABASE_URL);
  if (remote && process.env.SEED_DEMO !== "true" && !options?.force) return;
  const existing = await query(`select count(*) as n from users`);
  if (num(existing[0]?.n) > 0) return;
  const hashes = await passwords();
  await tx(async (q) => {
    const again = await q(`select count(*) as n from users`);
    if (num(again[0]?.n) > 0) return;
    await runSeed(q, hashes);
  });
}

export async function reseed() {
  const hashes = await passwords();
  await tx(async (q) => {
    await wipe(q);
    await runSeed(q, hashes);
  });
}
