"use server";

import { redirect } from "next/navigation";
import { aiConfigured, generateQuestionDrafts, pdfToText } from "@/lib/ai";
import {
  acceptPaper,
  acceptSuggestedGrade,
  acceptTranslation,
  applyDifficulty,
  keepProctorNote,
  proposeFeedback,
  proposeGrade,
  proposePaper,
  proposeProctorSummary,
  proposeQuality,
  proposeTranslation,
  publishFeedback,
  setSuggestionStatus,
} from "@/lib/assist";
import { clearSession, requireUser } from "@/lib/auth";
import { parseTabular } from "@/lib/csv";
import { emailLogins, examLoginTargets, importCandidates, resetAndEmailLogins, type CredentialRow } from "@/lib/credentials";
import {
  assignExam,
  deleteDepartment,
  deleteExam,
  deleteQuestion,
  gradeEssays,
  importQuestionRows,
  releaseExamNow,
  resetAttemptSession,
  setExamStatus,
  startAttempt,
  getExam,
  getResultView,
  restoreDemo,
  saveCategory,
  saveDepartment,
  saveExam,
  saveGroup,
  saveOrganization,
  publishQuestion,
  saveDraftQuestions,
  saveQuestion,
  saveUser,
  unassignExam,
  type ExamInput,
  type QuestionInput,
} from "@/lib/domain";
import { fromAddisInput } from "@/lib/format";
import type { ExamStatus, QuestionType, ReleaseMode, SelectionMode } from "@/lib/types";

function go(path: string, error?: string): never {
  redirect(error ? `${path}${path.includes("?") ? "&" : "?"}error=${error}` : path);
}

export async function saveOrgAction(formData: FormData) {
  const actor = await requireUser(["super_admin"]);
  const result = await saveOrganization(actor, {
    id: String(formData.get("id") || "") || undefined,
    name: String(formData.get("name") || ""),
    type: String(formData.get("type") || ""),
    code: String(formData.get("code") || ""),
    city: String(formData.get("city") || ""),
  });
  go("/organizations", result.ok ? undefined : result.error);
}

export async function saveDepartmentAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await saveDepartment(actor, {
    id: String(formData.get("id") || "") || undefined,
    organizationId: String(formData.get("organizationId") || actor.organizationId || ""),
    name: String(formData.get("name") || ""),
    kind: String(formData.get("kind") || "department"),
  });
  go("/departments", result.ok ? undefined : result.error);
}

export async function deleteDepartmentAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await deleteDepartment(actor, String(formData.get("id") || ""));
  go("/departments", result.ok ? undefined : result.error);
}

export async function saveCategoryAction(formData: FormData) {
  const actor = await requireUser(["super_admin"]);
  const result = await saveCategory(actor, {
    id: String(formData.get("id") || "") || undefined,
    code: String(formData.get("code") || ""),
    nameEn: String(formData.get("nameEn") || ""),
    nameAm: String(formData.get("nameAm") || ""),
    nameOm: String(formData.get("nameOm") || ""),
    descriptionEn: String(formData.get("descriptionEn") || ""),
  });
  go("/categories", result.ok ? undefined : result.error);
}

export async function saveUserAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await saveUser(actor, {
    id: String(formData.get("id") || "") || undefined,
    email: String(formData.get("email") || ""),
    fullName: String(formData.get("fullName") || ""),
    role: String(formData.get("role") || "candidate"),
    organizationId: String(formData.get("organizationId") || "") || null,
    phone: String(formData.get("phone") || ""),
    password: String(formData.get("password") || "") || undefined,
    active: formData.get("active") === "on",
  });
  go("/users", result.ok ? undefined : result.error);
}

export async function saveGroupAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await saveGroup(actor, {
    id: String(formData.get("id") || "") || undefined,
    organizationId: String(formData.get("organizationId") || actor.organizationId || ""),
    name: String(formData.get("name") || ""),
    departmentId: String(formData.get("departmentId") || "") || null,
    memberIds: formData.getAll("member").map(String),
  });
  if (!result.ok) go(`/groups${formData.get("id") ? `/${formData.get("id")}` : ""}`, result.error);
  redirect(`/groups/${result.id}`);
}

function optionFromForm(formData: FormData) {
  const options = [];
  for (let index = 0; index < 6; index += 1) {
    const text = String(formData.get(`option_${index}`) || "").trim();
    const id = String(formData.get(`option_id_${index}`) || "") || crypto.randomUUID();
    if (text) options.push({ id, text });
  }
  return options;
}

