import { query } from "./db";
import { appOrigin } from "./format";
import { sendEmail } from "./messaging";
import type { Locale } from "./types";

type Mail = {
  scheduleSubject: string;
  scheduleBody: string;
  resultSubject: string;
  resultBody: string;
  instant: string;
  scheduled: string;
  passed: string;
  failed: string;
  openWindow: string;
  closeWindow: string;
};

const mail: Record<Locale, Mail> = {
  en: {
    scheduleSubject: "SmartExam: {exam} is scheduled",
    scheduleBody:
      "Hello {name},\n\nYou are registered for \"{exam}\" at {org}.\nOpens: {start}\nCloses: {end}\nTime allowed: {duration} minutes\nPass mark: {pass}%\nResults: {release}\n\nSign in: {link}\n\nSmart Online Examination System",
    resultSubject: "SmartExam: your result for {exam}",
    resultBody:
      "Hello {name},\n\nYour result for \"{exam}\" is now available.\nScore: {score} / {max} ({percentage}%)\nStatus: {status}\nVerification code: {code}\n\nOpen the result slip: {link}\n\nSmart Online Examination System",
    instant: "You will see your mark as soon as you submit.",
    scheduled: "Your mark stays hidden until {date} (Addis Ababa time). We will email you then.",
    passed: "Passed",
    failed: "Not passed",
    openWindow: "Open now",
    closeWindow: "No closing time",
  },
  am: {
    scheduleSubject: "SmartExam: {exam} ተይዟል",
    scheduleBody:
      "ሰላም {name}፣\n\nለ\"{exam}\" በ{org} ተመዝግበዋል።\nመጀመሪያ: {start}\nመጨረሻ: {end}\nየተፈቀደ ጊዜ: {duration} ደቂቃ\nየማለፊያ ነጥብ: {pass}%\nውጤት: {release}\n\nይግቡ: {link}\n\nSmart Online Examination System",
    resultSubject: "SmartExam: የ{exam} ውጤትዎ",
    resultBody:
      "ሰላም {name}፣\n\nየ\"{exam}\" ውጤትዎ ዝግጁ ነው።\nነጥብ: {score} / {max} ({percentage}%)\nሁኔታ: {status}\nየማረጋገጫ ኮድ: {code}\n\nውጤቱን ይክፈቱ: {link}\n\nSmart Online Examination System",
    instant: "ልክ ሲያስገቡ ነጥብዎን ያያሉ።",
    scheduled: "ነጥብዎ እስከ {date} (የአዲስ አበባ ሰዓት) ድረስ አይታይም። በዚያን ጊዜ ኢሜይል እንልካለን።",
    passed: "አልፏል",
    failed: "አላለፈም",
    openWindow: "አሁን ክፍት ነው",
    closeWindow: "የመጨረሻ ሰዓት የለም",
  },
  om: {
    scheduleSubject: "SmartExam: {exam} beellamameera",
    scheduleBody:
      "Akkam {name},\n\n\"{exam}\" irratti {org} tti galmaa'amtaniittu.\nBanama: {start}\nCufama: {end}\nYeroo kennamame: daqiiqaa {duration}\nQabxii darbumsaa: {pass}%\nBu'aa: {release}\n\nSeenaa: {link}\n\nSmart Online Examination System",
    resultSubject: "SmartExam: bu'aa {exam}",
    resultBody:
      "Akkam {name},\n\nBu'aan \"{exam}\" keessan ni mul'ate.\nQabxii: {score} / {max} ({percentage}%)\nHaala: {status}\nKoodii mirkaneessaa: {code}\n\nBu'aa banaa: {link}\n\nSmart Online Examination System",
    instant: "Erga galchitanii booda qabxii keessan battalumatti ni argitu.",
    scheduled: "Qabxiin keessan hamma {date} (sa'aatii Finfinnee) hin mul'atu. Yeroo sanatti imeelii isiniif ergina.",
    passed: "Darbe",
    failed: "Hin darbine",
    openWindow: "Amma banaadha",
    closeWindow: "Yeroon cufiinsaa hin jiru",
  },
};

function fill(template: string, vars: Record<string, string | number | boolean>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export function scheduleMessage(
  locale: Locale,
  vars: { name: string; exam: string; org: string; start: string; end: string; duration: number; pass: number; release: string },
) {
  const t = mail[locale] ?? mail.en;
  return {
    subject: fill(t.scheduleSubject, vars),
    body: fill(t.scheduleBody, { ...vars, link: `${appOrigin()}/login` }),
  };
}

export function resultMessage(
  locale: Locale,
  vars: { name: string; exam: string; score: string; max: string; percentage: string; passed: boolean; code: string; attemptId: string },
) {
  const t = mail[locale] ?? mail.en;
  return {
    subject: fill(t.resultSubject, vars),
    body: fill(t.resultBody, {
      ...vars,
      status: vars.passed ? t.passed : t.failed,
      link: `${appOrigin()}/results/${vars.attemptId}`,
    }),
  };
}

export function releaseLine(locale: Locale, mode: "instant" | "scheduled", dateLabel: string) {
  const t = mail[locale] ?? mail.en;
  if (mode === "instant") return t.instant;
  return fill(t.scheduled, { date: dateLabel });
}

export async function enqueueNotification(input: {
  userId: string | null;
  email: string;
  subject: string;
  body: string;
  kind: string;
  refId: string;
}) {
  if (input.userId) {
    const existing = await query(
      `select id, status from notifications where user_id = $1 and kind = $2 and ref_id = $3 limit 1`,
      [input.userId, input.kind, input.refId],
    );
    if (existing.length) return { status: String(existing[0].status), duplicate: true };
  }

  let status = "queued";
  let error = "";
  try {
    const sent = await sendEmail(input.email, input.subject, input.body);
    if (sent.ok && sent.mode === "live") status = "sent";
    if (!sent.ok) {
      status = "error";
      error = sent.error || "send failed";
    }
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : "send failed";
  }

  await query(
    `insert into notifications (id, user_id, to_email, subject, body, kind, ref_id, status, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [crypto.randomUUID(), input.userId, input.email, input.subject, input.body, input.kind, input.refId, status, error.slice(0, 500)],
  );
  return { status, duplicate: false };
}
