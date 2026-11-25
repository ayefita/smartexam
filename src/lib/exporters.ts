import fs from "fs";
import path from "path";
import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { appOrigin, csvCell, formatAddis } from "./format";
import type { Locale } from "./i18n";

type Report = NonNullable<Awaited<ReturnType<typeof import("./domain").examReport>>>;

export function reportCsv(report: Report) {
  const header = ["rank", "name", "email", "score", "max", "percentage", "result", "tab_switches", "suspicious", "submitted"];
  const lines = [header.join(",")];
  for (const attempt of report.ranked) {
    lines.push([
      attempt.rank,
      csvCell(attempt.candidateName),
      csvCell(attempt.candidateEmail),
      attempt.score,
      attempt.maxScore,
      attempt.percentage,
      attempt.passed ? "passed" : "not_passed",
      attempt.tabSwitchCount,
      attempt.suspiciousCount,
      csvCell(attempt.submittedAt || ""),
    ].join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

export async function reportXlsx(report: Report) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const results = book.addWorksheet("Results");
  results.addRow(["Rank", "Name", "Email", "Score", "Max", "Percentage", "Result", "Tab switches", "Suspicious", "Submitted"]);
  for (const attempt of report.ranked) {
    results.addRow([attempt.rank, attempt.candidateName, attempt.candidateEmail, attempt.score, attempt.maxScore, attempt.percentage, attempt.passed ? "Passed" : "Not passed", attempt.tabSwitchCount, attempt.suspiciousCount, attempt.submittedAt]);
  }
  const questions = book.addWorksheet("Questions");
  questions.addRow(["Stem", "Type", "Subject", "Topic", "Asked", "Fully correct", "Points earned", "Points possible"]);
  for (const question of report.questions) {
    questions.addRow([question.stem, question.type, question.subject, question.topic, question.asked, question.correct, question.earned, question.possible]);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

const ETHIOPIC = /[\u1200-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/;

type FaceSet = { latin: PDFFont; latinBold: PDFFont; ethiopic: PDFFont; ethiopicBold: PDFFont };

function readFont(file: string) {
  return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", file));
}

function scriptRuns(text: string) {
  const runs: { ethiopic: boolean; text: string }[] = [];
  let current: { ethiopic: boolean; text: string } | null = null;
  for (const char of text) {
    const ethiopic = ETHIOPIC.test(char);
    if (current && current.ethiopic === ethiopic) current.text += char;
    else {
      if (current) runs.push(current);
      current = { ethiopic, text: char };
    }
  }
  if (current) runs.push(current);
  return runs;
}

function faceFor(fonts: FaceSet, ethiopic: boolean, bold: boolean) {
  if (ethiopic) return bold ? fonts.ethiopicBold : fonts.ethiopic;
  return bold ? fonts.latinBold : fonts.latin;
}

function measure(text: string, size: number, fonts: FaceSet, bold: boolean) {
  return scriptRuns(text).reduce((width, run) => width + faceFor(fonts, run.ethiopic, bold).widthOfTextAtSize(run.text, size), 0);
}

function drawMixed(page: PDFPage, text: string, x: number, y: number, size: number, fonts: FaceSet, bold: boolean, color: RGB) {
  let cursor = x;
  for (const run of scriptRuns(text)) {
    const font = faceFor(fonts, run.ethiopic, bold);
    page.drawText(run.text, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
  return cursor;
}

function wrapText(text: string, size: number, maxWidth: number, fonts: FaceSet, bold: boolean) {
  const words = text.split(/(\s+)/).filter((part) => part.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line + word;
    if (line && measure(next, size, fonts, bold) > maxWidth) {
      lines.push(line.trimEnd());
      line = word.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}

async function openPdf() {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkitModule = await import("@pdf-lib/fontkit");
  const fontkit = fontkitModule.default ?? fontkitModule;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {
    latin: await pdf.embedFont(readFont("NotoSans-Regular.ttf"), { subset: true }),
    latinBold: await pdf.embedFont(readFont("NotoSans-Bold.ttf"), { subset: true }),
    ethiopic: await pdf.embedFont(readFont("NotoSansEthiopic-Regular.ttf"), { subset: true }),
    ethiopicBold: await pdf.embedFont(readFont("NotoSansEthiopic-Bold.ttf"), { subset: true }),
  };
  return { pdf, fonts, rgb };
}

export async function reportPdf(report: Report) {
  const { pdf, fonts, rgb } = await openPdf();
  const ink = rgb(0.1, 0.15, 0.12);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const write = (text: string, size = 11, strong = false) => {
    for (const line of wrapText(text, size, 515, fonts, strong)) {
      if (y < 56) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      drawMixed(page, line, 40, y, size, fonts, strong, ink);
      y -= size + 6;
    }
  };
  write("SmartExam", 18, true);
  write(report.exam.title, 14, true);
  write(`${report.exam.organizationName} · ${formatAddis(new Date().toISOString(), "en")}`);
  write(`Average ${report.average ?? "—"}% · Pass rate ${report.passRate ?? "—"}% · Highest ${report.highest ?? "—"}%`);
  write("Results", 13, true);
  for (const attempt of report.ranked) {
    write(`${attempt.rank}. ${attempt.candidateName} — ${attempt.percentage}% (${attempt.passed ? "Passed" : "Not passed"})`);
  }
  write("Questions", 13, true);
  for (const question of report.questions) {
    const rate = question.asked ? Math.round((question.correct / question.asked) * 100) : 0;
    write(`${rate}% fully correct · ${question.stem.replace(/\s+/g, " ")}`);
  }
  return Buffer.from(await pdf.save());
}

export async function studentReportPdf(input: {
  name: string;
  email: string;
  locale?: Locale;
  average: number | null;
  cohort: number | null;
  exams: { title: string; percentage: number | null; cohort: number | null; withheld: boolean }[];
  topics: { topic: string; percent: number }[];
  labels: { title: string; history: string; topics: string; yours: string; cohort: string; withheld: string };
}) {
  const { pdf, fonts, rgb } = await openPdf();
  const ink = rgb(0.1, 0.15, 0.12);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const write = (text: string, size = 11, strong = false) => {
    for (const line of wrapText(text, size, 515, fonts, strong)) {
      if (y < 56) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      drawMixed(page, line, 40, y, size, fonts, strong, ink);
      y -= size + 6;
    }
  };
  write("SmartExam", 18, true);
  write(input.labels.title, 14, true);
  write(`${input.name} · ${input.email}`);
  write(`${input.labels.yours} ${input.average ?? "—"}% · ${input.labels.cohort} ${input.cohort ?? "—"}%`);
  write(input.labels.history, 13, true);
  for (const exam of input.exams) {
    const own = exam.withheld || exam.percentage == null ? input.labels.withheld : `${exam.percentage}%`;
    const others = exam.cohort == null ? "—" : `${exam.cohort}%`;
    write(`${exam.title} — ${input.labels.yours} ${own} · ${input.labels.cohort} ${others}`);
  }
  write(input.labels.topics, 13, true);
  for (const topic of input.topics) write(`${topic.topic}: ${topic.percent}%`);
  if (!input.topics.length) write("—");
  return Buffer.from(await pdf.save());
}

export type SlipLabels = {
  heading: string;
  score: string;
  passed: string;
  failed: string;
  withheld: string;
  submitted: string;
  code: string;
  zone: string;
  scan: string;
  kicker: string;
};

export async function certificatePdf(input: {
  name: string;
  exam: string;
  organization: string;
  percentage: number | null;
  score: number | null;
  max: number | null;
  passed: boolean | null;
  code: string | null;
  submittedAt: string | null;
  released: boolean;
  locale?: Locale;
  labels: SlipLabels;
}) {
  const { pdf, fonts, rgb } = await openPdf();
  const page = pdf.addPage([595, 842]);
  const ink = rgb(0.11, 0.14, 0.12);
  const cream = rgb(0.96, 0.95, 0.9);
  const gold = rgb(0.95, 0.89, 0.7);
  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: rgb(0.05, 0.36, 0.25) });
  drawMixed(page, "SmartExam", 48, 804, 22, fonts, true, cream);
  drawMixed(page, "Smart Online Examination System", 48, 782, 11, fonts, false, gold);
  const kickerLines = wrapText(input.labels.kicker, 11, 500, fonts, false);
  let y = 740;
  for (const line of kickerLines) {
    drawMixed(page, line, 48, y, 11, fonts, false, ink);
    y -= 16;
  }
  y -= 10;
  for (const line of wrapText(input.labels.heading, 26, 500, fonts, true)) {
    drawMixed(page, line, 48, y, 26, fonts, true, ink);
    y -= 34;
  }
  const scoreLine = input.released
    ? `${input.labels.score} ${input.score ?? "—"} / ${input.max ?? "—"} (${input.percentage ?? "—"}%)`
    : input.labels.withheld;
  const lines = [
    input.name,
    input.exam,
    input.organization,
    scoreLine,
    input.released ? (input.passed ? input.labels.passed : input.labels.failed) : "",
    input.submittedAt ? `${input.labels.submitted} ${formatAddis(input.submittedAt, input.locale || "en")} (${input.labels.zone})` : "",
    input.code ? `${input.labels.code} ${input.code}` : "",
  ].filter(Boolean);
  y -= 8;
  for (const line of lines) {
    for (const wrapped of wrapText(line, 14, 500, fonts, false)) {
      drawMixed(page, wrapped, 48, y, 14, fonts, false, ink);
      y -= 24;
    }
    y -= 6;
  }
  if (input.code && input.released) {
    const QRCode = (await import("qrcode")).default;
    const png = await QRCode.toBuffer(`${appOrigin()}/verify/${input.code}`, { width: 200, margin: 1 });
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: 400, y: 90, width: 140, height: 140 });
    const scanWidth = measure(input.labels.scan, 10, fonts, false);
    drawMixed(page, input.labels.scan, 400 + Math.max(0, (140 - scanWidth) / 2), 72, 10, fonts, false, rgb(0.25, 0.25, 0.22));
  }
  return Buffer.from(await pdf.save());
}