export async function saveQuestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const type = String(formData.get("type") || "single") as QuestionType;
  const options = optionFromForm(formData);
  const correct = formData.getAll("correct").map(String).map((value) => (/^\d+$/.test(value) ? options[Number(value)]?.id : value)).filter((value): value is string => !!value);
  const pairs = [];
  for (let index = 0; index < 8; index += 1) {
    const left = String(formData.get(`left_${index}`) || "").trim();
    const right = String(formData.get(`right_${index}`) || "").trim();
    const id = String(formData.get(`pair_id_${index}`) || "") || crypto.randomUUID();
    if (left && right) pairs.push({ id, left, right });
  }
  const file = formData.get("mediaFile");
  let mediaUrl = String(formData.get("mediaUrl") || "");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    mediaUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  }
  const input: QuestionInput = {
    id: String(formData.get("id") || "") || undefined,
    organizationId: String(formData.get("organizationId") || actor.organizationId || ""),
    type,
    stem: String(formData.get("stem") || ""),
    explanation: String(formData.get("explanation") || ""),
    subject: String(formData.get("subject") || ""),
    topic: String(formData.get("topic") || ""),
    difficulty: String(formData.get("difficulty") || "medium"),
    options,
    correctOptionIds: type === "true_false" ? [String(formData.get("tf") || "true")] : correct,
    acceptedAnswers: String(formData.get("accepted") || "").split("\n"),
    pairs,
    mediaUrl,
    mediaKind: String(formData.get("mediaKind") || "image"),
    mediaAlt: String(formData.get("mediaAlt") || ""),
    points: Number(formData.get("points") || 1),
  };
  const result = await saveQuestion(actor, input);
  if (!result.ok) go(input.id ? `/questions/${input.id}` : "/questions/new", result.error);
  redirect(`/questions/${result.id}`);
}

export async function deleteQuestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await deleteQuestion(actor, String(formData.get("id") || ""));
  go("/questions", result.ok ? undefined : result.error);
}

export async function importQuestionsAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const organizationId = String(formData.get("organizationId") || actor.organizationId || "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) go("/questions/import", "file");
  const table = await parseTabular(file.name, Buffer.from(await file.arrayBuffer()));
  const result = await importQuestionRows(actor, organizationId, table);
  if (!result.ok) go("/questions/import", result.error);
  redirect(`/questions/import?imported=${result.imported}&skipped=${result.skipped}`);
}

export async function saveExamAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const selectionMode = String(formData.get("selectionMode") || "manual") as SelectionMode;
  const input: ExamInput = {
    id: String(formData.get("id") || "") || undefined,
    organizationId: String(formData.get("organizationId") || actor.organizationId || ""),
    categoryId: String(formData.get("categoryId") || ""),
    departmentId: String(formData.get("departmentId") || "") || null,
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    instructions: String(formData.get("instructions") || ""),
    durationMinutes: Number(formData.get("durationMinutes") || 0),
    startAt: fromAddisInput(String(formData.get("startAt") || "")),
    endAt: fromAddisInput(String(formData.get("endAt") || "")),
    passMark: Number(formData.get("passMark") || 50),
    shuffleQuestions: formData.get("shuffleQuestions") === "on",
    shuffleOptions: formData.get("shuffleOptions") === "on",
    resultRelease: (formData.get("resultRelease") === "scheduled" ? "scheduled" : "instant") as ReleaseMode,
    resultReleaseAt: fromAddisInput(String(formData.get("resultReleaseAt") || "")),
    releaseOverridden: formData.get("releaseOverridden") === "1",
    selectionMode,
    randomCount: Number(formData.get("randomCount") || 0),
    questionIds: String(formData.get("questionIds") || "").split(",").map((id) => id.trim()).filter(Boolean),
    proctorWebcam: formData.get("proctorWebcam") === "on",
    proctorFullscreen: formData.get("proctorFullscreen") === "on",
    status: (String(formData.get("status") || "draft") as ExamStatus),
  };
  const result = await saveExam(actor, input);
  if (!result.ok) go(input.id ? `/exams/${input.id}` : "/exams/new", result.error);
  redirect(`/exams/${result.id}?${input.id ? "saved" : "created"}=1`);
}

export async function deleteExamAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await deleteExam(actor, String(formData.get("id") || ""));
  go("/exams", result.ok ? undefined : result.error);
}

export async function releaseNowAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("id") || "");
  const result = await releaseExamNow(actor, id);
  go(`/exams/${id}`, result.ok ? undefined : result.error);
}

