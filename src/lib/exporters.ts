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
  const items = book.addWorksheet("Item analysis");
  items.addRow(["#", "Question", "Difficulty", "Asked", "Right % (p)", "Discrimination (D)", "Choices (count, ✓ = key)", "Blank", "Note"]);
  const notes = { good: "Good", easy: "Too easy", hard: "Too hard", weak: "Does not separate strong and weak students", key: "Check the answer key", few: "Too few answers yet" };
  for (const item of report.items) {
    items.addRow([
      item.no,
      item.stem,
      item.difficulty,
      item.asked,
      item.p == null ? null : Math.round(item.p * 100),
      item.d,
      item.choices.map((choice, index) => `${"ABCDEFGHIJ"[index] || index + 1}${choice.correct ? "✓" : ""}: ${choice.count}`).join("  "),
      item.blank,
      notes[item.flag],
    ]);
  }
  items.getColumn(2).width = 60;
  items.getColumn(7).width = 36;
  const summary = book.addWorksheet("Summary");
  summary.addRows([
    ["Exam", report.exam.title],
    ["Submitted", report.submitted],
    ["Pass rate %", report.passRate],
    ["Average %", report.average],
    ["Median %", report.median],
    ["Highest %", report.highest],
    ["Lowest %", report.lowest],
  ]);
  for (const bucket of report.distribution) summary.addRow([`Scores ${bucket.label}`, bucket.count]);
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
  write(`Submitted ${report.submitted} · Pass rate ${report.passRate ?? "—"}% · Average ${report.average ?? "—"}% · Median ${report.median ?? "—"}% · Highest ${report.highest ?? "—"}% · Lowest ${report.lowest ?? "—"}%`);
  write("Score distribution", 13, true);
  const most = Math.max(1, ...report.distribution.map((bucket) => bucket.count));
  for (const bucket of report.distribution) {
    if (y < 56) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    drawMixed(page, bucket.label, 40, y, 10, fonts, false, ink);
    const width = (bucket.count / most) * 380;
    if (width > 0) page.drawRectangle({ x: 100, y: y - 1, width, height: 9, color: rgb(0.05, 0.36, 0.25) });
    drawMixed(page, String(bucket.count), 100 + width + 6, y, 10, fonts, false, ink);
    y -= 16;
  }
  write("Results", 13, true);
  for (const attempt of report.ranked) {
    write(`${attempt.rank}. ${attempt.candidateName} — ${attempt.percentage}% (${attempt.passed ? "Passed" : "Not passed"})`);
  }
  write("Item analysis (p = share right, D = top 27% minus bottom 27%)", 13, true);
  for (const item of report.items) {
    const choices = item.choices.map((choice, index) => `${"ABCDEFGHIJ"[index] || index + 1}${choice.correct ? "✓" : ""} ${choice.count}`).join("  ");
    write(`${item.no}. ${item.stem.replace(/\s+/g, " ").slice(0, 160)}`, 10, true);
    write(`p ${item.p == null ? "—" : Math.round(item.p * 100) + "%"} · D ${item.d == null ? "—" : item.d.toFixed(2)}${choices ? ` · ${choices}` : ""} · blank ${item.blank}`, 10);
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

/** Wraps text to at most `max` lines, breaking long unspaced strings (emails, links) by character. */
function fitLines(text: string, size: number, width: number, fonts: FaceSet, bold: boolean, max: number) {
  const lines: string[] = [];
  for (const line of wrapText(text, size, width, fonts, bold)) {
    let rest = line;
    while (measure(rest, size, fonts, bold) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut), size, fonts, bold) > width) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    lines.push(rest);
  }
  if (lines.length <= max) return lines;
  const shown = lines.slice(0, max);
  let last = shown[max - 1];
  while (last.length > 1 && measure(`${last}…`, size, fonts, bold) > width) last = last.slice(0, -1);
  shown[max - 1] = `${last}…`;
  return shown;
}

export type LoginSlip = {
  fullName: string;
  candidateNumber: string;
  email: string;
  password?: string;
  status: string;
};

export type LoginSlipLabels = {
  slipTitle: string;
  colNumber: string;
  username: string;
  password: string;
  exam: string;
  window: string;
  signIn: string;
  slipNote: string;
  unchanged: string;
};

