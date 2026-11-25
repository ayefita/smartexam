export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  while (i < source.length) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    cell += char;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof record.text === "string") return record.text;
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text).join("");
    if ("result" in record) return cellText(record.result);
  }
  return String(value);
}

export async function parseTabular(filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(buffer.toString("utf8"));
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    for (let index = 1; index < values.length; index += 1) cells.push(cellText(values[index]));
    rows.push(cells);
  });
  return rows;
}

export function headerIndex(header: string[]) {
  const map = new Map<string, number>();
  header.forEach((value, index) => {
    map.set(value.trim().toLowerCase().replace(/\s+/g, "_"), index);
  });
  return (row: string[], ...names: string[]) => {
    for (const name of names) {
      const index = map.get(name);
      if (index != null && index < row.length) return (row[index] ?? "").trim();
    }
    return "";
  };
}