export async function assignAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await assignExam(actor, examId, String(formData.get("assigneeType") || ""), String(formData.get("assigneeId") || ""));
  go(`/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function unassignAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await unassignExam(actor, String(formData.get("id") || ""));
  go(`/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function resetSessionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await resetAttemptSession(actor, String(formData.get("id") || ""));
  go(`/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function gradeAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const attemptId = String(formData.get("attemptId") || "");
  const ids = formData.getAll("essayId").map(String);
  const grades = ids.map((questionId) => ({
    questionId,
    points: Number(formData.get(`points_${questionId}`) || 0),
    comment: String(formData.get(`comment_${questionId}`) || ""),
  }));
  const result = await gradeEssays(actor, attemptId, grades);
  if (result.ok) {
    for (const grade of grades) {
      const suggestionId = String(formData.get(`suggestion_${grade.questionId}`) || "");
      if (suggestionId) await acceptSuggestedGrade(actor, attemptId, grade.questionId, grade.points, grade.comment, suggestionId);
    }
  }
  go(`/grade/${attemptId}`, result.ok ? undefined : result.error);
}

export async function suggestGradeAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const attemptId = String(formData.get("attemptId") || "");
  const questionId = String(formData.get("questionId") || "");
  const view = await getResultView(actor, attemptId);
  const item = view?.review.find((row) => row.question.id === questionId);
  if (!view?.staff || !item) go(`/grade/${attemptId}`, "forbidden");
  const result = await proposeGrade(actor, {
    organizationId: view.exam.organizationId,
    attemptId,
    questionId,
    stem: item.question.stem,
    answer: item.answer?.textAnswer || "",
    explanation: item.question.explanation,
    accepted: item.question.acceptedAnswers,
    max: item.question.points,
  });
  go(`/grade/${attemptId}`, result.ok ? undefined : result.error);
}

export async function checkQuestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("id") || "");
  const result = await proposeQuality(actor, id);
  go(`/questions/${id}`, result.ok ? undefined : result.error);
}

export async function applyDifficultyAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("questionId") || "");
  const result = await applyDifficulty(actor, String(formData.get("suggestionId") || ""));
  go(`/questions/${id}`, result.ok ? undefined : result.error);
}

export async function translateQuestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("id") || "");
  const locale = String(formData.get("locale") || "am");
  const target = locale === "en" || locale === "om" ? locale : "am";
  const result = await proposeTranslation(actor, id, target);
  go(`/questions/${id}`, result.ok ? undefined : result.error);
}

export async function acceptTranslationAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await acceptTranslation(actor, String(formData.get("suggestionId") || ""));
  if (!result.ok) go(`/questions/${String(formData.get("id") || "")}`, result.error);
  redirect(`/questions/${result.id}`);
}

export async function dismissSuggestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const result = await setSuggestionStatus(actor, String(formData.get("suggestionId") || ""), "dismissed");
  const back = String(formData.get("back") || "/dashboard");
  go(back.startsWith("/") ? back : "/dashboard", result.ok ? undefined : result.error);
}

export async function suggestFeedbackAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const candidateId = String(formData.get("candidateId") || "");
  const attemptId = String(formData.get("attemptId") || "");
  const view = await getResultView(actor, attemptId);
  if (!view?.staff || !view.showScore) go(`/reports/candidates/${candidateId}`, "forbidden");
  const topics = (view.review || []).reduce<Map<string, { earned: number; possible: number }>>((map, item) => {
    const bucket = map.get(item.question.topic) ?? { earned: 0, possible: 0 };
    bucket.possible += item.question.points;
    bucket.earned += item.answer?.pointsAwarded ?? 0;
    map.set(item.question.topic, bucket);
    return map;
  }, new Map());
  const result = await proposeFeedback(actor, {
    organizationId: view.exam.organizationId,
    attemptId,
    exam: view.exam.title,
    percentage: view.attempt.percentage,
    topics: [...topics.entries()].map(([topic, value]) => ({ topic, percent: value.possible ? Math.round((value.earned / value.possible) * 100) : 0 })),
    misses: view.review.filter((item) => item.answer && item.answer.isCorrect === false).map((item) => item.question.stem).slice(0, 6),
  });
  go(`/reports/candidates/${candidateId}`, result.ok ? undefined : result.error);
}

export async function publishFeedbackAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const candidateId = String(formData.get("candidateId") || "");
  const result = await publishFeedback(actor, String(formData.get("suggestionId") || ""), String(formData.get("feedback") || ""), String(formData.get("recommendations") || ""));
  go(`/reports/candidates/${candidateId}`, result.ok ? undefined : result.error);
}

export async function proposePaperAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const topics = formData.getAll("topic").map(String);
  const difficulties = formData.getAll("difficulty").map(String);
  const counts = formData.getAll("count").map((value) => Number(value) || 0);
  const blueprint = topics.map((topic, index) => ({ topic, difficulty: difficulties[index] || "", count: counts[index] || 0 }));
  const result = await proposePaper(actor, examId, blueprint);
  go(`/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function acceptPaperAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await acceptPaper(actor, String(formData.get("suggestionId") || ""));
  go(`/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function summarizeProctorAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await proposeProctorSummary(actor, examId);
  go(`/reports/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function keepProctorAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const examId = String(formData.get("examId") || "");
  const result = await keepProctorNote(actor, String(formData.get("suggestionId") || ""), String(formData.get("summary") || ""));
  go(`/reports/exams/${examId}`, result.ok ? undefined : result.error);
}

export async function startExamAction(formData: FormData) {
  const actor = await requireUser(["candidate"]);
  const examId = String(formData.get("examId") || "");
  const exam = await getExam(examId);
  if (exam?.proctorWebcam && formData.get("consent") !== "on") redirect(`/take/${examId}?error=consent`);
  const result = await startAttempt(actor, examId);
  if (!result.ok) redirect(`/take/${examId}?error=${result.error}`);
  redirect(`/attempt/${result.attemptId}`);
}

export async function publishQuestionAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("id") || "");
  const result = await publishQuestion(actor, id);
  go(`/questions/${id}`, result.ok ? undefined : result.error);
}