/** A4 sheets of eight cut-out sign-in slips (2 × 4) with dashed cut lines and a QR code. */
export async function loginSlipsPdf(input: {
  slips: LoginSlip[];
  labels: LoginSlipLabels;
  loginUrl: string;
  exam: { title: string; window: string; link: string } | null;
}) {
  const { pdf, fonts, rgb } = await openPdf();
  const { dashedLine } = await import("./pdf-lines");
  const QRCode = (await import("qrcode")).default;
  const target = input.exam?.link || input.loginUrl;
  const qr = await pdf.embedPng(await QRCode.toBuffer(target, { width: 240, margin: 1 }));
  const ink = rgb(0.1, 0.14, 0.12);
  const soft = rgb(0.35, 0.38, 0.36);
  const green = rgb(0.05, 0.36, 0.25);
  const W = 595;
  const H = 842;
  const cols = 2;
  const rows = 4;
  const margin = 18;
  const cellW = (W - margin * 2) / cols;
  const cellH = (H - margin * 2) / rows;
  const pad = 14;
  const qrSize = 78;
  const slips = input.slips.length ? input.slips : [];
  for (let start = 0; start < slips.length; start += cols * rows) {
    const page = pdf.addPage([W, H]);
    for (let c = 1; c < cols; c += 1) dashedLine(page, margin + c * cellW, margin, margin + c * cellW, H - margin, soft);
    for (let r = 0; r <= rows; r += 1) dashedLine(page, margin, margin + r * cellH, W - margin, margin + r * cellH, soft);
    dashedLine(page, margin, margin, margin, H - margin, soft);
    dashedLine(page, W - margin, margin, W - margin, H - margin, soft);
    slips.slice(start, start + cols * rows).forEach((slip, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = margin + col * cellW + pad;
      const top = H - margin - row * cellH - 12;
      const bottom = H - margin - (row + 1) * cellH + 12;
      const full = cellW - pad * 2;
      let y = top - 9;
      const put = (text: string, size: number, bold: boolean, color: RGB, width: number, max: number, left = x) => {
        for (const part of fitLines(text, size, width, fonts, bold, max)) {
          drawMixed(page, part, left, y, size, fonts, bold, color);
          y -= size + 3.5;
        }
      };
      put(input.labels.slipTitle, 8.5, true, green, full, 1);
      y -= 2;
      put(slip.fullName, 12, true, ink, full, 2);
      if (slip.candidateNumber) put(`${input.labels.colNumber}: ${slip.candidateNumber}`, 8.5, false, soft, full, 1);
      y -= 3;
      const labelW = Math.max(measure(input.labels.username, 7.5, fonts, false), measure(input.labels.password, 7.5, fonts, false)) + 8;
      const labelY = y;
      drawMixed(page, input.labels.username, x, labelY, 7.5, fonts, false, soft);
      put(slip.email, 9.5, true, ink, full - labelW, 2, x + labelW);
      y -= 2;
      drawMixed(page, input.labels.password, x, y + 1, 7.5, fonts, false, soft);
      put(slip.password || input.labels.unchanged, slip.password ? 13 : 9, true, ink, full - labelW, 1, x + labelW);
      page.drawImage(qr, { x: x + full - qrSize, y: bottom, width: qrSize, height: qrSize });
      y -= 3;
      const narrow = full - qrSize - 8;
      if (input.exam) {
        put(`${input.labels.exam}: ${input.exam.title}`, 8.5, true, ink, narrow, 2);
        put(`${input.labels.window}: ${input.exam.window}`, 7.5, false, ink, narrow, 3);
        put(`${input.labels.signIn}: ${input.exam.link}`, 7.5, false, ink, narrow, 3);
      } else {
        put(`${input.labels.signIn}: ${input.loginUrl}`, 8, false, ink, narrow, 2);
      }
      if (slip.password && y > bottom + 4) put(input.labels.slipNote, 7.5, false, soft, narrow, 2);
    });
  }
  if (!slips.length) pdf.addPage([W, H]);
  return Buffer.from(await pdf.save());
}

export async function loginsXlsx(input: {
  rows: (LoginSlip & { statusLabel: string })[];
  headers: string[];
  loginUrl: string;
  exam: { title: string; window: string; link: string } | null;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Logins");
  sheet.addRow(input.headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of input.rows) {
    sheet.addRow([
      row.fullName,
      row.candidateNumber,
      row.email,
      row.password || "",
      row.statusLabel,
      input.exam?.title || "",
      input.exam?.window || "",
      input.exam?.link || input.loginUrl,
    ]);
  }
  [30, 16, 34, 20, 20, 30, 40, 50].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function candidateTemplateXlsx() {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Candidates");
  sheet.addRow(["full_name", "email", "phone", "candidate_number"]);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(["Abebe Kebede", "abebe.kebede@example.com", "0911000000", "AAU-2026-001"]);
  sheet.addRow(["ሊያ ተስፋዬ", "liya.tesfaye@example.com", "", "AAU-2026-002"]);
  [28, 34, 18, 20].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}
