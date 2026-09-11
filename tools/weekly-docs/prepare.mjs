// Lists lessons not yet reflected in the curriculum. With --month, writes that month's
// lessons and the current curriculum outline (with IDs) for the weekly Claude run to read.
//   node prepare.mjs                  summary: pending months, pending teacher requests
//   node prepare.mjs --month 2026-07  write _데이터\작업\pending_2026-07.md (+ .json ids) and outline.md
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  WORK, ensureDir, loadLessons, loadState, groupByMonth, lessonLine, outline,
  readRequests, writeJSON, parseArgs, print,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
let lessons;
try { lessons = loadLessons(); }
catch (e) { print({ ok: false, error: e.message }); process.exit(2); }

const state = loadState();
const done = new Set(state.incorporated);
const pending = groupByMonth(lessons.filter(l => !done.has(l.id)));
ensureDir(WORK);
const outlineFile = join(WORK, "outline.md");
writeFileSync(outlineFile, outline(state), "utf8");

if (typeof args.month === "string") {
  const g = pending.find(p => p.month === args.month);
  if (!g) { print({ ok: false, error: `${args.month}에 반영 대기 기록이 없습니다` }); process.exit(1); }
  const lessonsFile = join(WORK, `pending_${g.month}.md`);
  writeJSON(join(WORK, `pending_${g.month}.json`), g.entries.map(e => e.id));
  writeFileSync(lessonsFile,
    `# ${g.month} 반영 대기 레슨 기록 (${g.entries.length}회, 실력 지표 1~5점)\n\n` + g.entries.map(lessonLine).join("\n") + "\n",
    "utf8");
  print({ ok: true, month: g.month, count: g.entries.length, lessonsFile, outlineFile });
} else {
  print({
    ok: true,
    lessons: lessons.length,
    units: state.units.length,
    incorporated: state.incorporated.length,
    pendingMonths: pending.map(p => ({ month: p.month, count: p.entries.length })),
    requests: readRequests() || null,
    outlineFile,
  });
}
