// Downloads the latest lesson backup from the user's Apps Script web app (Google Drive).
//   node fetch.mjs               from Drive (uses _데이터\설정.json)
//   node fetch.mjs --from <json> import a local backup file instead
import { existsSync } from "node:fs";
import { PATHS, readJSON, writeJSON, lessonsOf, parseArgs, print } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  let data;
  if (typeof args.from === "string") {
    data = readJSON(args.from, null);
  } else {
    const cfg = readJSON(PATHS.config, {});
    if (!cfg.driveUrl || !cfg.driveKey) throw new Error("_데이터\\설정.json 에 driveUrl/driveKey 가 없습니다 (setup.mjs 참고)");
    const url = `${cfg.driveUrl}${cfg.driveUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(cfg.driveKey)}`;
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    try { data = JSON.parse(text); }
    catch { throw new Error(`JSON이 아닌 응답 (HTTP ${res.status}): ${text.slice(0, 150).replace(/\s+/g, " ")}`); }
    if (data && data.ok === false) throw new Error(`드라이브 연동 오류: ${data.error}`);
  }

  const list = lessonsOf(data);
  if (!list) throw new Error("백업에 레슨 기록(lessons)이 없습니다");
  const normalized = Array.isArray(data) ? { version: 1, exportedAt: null, lessons: data } : data;

  // Guard against a wiped or reset device silently replacing a much larger backup.
  const prev = existsSync(PATHS.backup) ? lessonsOf(readJSON(PATHS.backup, null)) : null;
  if (prev && prev.length >= 10 && list.length < prev.length * 0.5) {
    writeJSON(PATHS.suspectBackup, normalized);
    print({
      ok: false, usingPrevious: true,
      error: `새 백업의 기록 수(${list.length})가 이전(${prev.length})의 절반도 안 되어 기존 백업을 유지했습니다. 새 파일은 ${PATHS.suspectBackup} 에 따로 저장했습니다.`,
    });
    process.exit(1);
  }

  writeJSON(PATHS.backup, normalized);
  print({ ok: true, source: args.from ? "file" : "drive", lessons: list.length, exportedAt: normalized.exportedAt || null });
} catch (e) {
  const hasPrev = existsSync(PATHS.backup);
  print({ ok: false, error: String(e.message || e), usingPrevious: hasPrev });
  process.exit(hasPrev ? 1 : 2);
}
