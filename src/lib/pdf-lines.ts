import type { PDFPage, RGB } from "pdf-lib";

export function dashedLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: RGB) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color, dashArray: [4, 3] });
}
