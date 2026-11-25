/**
 * Reads a typed exam paper (PDF or Word) into questions:
 *   1. Question text            Q1) ...      Question 1: ...
 *   A. option   (b) option   C) option       options can also sit on one line
 *   Answer: B                                or an answer key at the end: "1. B  2-C  3) a"
 */
export type ParsedQuestion = {
  stem: string;
  options: string[];
  answer: string;
  problem: "" | "no_options" | "no_answer" | "bad_answer";
};

const QUESTION = /^\s*(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)\-:]\s*(.+)$/i;
const OPTION = /^\s*\(?([a-f])\s*[.)\]:-]\s*(.*)$/i;
const ANSWER = /^\s*(?:answer|ans|correct(?:\s+answer)?|key|መልስ|deebii|deebiin)\s*[:\-=.]?\s*\(?([a-f])\)?\s*\.?\s*$/i;
const KEY_HEADING = /^\s*(?:answer\s*key|answers|key|marking\s*key|የመልስ\s*ቁልፍ|መልሶች|furtuu\s*deebii|deebiiwwan)\s*:?\s*$/i;
const KEY_PAIR = /(\d{1,3})\s*[.)\-:=]?\s*\(?([a-f])\)?(?![a-z])/gi;

/** Splits "A. one  B. two  C. three" into separate option lines. */
function splitInlineOptions(line: string) {
  if (!OPTION.test(line)) return [line];
  const parts = line.split(/\s+(?=\(?[b-f]\s*[.)]\s+\S)/i);
  return parts.length > 1 && parts.every((part) => OPTION.test(part)) ? parts : [line];
}

export function parsePaper(raw: string): ParsedQuestion[] {
  const lines = raw
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // An answer key at the end of the paper, if there is one.
  const key = new Map<number, string>();
  let bodyEnd = lines.length;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (KEY_HEADING.test(lines[index])) {
      bodyEnd = index;
      for (const line of lines.slice(index + 1)) {
        for (const match of line.matchAll(KEY_PAIR)) key.set(Number(match[1]), match[2].toUpperCase());
      }
      break;
    }
  }

  const questions: (ParsedQuestion & { no: number })[] = [];
  let current: (ParsedQuestion & { no: number }) | null = null;
  for (const rawLine of lines.slice(0, bodyEnd)) {
    for (const line of splitInlineOptions(rawLine)) {
      const answer = line.match(ANSWER);
      if (answer && current) {
        current.answer = answer[1].toUpperCase();
        continue;
      }
      const option = line.match(OPTION);
      if (option && current && option[1].toUpperCase() === "ABCDEF"[current.options.length]) {
        current.options.push(option[2].trim());
        continue;
      }
      const question = line.match(QUESTION);
      if (question && (!current || current.options.length > 0 || Number(question[1]) === current.no + 1)) {
        current = { no: Number(question[1]), stem: question[2].trim(), options: [], answer: "", problem: "" };
        questions.push(current);
        continue;
      }
      if (!current) continue; // Title, instructions and other text before question 1.
      if (current.options.length) current.options[current.options.length - 1] += ` ${line}`;
      else current.stem += ` ${line}`;
    }
  }

  return questions.map(({ no, ...question }) => {
    const answer = question.answer || key.get(no) || "";
    const letters = "ABCDEF".slice(0, question.options.length);
    const problem: ParsedQuestion["problem"] =
      question.options.length < 2 ? "no_options" : !answer ? "no_answer" : !letters.includes(answer) ? "bad_answer" : "";
    return { ...question, answer, problem };
  });
}

/** Text of a typed PDF, keeping line breaks (scanned images have no text). */
export async function pdfLines(bytes: Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const out: string[] = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 60); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
      if (typeof item.str !== "string") continue;
      const y: number | null = item.transform ? Math.round(item.transform[5]) : lastY;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2 && line.trim()) {
        out.push(line);
        line = "";
      }
      line += item.str;
      lastY = y;
      if (item.hasEOL) {
        out.push(line);
        line = "";
      }
    }
    if (line.trim()) out.push(line);
  }
  return out.join("\n");
}

export async function docxText(bytes: Uint8Array) {
  const mammoth = await import("mammoth");
  const result = await (mammoth.default ?? mammoth).extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}
