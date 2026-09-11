// Shared helpers for the weekly lesson-log Word documents.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export const ROOT = process.env.LESSON_DOCS_DIR || join(homedir(), "Documents", "레슨로그");
export const DATA = join(ROOT, "_데이터");
export const WORK = join(DATA, "작업");
export const PATHS = {
  config: join(DATA, "설정.json"),
  backup: join(DATA, "레슨로그_백업.json"),
  suspectBackup: join(DATA, "레슨로그_백업_확인필요.json"),
  state: join(DATA, "커리큘럼_상태.json"),
  stateHistory: join(DATA, "상태 백업"),
  processedRequests: join(DATA, "처리한 수정요청"),
  setupDir: join(ROOT, "구글드라이브 연동"),
  requests: join(ROOT, "커리큘럼_수정요청.txt"),
  runLog: join(ROOT, "실행 기록.txt"),
  curriculumDoc: join(ROOT, "강의 커리큘럼.docx"),
  curriculumArchive: join(ROOT, "커리큘럼 이전 버전"),
  lessonLogDir: join(ROOT, "레슨일지"),
};

export const APP_URL = "https://dlcjdtn456789-svg.github.io/lesson-log/";
export const LEVELS = ["초급", "중급", "고급"];
export const SKILL_KEYS = ["리듬", "테크닉", "독보", "표현", "완성도"];
export const SECTIONS = [
  { k: "exercises", label: "연습·교재" },
  { k: "tips", label: "지도 포인트" },
  { k: "issues", label: "어려움 → 해결" },
  { k: "homework", label: "과제 예시" },
];

export const REQUESTS_TEMPLATE = [
  "# 커리큘럼 수정 요청",
  "# 고치고 싶은 내용을 아래에 자유롭게 적어 두면 다음 월요일 정리 때 반영되고, 이 파일은 다시 비워집니다.",
  "# 예) 초급 '8비트 기본 그루브' 단원에서 '그립 힘 빼기' 항목 삭제",
  "# 예) 중급 '셔플 그루브' 단원 목표를 '셔플 필인 4종 완성'으로 변경",
  "# 예) 초급에 '메트로놈 활용' 단원 추가 — 4분/8분 전환 연습 포함",
  "# (# 으로 시작하는 줄은 무시됩니다)",
  "",
  "",
].join("\r\n");

export const ensureDir = (p) => mkdirSync(p, { recursive: true });
export const readJSON = (p, fallback) =>
  (existsSync(p) ? JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, "")) : fallback);
export function writeJSON(p, value) {
  ensureDir(dirname(p));
  writeFileSync(p, JSON.stringify(value, null, 2), "utf8");
}
// user-facing text files: BOM + CRLF so Notepad shows Korean correctly
export function writeText(p, text) {
  ensureDir(dirname(p));
  writeFileSync(p, "﻿" + text.replace(/\r?\n/g, "\r\n"), "utf8");
}

export const shortId = () => randomUUID().slice(0, 8);
export const localDate = (d = new Date()) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time
export const asArr = (v) => (Array.isArray(v) ? v : []);
export const asStr = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
// loose key for duplicate detection: ignores spacing and punctuation
export const normText = (t) => asStr(t).toLowerCase().replace(/[\s.,·/()\-–—~→:;'"!?=♩]/g, "");

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) out[k] = true;
    else { out[k] = v; i++; }
  }
  return out;
}

export const print = (obj) => console.log(JSON.stringify(obj, null, 2));

export function appendRunLog(line) {
  ensureDir(ROOT);
  appendFileSync(PATHS.runLog, `[${new Date().toLocaleString("sv-SE")}] ${line}\r\n`, "utf8");
}

export const lessonsOf = (d) => (Array.isArray(d) ? d : Array.isArray(d?.lessons) ? d.lessons : null);

export function loadLessons(file = PATHS.backup) {
  const raw = readJSON(file, null);
  if (!raw) throw new Error(`백업 파일이 없습니다: ${file}`);
  const list = lessonsOf(raw);
  if (!list) throw new Error("백업에 레슨 기록(lessons)이 없습니다");
  return list
    .filter(l => l && l.id && /^\d{4}-\d{2}-\d{2}$/.test(asStr(l.date)) && asStr(l.student).trim())
    .map(l => ({
      id: l.id, date: l.date,
      academy: asStr(l.academy).trim(), student: asStr(l.student).trim(),
      content: asStr(l.content).trim(), homework: asStr(l.homework).trim(), memo: asStr(l.memo).trim(),
      level: asStr(l.level), bpm: l.bpm === "" || l.bpm == null ? "" : String(l.bpm),
      skills: l.skills && typeof l.skills === "object" ? l.skills : {},
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function loadState() {
  const s = readJSON(PATHS.state, {});
  return { version: 1, createdAt: "", updatedAt: "", overview: "", units: [], incorporated: [], log: [], ...s };
}

export function groupByMonth(lessons) {
  const m = {};
  lessons.forEach(l => { (m[l.date.slice(0, 7)] ||= []).push(l); });
  return Object.keys(m).sort().map(month => ({ month, entries: m[month] }));
}

export const lessonLine = (e) =>
  `- ${e.date} ${e.student}${e.academy ? `(${e.academy})` : ""} [${e.level || "레벨 미정"}${e.bpm ? ` ♩${e.bpm}` : ""}] ` +
  SKILL_KEYS.map(k => `${k}${e.skills?.[k] ?? "-"}`).join(" ") +
  ` | 내용: ${e.content || "-"}` + (e.homework ? ` | 과제: ${e.homework}` : "") + (e.memo ? ` | 메모: ${e.memo}` : "");

// current curriculum with unit [id] and item (id) handles the patch can reference
export function outline(state) {
  if (!state.units.length) return "(아직 비어 있음 — 이번 기록으로 첫 단원들을 만드세요.)\n";
  const lines = [];
  if (state.overview) lines.push(`개요: ${state.overview}`, "");
  LEVELS.forEach(lv => {
    const us = state.units.filter(u => u.level === lv);
    lines.push(`■ ${lv}${us.length ? "" : " (단원 없음)"}`);
    us.forEach(u => {
      lines.push(`[${u.id}] ${u.title}` + (u.goal ? ` / 목표: ${u.goal}` : "") + (u.bpm ? ` / 템포: ${u.bpm}` : ""));
      SECTIONS.forEach(s => asArr(u[s.k]).forEach(i => lines.push(`    (${i.id}) ${s.label}: ${i.text}`)));
    });
    lines.push("");
  });
  return lines.join("\n");
}

export function readRequests() {
  if (!existsSync(PATHS.requests)) return "";
  return readFileSync(PATHS.requests, "utf8").replace(/^﻿/, "")
    .split(/\r?\n/).filter(l => !l.trim().startsWith("#")).join("\n").trim();
}
