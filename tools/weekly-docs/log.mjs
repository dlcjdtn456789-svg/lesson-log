// Appends one line to 실행 기록.txt:  node log.mjs "요약 한 줄"
import { appendRunLog, print } from "./lib.mjs";

const msg = process.argv.slice(2).join(" ").trim();
if (!msg) { print({ ok: false, error: "기록할 내용이 없습니다" }); process.exit(2); }
appendRunLog(msg);
print({ ok: true });
