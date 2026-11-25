import fs from "fs";
import { certificatePdf } from "../src/lib/exporters";
import { dictionaries } from "../src/lib/i18n";

async function main() {
const dict = dictionaries.am;
const pdf = await certificatePdf({
  name: "ሊያ ታደሰ",
  exam: "Computer Science Exit Examination",
  organization: "Addis Ababa University",
  percentage: 83.3,
  score: 5,
  max: 6,
  passed: true,
  code: "LYAEXIT2K7P",
  submittedAt: "2026-11-22T10:00:00.000Z",
  released: true,
  locale: "am",
  labels: {
    heading: dict.pdf.slip,
    score: dict.results.score,
    passed: dict.status.passed,
    failed: dict.status.failed,
    withheld: dict.pdf.withheld,
    submitted: dict.pdf.submitted,
    code: dict.results.code,
    zone: dict.zone,
    scan: dict.pdf.scan,
    kicker: dict.pdf.kicker,
  },
});

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync("/opt/cursor/artifacts/liya-result-slip.pdf", pdf);
console.log("wrote", pdf.length);
}

main();
