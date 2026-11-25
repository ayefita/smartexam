import type { Attempt, Exam } from "./types";

export function examWindow(
  exam: Pick<Exam, "startAt" | "endAt" | "status">,
  now = new Date(),
): "upcoming" | "open" | "closed" | "draft" {
  if (exam.status === "draft") return "draft";
  if (exam.status === "closed") return "closed";
  const t = now.getTime();
  if (exam.startAt && t < new Date(exam.startAt).getTime()) return "upcoming";
  if (exam.endAt && t > new Date(exam.endAt).getTime()) return "closed";
  return "open";
}

/** Fourteen days, the default wait after an exam window closes. */
export const RELEASE_DELAY_MS = 14 * 24 * 60 * 60 * 1000;

export function defaultReleaseAt(endAt: string | null, now = new Date()) {
  const base = endAt ? new Date(endAt).getTime() : now.getTime();
  return new Date(base + RELEASE_DELAY_MS).toISOString();
}

export function isFinalized(attempt: Pick<Attempt, "status" | "gradingStatus">) {
  return attempt.status === "submitted" && attempt.gradingStatus === "finalized";
}

/**
 * Candidates see a mark only when the paper is fully marked and the exam's
 * release rule says so. Instant shows it on submit. Scheduled shows it at
 * resultReleaseAt, which defaults to 14 days after the exam end and can be
 * moved or brought forward by an exam manager.
 */
export function candidateCanSeeScore(
  exam: Pick<Exam, "resultRelease" | "resultReleaseAt">,
  attempt: Pick<Attempt, "status" | "gradingStatus">,
  now = new Date(),
) {
  if (!isFinalized(attempt)) return false;
  if (exam.resultRelease === "instant") return true;
  if (!exam.resultReleaseAt) return false;
  return now.getTime() >= new Date(exam.resultReleaseAt).getTime();
}

export type ResultMessage = "visible" | "pending_review" | "pending_release" | "pending_both";

export function candidateResultState(
  exam: Pick<Exam, "resultRelease" | "resultReleaseAt">,
  attempt: Pick<Attempt, "status" | "gradingStatus">,
  now = new Date(),
): ResultMessage {
  if (attempt.status !== "submitted") return "pending_review";
  const released =
    exam.resultRelease === "instant" ||
    (!!exam.resultReleaseAt && now.getTime() >= new Date(exam.resultReleaseAt).getTime());
  const finalized = attempt.gradingStatus === "finalized";
  if (finalized && released) return "visible";
  if (!finalized && !released) return "pending_both";
  if (!finalized) return "pending_review";
  return "pending_release";
}