export async function generateQuestionsAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const organizationId = actor.role === "exam_manager" ? actor.organizationId || "" : String(formData.get("organizationId") || "");
  if (!aiConfigured()) go("/questions/generate", "ai_disabled");
  let source = String(formData.get("source") || "");
  const file = formData.get("pdf");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8_000_000) go("/questions/generate", "validation");
    try {
      source = `${await pdfToText(new Uint8Array(await file.arrayBuffer()))}\n${source}`.slice(0, 12000);
    } catch {
      go("/questions/generate", "validation");
    }
  }
  const topic = String(formData.get("topic") || "").trim();
  const result = await generateQuestionDrafts({
    topic,
    subject: String(formData.get("subject") || "").trim() || topic,
    difficulty: String(formData.get("difficulty") || "medium"),
    count: Number(formData.get("count") || 5),
    type: String(formData.get("type") || "single"),
    source,
  });
  if (!result.ok) go("/questions/generate", result.error);
  const saved = await saveDraftQuestions(actor, {
    organizationId,
    subject: String(formData.get("subject") || topic),
    topic,
    difficulty: String(formData.get("difficulty") || "medium"),
    drafts: result.questions,
  });
  if (!saved.ok) go("/questions/generate", saved.error);
  redirect(`/questions/generate?made=${saved.count}`);
}

export async function restoreAction() {
  const actor = await requireUser(["super_admin"]);
  const result = await restoreDemo(actor);
  if (!result.ok) go("/dashboard", result.error);
  await clearSession();
  redirect("/login?notice=restored");
}

export type ImportCandidatesState = {
  error: string;
  rows: CredentialRow[];
  examId: string;
};

export async function importCandidatesAction(_prev: ImportCandidatesState, formData: FormData): Promise<ImportCandidatesState> {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const empty = { rows: [], examId: "" };
  const organizationId = String(formData.get("organizationId") || actor.organizationId || "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ...empty, error: "file" };
  if (file.size > 2 * 1024 * 1024) return { ...empty, error: "file" };
  let table: string[][];
  try {
    table = await parseTabular(file.name, Buffer.from(await file.arrayBuffer()));
  } catch {
    return { ...empty, error: "file" };
  }
  table = table.filter((row) => row.some((cell) => String(cell || "").trim()));
  const result = await importCandidates(actor, {
    organizationId,
    groupId: String(formData.get("groupId") || ""),
    newGroupName: String(formData.get("newGroupName") || ""),
    examId: String(formData.get("examId") || ""),
    resetExisting: formData.get("resetExisting") === "on",
    table,
  });
  if (!result.ok) return { ...empty, error: result.error };
  return { error: "", rows: result.rows, examId: result.examId };
}

export async function emailLoginsAction(items: { userId: string; password: string }[], examId: string) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  return emailLogins(actor, Array.isArray(items) ? items.map((item) => ({ userId: String(item.userId), password: String(item.password || "") })) : [], String(examId || ""));
}

export async function resetAndEmailAction(userIds: string[], examId: string) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  return resetAndEmailLogins(actor, Array.isArray(userIds) ? userIds.map(String) : [], String(examId || ""));
}

export async function examLoginTargetsAction(examId: string) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  return (await examLoginTargets(actor, String(examId || ""))) ?? [];
}

export async function setExamStatusAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as ExamStatus;
  const result = await setExamStatus(actor, id, status);
  if (!result.ok) go(`/exams/${id}`, result.error);
  redirect(`/exams/${id}?status=${status}`);
}
