"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminSetPassword } from "@/lib/credentials";
import { importQuestionRows } from "@/lib/domain";
import { docxText, parsePaper, pdfLines, type ParsedQuestion } from "@/lib/paper-parse";

export type PaperState = { error?: string; fileName?: string; questions?: ParsedQuestion[] };

/** Step 1: read the PDF or Word file and show what we found, without saving anything. */
export async function readPaperAction(_prev: PaperState, formData: FormData): Promise<PaperState> {
  await requireUser(["super_admin", "exam_manager"]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "file" };
  if (file.size > 15 * 1024 * 1024) return { error: "file_big" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let text = "";
  try {
    if (name.endsWith(".pdf")) text = await pdfLines(bytes);
    else if (name.endsWith(".docx")) text = await docxText(bytes);
    else if (name.endsWith(".txt")) text = new TextDecoder().decode(bytes);
    else return { error: "paper_type" };
  } catch {
    return { error: "paper_read" };
  }
  const questions = parsePaper(text);
  if (!questions.length) return { error: "paper_empty", fileName: file.name };
  return { fileName: file.name, questions: questions.slice(0, 500) };
}

/** Step 2: save the questions the user checked and fixed. */
export async function savePaperAction(formData: FormData) {
  const actor = await requireUser(["super_admin", "exam_manager"]);
  const organizationId = String(formData.get("organizationId") || actor.organizationId || "");
  let items: { stem: string; options: string[]; answer: string; difficulty: string }[] = [];
  try {
    items = JSON.parse(String(formData.get("questions") || "[]"));
  } catch {
    redirect("/questions/import?error=validation");
  }
  const subject = String(formData.get("subject") || "").trim() || "General";
  const topic = String(formData.get("topic") || "").trim();
  const points = Math.max(1, Math.min(20, Number(formData.get("points") || 1)));
  const header = ["stem", "type", "subject", "topic", "difficulty", "points", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "correct"];
  const rows = items
    .filter((item) => item.stem?.trim() && Array.isArray(item.options) && item.options.filter(Boolean).length >= 2 && item.answer)
    .map((item) => {
      const options = item.options.slice(0, 6).map((option) => String(option || "").trim());
      while (options.length < 6) options.push("");
      const difficulty = ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium";
      return [item.stem.trim(), "single", subject, topic, difficulty, String(points), ...options, item.answer.toLowerCase()];
    });
  if (!rows.length) redirect("/questions/import?error=paper_empty");
  const result = await importQuestionRows(actor, organizationId, [header, ...rows]);
  if (!result.ok) redirect(`/questions/import?error=${result.error}`);
  redirect(`/questions/import?imported=${result.imported}&skipped=${result.skipped + (items.length - rows.length)}`);
}

/** Super admin: set a new password for any account. */
export async function adminSetPasswordAction(formData: FormData) {
  const actor = await requireUser(["super_admin"]);
  const result = await adminSetPassword(actor, String(formData.get("userId") || ""), String(formData.get("password") || ""), formData.get("mustChange") === "on");
  redirect(result.ok ? "/users?notice=password_set" : `/users?error=${result.error}`);
}
