import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Cell,
} from "recharts";
import {
  LayoutDashboard, List, Users, PlusCircle, Upload, Loader2, Download,
  Trash2, Pencil, ChevronLeft, Music4, Save, FileText, PenLine,
  Eraser, RotateCcw, Sparkles, Maximize2, Minimize2,
  Settings, KeyRound, ExternalLink, GraduationCap, CheckCircle2, Circle,
  Copy, RefreshCw, Target, Flag, CalendarRange,
} from "lucide-react";

const SKILL_KEYS = ["리듬", "테크닉", "독보", "표현", "완성도"];
const SKILL_COLORS = ["#d97706", "#0d9488", "#4f46e5", "#e11d48", "#0891b2"];
const LEVELS = ["초급", "중급", "고급"];
const STORAGE_KEY = "lesson_manager_v1";

const emptyEntry = () => ({
  id: crypto.randomUUID(),
  date: new Date().toISOString().slice(0, 10),
  academy: "",
  student: "",
  content: "",
  homework: "",
  memo: "",
  skills: { 리듬: 3, 테크닉: 3, 독보: 3, 표현: 3, 완성도: 3 },
  level: "초급",
  bpm: "",
});

const SAMPLE = () => {
  const mk = (id, date, academy, student, content, homework, memo, s, level, bpm) => ({
    id, date, academy, student, content, homework, memo,
    skills: { 리듬: s[0], 테크닉: s[1], 독보: s[2], 표현: s[3], 완성도: s[4] },
    level, bpm,
  });
  return [
    mk("s1", "2026-06-05", "온음악학원", "김하늘", "8비트 기본기 / 싱글스트로크 ♩=80", "싱글 ♩=90까지", "그립 경직", [2,2,2,2,2], "초급", 80),
    mk("s2", "2026-06-19", "온음악학원", "김하늘", "8비트 필인 4종 / 싱글 ♩=95", "필인 반복", "손목 이완 좋아짐", [3,2,2,3,2], "초급", 95),
    mk("s3", "2026-07-03", "온음악학원", "김하늘", "16비트 진입 / 패러디들 도입", "패러디들 RLRR", "리듬감 성장", [3,3,3,3,3], "중급", 105),
    mk("s4", "2026-07-17", "온음악학원", "김하늘", "셔플 그루브 / 곡: Rosanna 인트로 분석", "Rosanna 절반 암보", "표현력 눈에 띔", [4,3,3,4,3], "중급", 115),
    mk("s5", "2026-06-12", "리듬스테이션", "박서준", "루디먼트 5종 / 독보 4마디", "더블스트로크 ♩=70", "독보 약함", [3,3,2,2,3], "중급", 90),
    mk("s6", "2026-07-10", "리듬스테이션", "박서준", "재즈 브러시 기초 / 스윙 필", "브러시 원 연습", "표현 성장", [3,4,3,4,3], "중급", 100),
    mk("s7", "2026-06-26", "온음악학원", "이도윤", "메트로놈 4분/8분 전환 / 기본 그루브", "8분 유지 ♩=80", "타이밍 흔들림", [2,2,1,2,2], "초급", 75),
    mk("s8", "2026-07-24", "온음악학원", "이도윤", "8비트 안정화 / 크래시 타이밍", "곡 1절 완주", "많이 안정됨", [3,2,2,3,3], "초급", 90),
  ];
};

/* ---------- storage (localStorage) ---------- */
async function loadData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { ok: true, data: parsed };
      return { ok: false, data: [], corrupt: true };
    }
    return { ok: true, data: [] }; // no data yet
  } catch (e) {
    return { ok: false, data: [], corrupt: true };
  }
}
async function saveData(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) { console.error("저장 실패", e); return false; }
}

/* ---------- Anthropic API (direct from browser, user-supplied key) ---------- */
const API_KEY_STORAGE = "lesson_api_key";
const API_MODEL_STORAGE = "lesson_api_model";
const DEFAULT_MODEL = "claude-sonnet-5";

function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch { return ""; }
}
function getModel() {
  try { return localStorage.getItem(API_MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}

const API_URL = "https://api.anthropic.com/v1/messages";
const apiHeaders = (key) => ({
  "content-type": "application/json",
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

function requireKey() {
  const key = getApiKey();
  if (!key) {
    const e = new Error("NO_API_KEY");
    e.code = "NO_API_KEY";
    throw e;
  }
  return key;
}

async function apiError(resp) {
  const t = await resp.text();
  const e = new Error("API " + resp.status + ": " + t.slice(0, 300));
  e.status = resp.status;
  return e;
}

async function callAnthropic(messages, maxTokens) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(requireKey()),
    body: JSON.stringify({ model: getModel(), max_tokens: maxTokens, messages }),
  });
  if (!resp.ok) throw await apiError(resp);
  return resp.json();
}

// Streaming variant for long generations: keeps the connection active on slow
// mobile networks and reports progress. Resolves to the concatenated text.
async function streamAnthropic(messages, maxTokens, extra, onChars) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(requireKey()),
    body: JSON.stringify({ model: getModel(), max_tokens: maxTokens, messages, stream: true, ...extra }),
  });
  if (!resp.ok) throw await apiError(resp);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", stopReason = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
      const data = block.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        text += ev.delta.text; onChars?.(text.length);
      } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
        stopReason = ev.delta.stop_reason;
      } else if (ev.type === "error") {
        throw new Error("API stream: " + (ev.error?.message || "error"));
      }
    }
  }
  return { text, stopReason };
}

// src is either a File, or { base64, mediaType } (from the drawing canvas)
async function parseImage(src) {
  let base64, mediaType;
  if (src && src.base64) {
    base64 = src.base64; mediaType = src.mediaType || "image/png";
  } else {
    mediaType = src.type;
    base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("read fail"));
      r.readAsDataURL(src);
    });
  }
  const data = await callAnthropic([{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: `당신은 드럼 레슨 노트를 정리하는 도우미입니다. 이미지에는 여러 학생의 레슨 기록이 함께 적혀 있을 수 있습니다. 학생(또는 날짜)별로 구분해서, 각 기록을 하나의 객체로 만들어 배열(JSON array)로만 답하세요. 학생이 한 명이면 객체 하나짜리 배열로 답하세요. 설명, 마크다운, 코드블록 금지. 오직 JSON 배열만 출력하세요.
각 객체 형식:
{
"date": "YYYY-MM-DD 형식, 노트에 없으면 빈 문자열",
"academy": "학원명, 없으면 빈 문자열",
"student": "학생 이름, 없으면 빈 문자열",
"content": "레슨에서 다룬 내용을 곡/패턴/루디먼트 위주로 정리",
"homework": "다음 과제 또는 목표",
"memo": "특이사항/코멘트",
"skills": {"리듬":1~5, "테크닉":1~5, "독보":1~5, "표현":1~5, "완성도":1~5},
"level": "초급 또는 중급 또는 고급 중 하나",
"bpm": 숫자 또는 null
}
실력을 추정하기 어려우면 3으로 두세요. 여러 학생이 같은 학원/날짜를 공유하면 각 객체에 같은 값을 넣으세요.` },
    ],
  }], 1200);
  const text = data.content.filter(c => c.type === "text").map(c => c.text).join("\n")
    .replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/* ---------- curriculum (AI-generated, stored locally) ---------- */
const CURR_STORAGE = "lesson_curriculum_v1";
const COURSE_KEY = "__course__";
const studentKey = (s) => `${s.academy}||${s.student}`;

function loadCurricula() {
  try {
    const o = JSON.parse(localStorage.getItem(CURR_STORAGE) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}
function saveCurricula(obj) {
  try { localStorage.setItem(CURR_STORAGE, JSON.stringify(obj)); return true; } catch { return false; }
}

const ym = (d) => d.slice(0, 7);
const addMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// plan starts the month after the latest record, but never before the current month
const planStart = (lastMonth) => {
  const next = addMonths(lastMonth, 1), now = new Date().toISOString().slice(0, 7);
  return next < now ? now : next;
};
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

// group lesson entries by YYYY-MM with per-month stats (deterministic, no AI)
function monthlyFlow(entries) {
  const m = {};
  entries.forEach(e => { (m[ym(e.date)] ||= []).push(e); });
  return Object.keys(m).sort().map(month => {
    const es = [...m[month]].sort((a, b) => a.date.localeCompare(b.date));
    const bpms = es.map(e => Number(e.bpm)).filter(Boolean);
    const avg = {};
    SKILL_KEYS.forEach(k => {
      const v = es.map(e => e.skills?.[k]).filter(x => x != null);
      avg[k] = v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
    });
    const levels = {};
    es.forEach(e => { if (e.level) levels[e.level] = (levels[e.level] || 0) + 1; });
    return {
      month, entries: es, count: es.length,
      students: new Set(es.map(e => `${e.academy}||${e.student}`)).size,
      level: es[es.length - 1].level, levels, avg,
      bpmMin: bpms.length ? Math.min(...bpms) : null,
      bpmMax: bpms.length ? Math.max(...bpms) : null,
    };
  });
}

const lessonLine = (e, withName) =>
  `- ${e.date.slice(5)}${withName ? " " + e.student : ""} [${e.level || "-"}${e.bpm ? " ♩" + e.bpm : ""}] ` +
  SKILL_KEYS.map(k => `${k}${e.skills?.[k] ?? "-"}`).join(" ") +
  ` | 내용: ${e.content || "-"}` + (e.homework ? ` | 과제: ${e.homework}` : "") + (e.memo ? ` | 메모: ${e.memo}` : "");

const JS_STR = { type: "string" };
const JS_STRS = { type: "array", items: JS_STR };
const jsObj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const UNIT_SCHEMA = jsObj({ title: JS_STR, detail: JS_STR, bpmTarget: JS_STR, homework: JS_STR });
const STUDENT_CURR_SCHEMA = jsObj({
  overview: JS_STR,
  currentStage: JS_STR,
  completed: { type: "array", items: jsObj({ month: JS_STR, theme: JS_STR, topics: JS_STRS, achievement: JS_STR }) },
  focus: JS_STRS,
  plan: { type: "array", items: jsObj({ month: JS_STR, goal: JS_STR, units: { type: "array", items: UNIT_SCHEMA } }) },
  milestones: JS_STRS,
});
const COURSE_SCHEMA = jsObj({
  overview: JS_STR,
  levels: { type: "array", items: jsObj({
    level: { type: "string", enum: LEVELS },
    summary: JS_STR, entry: JS_STR, exit: JS_STR,
    months: { type: "array", items: jsObj({ title: JS_STR, goal: JS_STR, units: { type: "array", items: UNIT_SCHEMA } }) },
  }) },
});

// JSON-schema constrained generation; retries as plain JSON text for models
// that reject structured outputs (400).
async function callJSON(prompt, schema, onChars) {
  const messages = [{ role: "user", content: prompt }];
  let res;
  try {
    res = await streamAnthropic(messages, 32000, { output_config: { format: { type: "json_schema", schema } } }, onChars);
  } catch (e) {
    if (e.status !== 400) throw e;
    res = await streamAnthropic(messages, 32000, {}, onChars);
  }
  const fail = (code) => { const e = new Error(code); e.code = code; return e; };
  if (res.stopReason === "refusal") throw fail("REFUSAL");
  if (res.stopReason === "max_tokens") throw fail("TRUNCATED");
  const a = res.text.indexOf("{"), b = res.text.lastIndexOf("}");
  return JSON.parse(a >= 0 && b > a ? res.text.slice(a, b + 1) : res.text);
}

const asArr = (v) => (Array.isArray(v) ? v : []);
const asStr = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const normUnit = (u) => ({
  id: crypto.randomUUID(), title: asStr(u?.title), detail: asStr(u?.detail),
  bpmTarget: asStr(u?.bpmTarget), homework: asStr(u?.homework), done: false,
});

const aiErrorText = (e) =>
  e?.code === "NO_API_KEY" ? "커리큘럼을 만들려면 먼저 오른쪽 위 '설정'에서 Anthropic API 키를 입력하세요."
  : e?.code === "TRUNCATED" ? "내용이 길어 응답이 잘렸습니다. 기간이나 월 레슨 횟수를 줄여서 다시 시도하세요."
  : e?.code === "REFUSAL" ? "AI가 이 요청을 처리하지 못했습니다. 기록 내용을 확인한 뒤 다시 시도하세요."
  : "커리큘럼을 생성하지 못했습니다. API 키와 네트워크를 확인한 뒤 다시 시도하세요.";

function buildStudentPrompt(s, flow, opts, prev) {
  const months = Array.from({ length: opts.horizon }, (_, i) => addMonths(opts.start, i));
  const records = flow.map(f =>
    `## ${f.month} (${f.count}회)\n` + f.entries.map(e => lessonLine(e, false)).join("\n")).join("\n\n");
  let prevText = "";
  if (prev?.plan?.length) {
    const done = prev.plan.flatMap(p => p.units.filter(u => u.done).map(u => u.title));
    const todo = prev.plan.flatMap(p => p.units.filter(u => !u.done).map(u => u.title));
    prevText = `\n\n[이전 커리큘럼 진행 상황]\n완료: ${done.join(", ") || "없음"}\n미완료: ${todo.join(", ") || "없음"}\n` +
      "완료한 단원은 반복하지 말고, 미완료 단원 중 여전히 필요한 것은 새 계획에 이어서 넣으세요.";
  }
  return `당신은 경력 많은 드럼 강사입니다. 아래는 학생 한 명의 레슨 기록을 월별로 모은 것입니다(실력 지표는 1~5점).

학생: ${s.student} (${s.academy || "학원 미정"}), 현재 레벨: ${s.level}, 총 ${s.count}회

${records}${prevText}

이 기록을 토대로 이 학생의 커리큘럼을 만들어 주세요.
- overview: 지금까지의 학습 흐름과 앞으로의 방향을 2~3문장으로.
- currentStage: 현재 도달한 단계를 한 문장으로 진단(템포·레벨·강점 근거 포함).
- completed: 기록된 각 달(${flow.map(f => f.month).join(", ")})마다 하나씩, 그 달에 다룬 내용을 한 단원으로 묶어 theme(단원명), topics(다룬 루디먼트·그루브·곡 등 핵심 항목), achievement(그 달의 성취). 기록에 없는 내용은 지어내지 마세요.
- focus: 메모와 실력 지표에서 드러난 보완할 점 2~4개.
- plan: 정확히 ${opts.horizon}개월이며 month는 순서대로 ${months.join(", ")}. 각 달에 goal(그 달 목표)과 units를 정확히 ${opts.perMonth}개(월 레슨 횟수) 작성. 각 unit은 title(회차 주제), detail(레슨에서 할 구체적 연습: 루디먼트·그루브·필인·곡 구간 등), bpmTarget(예: "♩=110", 해당 없으면 빈 문자열), homework(다음 레슨까지 과제). 최근 기록의 과제와 템포에서 자연스럽게 이어지고 달마다 난이도가 점진적으로 오르게 하세요.
- milestones: 계획 기간이 끝났을 때 확인할 수 있는 구체적 도달 목표 3~5개.
모든 문장은 자연스러운 한국어로, 마크다운 기호 없이 쓰세요. JSON 객체 하나로만 답하세요.`;
}

function buildCoursePrompt(flow, opts) {
  const records = flow.map(f =>
    `## ${f.month} (${f.count}회, 학생 ${f.students}명)\n` + f.entries.map(e => lessonLine(e, true)).join("\n")).join("\n\n");
  return `당신은 드럼 교육 과정을 설계하는 베테랑 강사입니다. 아래는 한 강사가 여러 학생에게 진행한 레슨 기록을 월별로 모은 것입니다(실력 지표는 1~5점).

${records}

이 기록에서 실제로 가르친 내용과 학생들이 성장해 온 순서를 분석해서, 이 강사가 앞으로 새 학생에게 그대로 쓸 수 있는 레벨별 표준 커리큘럼으로 체계화해 주세요.
- overview: 기록에서 드러난 지도 방식과 과정 설계 원칙을 2~3문장으로.
- levels: 초급, 중급, 고급 순서로 정확히 3개. 각 레벨에 summary(과정 요약), entry(시작 조건), exit(수료 기준: 템포·곡·기술로 구체적으로), months를 정확히 ${opts.months}개.
- 각 month에 title(단원명), goal(목표), units를 정확히 ${opts.perMonth}개. 각 unit은 title, detail(구체적 연습 내용), bpmTarget(예: "♩=90", 해당 없으면 빈 문자열), homework.
- 기록에 실제로 등장한 루디먼트·그루브·곡·연습법을 최대한 활용하고, 기록이 부족한 레벨(특히 고급)은 앞 단계에서 자연스럽게 이어지는 내용으로 보완하세요.
모든 문장은 자연스러운 한국어로, 마크다운 기호 없이 쓰세요. JSON 객체 하나로만 답하세요.`;
}

const unitLines = (u, i) => [
  `  ${i + 1}회 ${u.done ? "[완료] " : ""}${u.title}${u.bpmTarget ? " (" + u.bpmTarget + ")" : ""}`,
  ...(u.detail ? [`     ${u.detail}`] : []),
  ...(u.homework ? [`     과제: ${u.homework}`] : []),
];

function studentCurrText(c) {
  const L = [`${c.student} 커리큘럼 (${c.academy || "학원 미정"}) · ${c.createdAt.slice(0, 10)} 작성`, ""];
  if (c.overview) L.push(c.overview, "");
  if (c.currentStage) L.push(`현재 단계: ${c.currentStage}`);
  L.push("", "[앞으로의 커리큘럼]");
  c.plan.forEach(p => { L.push(`■ ${p.month} — ${p.goal}`); p.units.forEach((u, i) => L.push(...unitLines(u, i))); });
  if (c.milestones.length) { L.push("", "[도달 목표]"); c.milestones.forEach(m => L.push(`- ${m}`)); }
  if (c.focus.length) { L.push("", "[보완 포인트]"); c.focus.forEach(f => L.push(`- ${f}`)); }
  if (c.completed.length) {
    L.push("", "[지금까지의 과정]");
    c.completed.forEach(x => L.push(`${x.month} ${x.theme} — ${x.topics.join(", ")}`, ...(x.achievement ? [`  성취: ${x.achievement}`] : [])));
  }
  return L.join("\n");
}

function courseText(c) {
  const L = [`레벨별 표준 커리큘럼 · ${c.createdAt.slice(0, 10)} 작성 (기록 ${c.basedOn.lessonCount}회 기준)`, "", c.overview];
  c.levels.forEach(lv => {
    L.push("", `===== ${lv.level} =====`, lv.summary, `시작 조건: ${lv.entry}`, `수료 기준: ${lv.exit}`);
    lv.months.forEach((m, i) => {
      L.push("", `■ ${i + 1}개월차 · ${m.title} — ${m.goal}`);
      m.units.forEach((u, j) => L.push(...unitLines({ ...u, done: false }, j)));
    });
  });
  return L.join("\n");
}

function restoreMessage(r) {
  const parts = [];
  if (r.lessons) parts.push(`기록 ${r.lessons}개`);
  if (r.curricula) parts.push(`커리큘럼 ${r.curricula}개`);
  return parts.length ? `${parts.join(", ")}를 복원했습니다.` : "새로 추가된 기록이 없습니다 (이미 있는 기록).";
}

/* ---------- small ui bits ---------- */
const card = "bg-white rounded-2xl border border-slate-200 shadow-sm";

function StatCard({ label, value, sub }) {
  return (
    <div className={card + " p-5"}>
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-800 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function App() {
  const [lessons, setLessons] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [selStudent, setSelStudent] = useState(null);
  const [editing, setEditing] = useState(null); // entry being added/edited
  const [flt, setFlt] = useState({ academy: "", student: "" });
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [loadWarn, setLoadWarn] = useState(false);
  const [curricula, setCurriculaState] = useState({});
  const [currKey, setCurrKey] = useState("");
  // functional updates keep async AI results from clobbering edits made meanwhile
  const setCurricula = (fn) => setCurriculaState(prev => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    saveCurricula(next);
    return next;
  });
  const fileRef = useRef(null);

  useEffect(() => {
    loadData().then(res => {
      setLessons(res.data);
      setCurriculaState(loadCurricula());
      if (res.corrupt) setLoadWarn(true);
      setReady(true);
    });
  }, []);

  const persist = async (list) => {
    setSaveState("saving");
    const ok = await saveData(list);
    setSaveState(ok ? "saved" : "error");
  };
  const commit = (next) => { setLessons(next); persist(next); };

  const students = useMemo(() => {
    const m = {};
    lessons.forEach(l => {
      const key = `${l.academy}||${l.student}`;
      if (!l.student) return;
      if (!m[key]) m[key] = { academy: l.academy, student: l.student, entries: [] };
      m[key].entries.push(l);
    });
    return Object.values(m).map(s => ({
      ...s,
      entries: [...s.entries].sort((a, b) => a.date.localeCompare(b.date)),
      count: s.entries.length,
      level: [...s.entries].sort((a, b) => b.date.localeCompare(a.date))[0]?.level,
    }));
  }, [lessons]);

  const academies = useMemo(
    () => [...new Set(lessons.map(l => l.academy).filter(Boolean))], [lessons]);

  /* ---------- add / edit ---------- */
  const startAdd = () => { setEditing(emptyEntry()); setTab("form"); };
  const startEdit = (e) => { setEditing({ ...e, skills: { ...e.skills } }); setTab("form"); };
  const saveEntry = () => {
    if (!editing.student.trim()) { alert("학생 이름을 입력하세요."); return; }
    if (!editing.date) { alert("날짜를 입력하세요."); return; }
    const exists = lessons.some(l => l.id === editing.id);
    const next = exists ? lessons.map(l => l.id === editing.id ? editing : l)
                        : [...lessons, editing];
    commit(next);
    setEditing(null); setTab("list");
  };
  const removeEntry = (id) => {
    if (!confirm("이 레슨 기록을 삭제할까요?")) return;
    commit(lessons.filter(l => l.id !== id));
  };

  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState("");
  const [batch, setBatch] = useState([]);

  const clamp = (n) => { const v = Number(n); return v >= 1 && v <= 5 ? v : 3; };

  const normalize = (p) => ({
    id: crypto.randomUUID(),
    date: p.date || new Date().toISOString().slice(0, 10),
    academy: p.academy || "",
    student: p.student || "",
    content: p.content || "",
    homework: p.homework || "",
    memo: p.memo || "",
    level: LEVELS.includes(p.level) ? p.level : "초급",
    bpm: p.bpm ?? "",
    skills: {
      리듬: clamp(p.skills?.리듬), 테크닉: clamp(p.skills?.테크닉),
      독보: clamp(p.skills?.독보), 표현: clamp(p.skills?.표현), 완성도: clamp(p.skills?.완성도),
    },
  });

  const applyParse = async (src, failMsg) => {
    setParsing(true); setParseErr("");
    try {
      const arr = await parseImage(src);
      if (arr.length > 1) {
        setBatch(arr.map(normalize));
        setEditing(null);
        setTab("batch");
      } else {
        const p = arr[0] || {};
        setEditing(cur => ({
          ...cur,
          date: p.date || cur.date,
          academy: p.academy || cur.academy,
          student: p.student || cur.student,
          content: p.content || cur.content,
          homework: p.homework || cur.homework,
          memo: p.memo || cur.memo,
          level: LEVELS.includes(p.level) ? p.level : cur.level,
          bpm: p.bpm ?? cur.bpm,
          skills: {
            리듬: clamp(p.skills?.리듬), 테크닉: clamp(p.skills?.테크닉),
            독보: clamp(p.skills?.독보), 표현: clamp(p.skills?.표현), 완성도: clamp(p.skills?.완성도),
          },
        }));
      }
    } catch (e) {
      setParseErr(e && e.code === "NO_API_KEY"
        ? "AI 자동 인식을 쓰려면 먼저 오른쪽 위 '설정'에서 Anthropic API 키를 입력하세요. (키 없이도 아래에 직접 입력해 저장할 수 있어요.)"
        : failMsg);
    }
    setParsing(false);
  };
  const onImage = (file) => {
    if (!file) return;
    applyParse(file, "사진에서 내용을 읽지 못했습니다. 더 선명한 사진으로 다시 시도하거나 아래에 직접 입력하세요.");
  };
  const onDrawing = (base64) => {
    applyParse({ base64, mediaType: "image/png" },
      "필기를 읽지 못했습니다. 더 또렷하게 다시 쓰거나 아래에 직접 입력하세요.");
  };

  const saveBatch = () => {
    const valid = batch.filter(b => b.student.trim() && b.date);
    if (!valid.length) { alert("저장할 항목이 없습니다. 학생 이름과 날짜를 확인하세요."); return; }
    commit([...lessons, ...valid]);
    setBatch([]); setTab("list");
  };

  /* ---------- backup / restore ---------- */
  const buildJSON = () => JSON.stringify({ version: 2, lessons, curricula }, null, 2);
  const buildCSV = () => {
    const head = ["날짜","학원","학생","레슨내용","다음과제","메모",...SKILL_KEYS,"레벨","BPM"];
    const rows = lessons.map(l => [
      l.date, l.academy, l.student, l.content, l.homework, l.memo,
      ...SKILL_KEYS.map(k => l.skills?.[k] ?? ""), l.level, l.bpm ?? "",
    ].map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    return "﻿" + [head.join(","), ...rows].join("\n");
  };
  const dl = (text, name, type) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch { return false; }
  };
  // accepts old backups (bare lesson array) and v2 ({ version, lessons, curricula }).
  // returns counts added { lessons, curricula }, or -1 on parse error
  const restoreFromText = (text) => {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : Array.isArray(data?.lessons) ? data.lessons : null;
      if (!list) return -1;
      const ids = new Set(lessons.map(l => l.id));
      const add = list.filter(a => a && a.id && !ids.has(a.id));
      if (add.length) commit([...lessons, ...add]);
      const incoming = !Array.isArray(data) && data.curricula && typeof data.curricula === "object" ? data.curricula : {};
      const take = Object.entries(incoming).filter(([k, v]) =>
        v && v.createdAt && (!curricula[k] || v.createdAt > curricula[k].createdAt));
      if (take.length) setCurricula(prev => ({ ...prev, ...Object.fromEntries(take) }));
      return { lessons: add.length, curricula: take.length };
    } catch { return -1; }
  };
  const importFile = (file) => {
    const r = new FileReader();
    r.onload = () => {
      const res = restoreFromText(String(r.result));
      alert(res === -1 ? "올바른 백업(JSON) 내용이 아닙니다." : restoreMessage(res));
    };
    r.readAsText(file);
  };

  if (!ready) return (
    <div className="min-h-screen grid place-items-center text-slate-400">
      <Loader2 className="animate-spin" />
    </div>
  );

  const NAV = [
    { k: "dashboard", label: "지표", icon: LayoutDashboard },
    { k: "list", label: "전체 기록", icon: List },
    { k: "students", label: "학생별", icon: Users },
    { k: "report", label: "월별 리포트", icon: FileText },
    { k: "curriculum", label: "커리큘럼", icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none"
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <style>{`
        button, canvas, label, .select-none, .select-none * {
          -webkit-user-select: none; user-select: none;
          -webkit-touch-callout: none;
        }
        button, a, canvas { -webkit-user-drag: none; }
        input, textarea, select, [contenteditable="true"] {
          -webkit-user-select: text; user-select: text; -webkit-touch-callout: default;
        }
      `}</style>
      {/* top bar */}
      <header className="sticky top-0 z-20 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 grid place-items-center text-slate-900">
            <Music4 size={20} />
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none">레슨 로그</div>
            <div className="text-[11px] text-slate-400 leading-none mt-0.5">드럼 레슨 관리 · 실력 통계</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SaveChip state={saveState} count={lessons.length} />
            <button onClick={() => { setTab("settings"); setSelStudent(null); }} className="text-xs px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 text-slate-300">
              <Settings size={14} /> 설정
            </button>
            <button onClick={() => { setTab("data"); setSelStudent(null); }} className="text-xs px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-1.5 text-slate-300">
              <Download size={14} /> 백업·복원
            </button>
            <button onClick={startAdd}
              className="ml-1 text-sm font-semibold px-4 py-2 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 flex items-center gap-1.5">
              <PlusCircle size={16} /> 레슨 추가
            </button>
          </div>
        </div>
        {tab !== "form" && tab !== "batch" && tab !== "data" && tab !== "settings" && (
          <div className="max-w-6xl mx-auto px-4 flex gap-1">
            {NAV.map(n => (
              <button key={n.k}
                onClick={() => { setTab(n.k); setSelStudent(null); }}
                className={"px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px " +
                  (tab === n.k ? "border-amber-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200")}>
                <n.icon size={15} /> {n.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loadWarn && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            저장된 데이터를 읽는 중 문제가 있었습니다. 새 기록을 저장하기 전에, 백업 파일이 있다면 "백업·복원"에서 복원해 주세요.
            <button onClick={() => setLoadWarn(false)} className="ml-2 underline">닫기</button>
          </div>
        )}
        {lessons.length === 0 && ["dashboard", "list", "students", "report", "curriculum"].includes(tab) && (
          <div className={card + " p-10 text-center"}>
            <div className="text-slate-800 font-semibold text-lg">아직 기록이 없습니다</div>
            <p className="text-slate-500 mt-1 text-sm">레슨 노트 사진을 올려 자동으로 정리하거나, 예시 데이터로 먼저 둘러보세요.</p>
            <div className="mt-5 flex gap-2 justify-center">
              <button onClick={startAdd} className="px-4 py-2 rounded-lg bg-amber-500 text-slate-900 font-semibold text-sm">레슨 추가</button>
              <button onClick={() => commit(SAMPLE())} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">예시 데이터 채우기</button>
            </div>
          </div>
        )}

        {tab === "dashboard" && lessons.length > 0 &&
          <Dashboard lessons={lessons} students={students} />}
        {tab === "list" && lessons.length > 0 &&
          <ListView lessons={lessons} flt={flt} setFlt={setFlt} academies={academies}
            onEdit={startEdit} onDelete={removeEntry} />}
        {tab === "students" && lessons.length > 0 && !selStudent &&
          <StudentGrid students={students} onOpen={setSelStudent} />}
        {tab === "students" && selStudent &&
          <StudentDetail s={students.find(x => x.student === selStudent.student && x.academy === selStudent.academy)}
            onBack={() => setSelStudent(null)} onEdit={startEdit} onDelete={removeEntry}
            onCurriculum={(st) => { setCurrKey(studentKey(st)); setSelStudent(null); setTab("curriculum"); }} />}
        {tab === "report" && lessons.length > 0 &&
          <MonthlyReport lessons={lessons} students={students} />}
        {tab === "curriculum" && lessons.length > 0 &&
          <CurriculumPage lessons={lessons} students={students}
            curricula={curricula} setCurricula={setCurricula} initialKey={currKey} />}
        {tab === "batch" && batch.length > 0 &&
          <BatchReview batch={batch} setBatch={setBatch} onSaveAll={saveBatch}
            onCancel={() => { setBatch([]); setTab("list"); }}
            academies={academies} students={students} />}
        {tab === "form" && editing &&
          <EntryForm editing={editing} setEditing={setEditing} onSave={saveEntry}
            onCancel={() => { setEditing(null); setTab("list"); }}
            onImage={onImage} onDrawing={onDrawing} parsing={parsing} parseErr={parseErr}
            academies={academies} students={students} />}
        {tab === "settings" &&
          <SettingsPage onBack={() => setTab("dashboard")} />}
        {tab === "data" &&
          <DataPage
            jsonText={buildJSON()} csvText={buildCSV()} count={lessons.length}
            onDownload={dl} onRestoreText={restoreFromText} onRestoreFile={importFile}
            onBack={() => setTab("dashboard")} />}
      </main>
    </div>
  );
}

/* ================= Save status chip ================= */
function SaveChip({ state, count }) {
  const map = {
    idle: { t: `${count}개 저장됨`, c: "text-slate-400" },
    saving: { t: "저장 중…", c: "text-amber-300" },
    saved: { t: `저장됨 · ${count}개`, c: "text-emerald-300" },
    error: { t: "저장 실패", c: "text-rose-300" },
  };
  const s = map[state] || map.idle;
  return <span className={"text-[11px] " + s.c}>{s.t}</span>;
}

/* ================= Backup / restore (full page) ================= */
function DataPage({ jsonText, csvText, count, onDownload, onRestoreText, onRestoreFile, onBack }) {
  const [copied, setCopied] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label); setShowManual(false); setTimeout(() => setCopied(""), 2000);
    } catch {
      setShowManual(true);
    }
  };
  const doRestore = () => {
    const r = onRestoreText(pasteVal.trim());
    if (r === -1) setMsg("붙여넣은 내용이 올바른 백업(JSON)이 아닙니다.");
    else { setMsg(restoreMessage(r)); setPasteVal(""); }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800">
        <ChevronLeft size={16} /> 돌아가기
      </button>
      <div>
        <h2 className="text-2xl font-bold text-slate-800">백업 · 복원</h2>
        <p className="text-slate-500 text-sm mt-1">현재 {count}개 기록. 기기 이동이나 만일에 대비해 가끔 백업해 두세요.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Backup */}
        <div className={card + " p-6 space-y-4"}>
          <div>
            <div className="font-semibold text-slate-800">백업하기</div>
            <p className="text-sm text-slate-500 mt-1">복사한 뒤 메모·메일·파일 앱에 붙여넣어 보관하세요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy(jsonText, "json")}
              className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5">
              <Save size={15} /> {copied === "json" ? "복사됨!" : "백업 복사 (JSON)"}
            </button>
            <button onClick={() => copy(csvText, "csv")}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm flex items-center gap-1.5">
              {copied === "csv" ? "복사됨!" : "표 복사 (CSV)"}
            </button>
            <button onClick={() => { if (!onDownload(jsonText, "레슨기록.json", "application/json")) setShowManual(true); }}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm flex items-center gap-1.5 text-slate-600">
              <Download size={15} /> 파일로 저장
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500">백업 내용 미리보기</span>
              {!showManual && <button onClick={() => setShowManual(true)} className="text-xs text-slate-400 hover:text-slate-600">직접 복사하기</button>}
            </div>
            <textarea readOnly value={jsonText} onFocus={e => e.target.select()}
              className="w-full h-64 text-[11px] border border-slate-300 rounded-lg p-3 font-mono bg-slate-50" />
            {showManual && <p className="text-xs text-slate-500 mt-1">위 칸을 클릭 → 전체 선택 → 복사해서 보관하세요.</p>}
          </div>
        </div>

        {/* Restore */}
        <div className={card + " p-6 space-y-4"}>
          <div>
            <div className="font-semibold text-slate-800">복원하기</div>
            <p className="text-sm text-slate-500 mt-1">백업해 둔 JSON 내용을 붙여넣고 복원하세요. 같은 기록은 중복 없이 합쳐집니다.</p>
          </div>
          <textarea value={pasteVal} onChange={e => setPasteVal(e.target.value)}
            placeholder="여기에 백업(JSON) 내용을 붙여넣기…"
            className="w-full h-64 text-[11px] border border-slate-300 rounded-lg p-3 font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <div className="flex flex-wrap gap-2">
            <button onClick={doRestore} disabled={!pasteVal.trim()}
              className="px-4 py-2.5 rounded-lg bg-amber-500 text-slate-900 text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5">
              <Upload size={15} /> 붙여넣기로 복원
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">파일에서 복원</button>
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="hidden"
              onChange={e => { if (e.target.files[0]) onRestoreFile(e.target.files[0]); e.target.value = ""; }} />
          </div>
          {msg && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ lessons, students }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthCount = lessons.filter(l => l.date.startsWith(thisMonth)).length;

  const levelData = LEVELS.map(lv => ({
    name: lv, value: students.filter(s => s.level === lv).length,
  }));
  const perStudent = students.map(s => ({ name: s.student, 레슨: s.count }))
    .sort((a, b) => b.레슨 - a.레슨).slice(0, 8);
  const avgSkill = SKILL_KEYS.map(k => {
    const vals = lessons.map(l => l.skills?.[k]).filter(v => v != null);
    return { skill: k, value: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0 };
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 레슨 수" value={lessons.length} />
        <StatCard label="수강생" value={students.length} sub={`학원 ${new Set(lessons.map(l=>l.academy).filter(Boolean)).size}곳`} />
        <StatCard label="이번 달 레슨" value={monthCount} sub={thisMonth} />
        <StatCard label="평균 완성도" value={avgSkill.find(a=>a.skill==="완성도")?.value ?? "-"} sub="5점 만점" />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={card + " p-5"}>
          <h3 className="font-semibold text-slate-700 mb-3">레벨별 수강생 분포</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={levelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {levelData.map((_, i) => <Cell key={i} fill={["#94a3b8","#0d9488","#d97706"][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={card + " p-5"}>
          <h3 className="font-semibold text-slate-700 mb-3">전체 평균 실력</h3>
          <ResponsiveContainer width="100%" height={230}>
            <RadarChart data={avgSkill} outerRadius={85}>
              <PolarGrid />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
              <Radar dataKey="value" stroke="#d97706" fill="#d97706" fillOpacity={0.35} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card + " p-5"}>
        <h3 className="font-semibold text-slate-700 mb-3">수강생별 누적 레슨 수</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={perStudent} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="레슨" fill="#0d9488" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ================= Monthly report ================= */
function MonthlyReport({ lessons, students }) {
  const months = useMemo(
    () => [...new Set(lessons.map(l => l.date.slice(0, 7)))].sort().reverse(), [lessons]);
  const [month, setMonth] = useState(months[0]);
  const [aiText, setAiText] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = lessons.filter(l => l.date.startsWith(month));
  const byStudent = useMemo(() => {
    const m = {};
    rows.forEach(l => { (m[l.student] ||= []).push(l); });
    return Object.entries(m).map(([student, es]) => {
      const sorted = [...es].sort((a, b) => a.date.localeCompare(b.date));
      const growth = SKILL_KEYS.map(k => {
        const f = sorted[0].skills?.[k] ?? 0, la = sorted[sorted.length - 1].skills?.[k] ?? 0;
        return { k, delta: +(la - f) };
      });
      return {
        student, academy: es[0].academy, count: es.length,
        level: sorted[sorted.length - 1].level, growth,
        bpmFrom: sorted.find(x => x.bpm)?.bpm, bpmTo: [...sorted].reverse().find(x => x.bpm)?.bpm,
      };
    }).sort((a, b) => b.count - a.count);
  }, [rows]);

  // month-over-month trend (lesson counts across all months)
  const trend = [...new Set(lessons.map(l => l.date.slice(0, 7)))].sort().map(mo => ({
    month: mo.slice(2), 레슨: lessons.filter(l => l.date.startsWith(mo)).length,
  }));

  const writeSummary = async () => {
    setBusy(true); setAiText("");
    const facts = byStudent.map(s =>
      `- ${s.student}(${s.academy||"학원미정"}, ${s.count}회, 레벨 ${s.level}): ` +
      s.growth.map(g => `${g.k} ${g.delta >= 0 ? "+" : ""}${g.delta}`).join(", ") +
      (s.bpmFrom && s.bpmTo ? `, 템포 ${s.bpmFrom}→${s.bpmTo}` : "")).join("\n");
    const prompt =
      `${month} 드럼 레슨 월별 리포트를 작성해 주세요. 아래는 학생별 집계입니다(실력은 1~5점 변화량).\n\n${facts}\n\n` +
      "학원 원장이나 학부모가 읽을 수 있는 자연스러운 한국어 문단으로, 이번 달 총평, 성장이 두드러진 학생, 관심이 필요한 학생, 다음 달 지도 방향을 3~4문단으로 정리해 주세요. 마크다운 기호 없이 문단으로만 쓰세요.";
    try {
      const data = await callAnthropic([{ role: "user", content: prompt }], 1500);
      setAiText(data.content.filter(c => c.type === "text").map(c => c.text).join("\n").trim());
    } catch (e) {
      setAiText(e && e.code === "NO_API_KEY"
        ? "AI 총평을 쓰려면 먼저 오른쪽 위 '설정'에서 Anthropic API 키를 입력하세요."
        : "요약을 생성하지 못했습니다. 키가 올바른지 확인 후 다시 시도하세요.");
    }
    setBusy(false);
  };

  const copyReport = () => {
    const lines = [`${month} 레슨 리포트`, "", `총 ${rows.length}회 · 수강생 ${byStudent.length}명`, ""];
    byStudent.forEach(s => {
      lines.push(`■ ${s.student} (${s.academy}) — ${s.count}회, 레벨 ${s.level}`);
      lines.push("  실력변화: " + s.growth.map(g => `${g.k} ${g.delta >= 0 ? "+" : ""}${g.delta}`).join(", ")
        + (s.bpmFrom && s.bpmTo ? ` · 템포 ${s.bpmFrom}→${s.bpmTo}` : ""));
    });
    if (aiText) { lines.push("", "총평", aiText); }
    navigator.clipboard.writeText(lines.join("\n"));
  };

  const monthSel = "border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={monthSel} value={month} onChange={e => { setMonth(e.target.value); setAiText(""); }}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-sm text-slate-400">{rows.length}회 · 수강생 {byStudent.length}명</span>
        <div className="ml-auto flex gap-2">
          <button onClick={writeSummary} disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
            {busy ? "작성 중…" : "AI 총평 작성"}
          </button>
          <button onClick={copyReport} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">복사</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <StatCard label="이번 달 레슨" value={rows.length} sub={month} />
        <StatCard label="수강생" value={byStudent.length} />
        <StatCard label="가장 많이 온 학생" value={byStudent[0]?.student || "-"} sub={byStudent[0] ? `${byStudent[0].count}회` : ""} />
      </div>

      <div className={card + " p-5"}>
        <h3 className="font-semibold text-slate-700 mb-3">월별 레슨 추이</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="레슨" radius={[6, 6, 0, 0]}>
              {trend.map((t, i) => <Cell key={i} fill={t.month === month.slice(2) ? "#d97706" : "#cbd5e1"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {aiText && (
        <div className={card + " p-5"}>
          <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Sparkles size={15} className="text-amber-500" /> 이번 달 총평</h3>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{aiText}</p>
        </div>
      )}

      <div className={card + " p-5"}>
        <h3 className="font-semibold text-slate-700 mb-3">학생별 성장 요약</h3>
        <div className="space-y-3">
          {byStudent.map(s => (
            <div key={s.student} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{s.student}</span>
                <span className="text-xs text-slate-400">{s.academy}</span>
                <LevelPill level={s.level} />
                <span className="text-xs text-slate-400">{s.count}회</span>
                {s.bpmFrom && s.bpmTo && <span className="text-xs text-amber-600">♩ {s.bpmFrom}→{s.bpmTo}</span>}
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {s.growth.map(g => (
                  <span key={g.k} className={"text-xs px-2 py-0.5 rounded-full font-medium " +
                    (g.delta > 0 ? "bg-teal-100 text-teal-700" : g.delta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500")}>
                    {g.k} {g.delta > 0 ? "+" : ""}{g.delta}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= Curriculum ================= */
function CurriculumPage({ lessons, students, curricula, setCurricula, initialKey }) {
  const sorted = useMemo(() => [...students].sort((a, b) => b.count - a.count), [students]);
  const [mode, setMode] = useState("student"); // student | course
  const [selKey, setSelKey] = useState(initialKey || (sorted[0] ? studentKey(sorted[0]) : ""));
  const seg = (m, label, Icon) => (
    <button onClick={() => setMode(m)}
      className={"px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 " +
        (mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}>
      <Icon size={15} /> {label}
    </button>
  );
  return (
    <div className="space-y-5">
      <div className="inline-flex p-1 rounded-xl bg-slate-200/70">
        {seg("student", "학생별 커리큘럼", Users)}
        {seg("course", "레벨별 표준 과정", GraduationCap)}
      </div>
      {mode === "student"
        ? <StudentCurriculum sorted={sorted} selKey={selKey} setSelKey={setSelKey}
            curricula={curricula} setCurricula={setCurricula} />
        : <CourseCurriculum lessons={lessons} curricula={curricula} setCurricula={setCurricula} />}
    </div>
  );
}

const optSel = "border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50";

function OptField({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function GenButton({ busy, exists, onClick }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="ml-auto px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
      {busy ? <Loader2 className="animate-spin" size={15} /> : exists ? <RefreshCw size={15} /> : <Sparkles size={15} />}
      {busy ? "생성 중…" : exists ? "다시 생성" : "AI 커리큘럼 생성"}
    </button>
  );
}

function GenStatus({ busy, chars }) {
  if (!busy) return null;
  return (
    <div className={card + " p-4 flex items-center gap-3 text-sm text-slate-600"}>
      <Loader2 className="animate-spin text-amber-500 shrink-0" size={18} />
      <span>{chars
        ? `커리큘럼 작성 중… ${chars.toLocaleString()}자`
        : "월별 기록을 분석하는 중… 보통 1분 안팎 걸려요. 다른 탭으로 옮겨도 계속 진행됩니다."}</span>
    </div>
  );
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: pct + "%" }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-10 text-right">{done}/{total}</span>
    </div>
  );
}

function UnitList({ units, onToggle }) {
  return (
    <ol className="space-y-2">
      {units.map((u, i) => (
        <li key={u.id} className={"flex gap-3 p-3 rounded-xl border " +
          (u.done ? "bg-slate-50 border-slate-100" : "bg-white border-slate-200")}>
          {onToggle ? (
            <button onClick={() => onToggle(u.id)} aria-label={u.done ? "완료 취소" : "완료 표시"}
              className="shrink-0 w-9 h-9 -m-1.5 grid place-items-center">
              {u.done ? <CheckCircle2 size={22} className="text-teal-600" /> : <Circle size={22} className="text-slate-300" />}
            </button>
          ) : (
            <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold grid place-items-center tabular-nums">{i + 1}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              {onToggle && <span className="text-xs text-slate-400 tabular-nums">{i + 1}회</span>}
              <span className={"font-medium " + (u.done ? "line-through text-slate-400" : "text-slate-800")}>{u.title}</span>
              {u.bpmTarget && <span className="text-xs font-medium text-amber-600">{u.bpmTarget}</span>}
            </div>
            {u.detail && <p className={"text-sm mt-0.5 leading-relaxed " + (u.done ? "text-slate-400" : "text-slate-600")}>{u.detail}</p>}
            {u.homework && <p className="text-xs text-teal-700 mt-1">과제 · {u.homework}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MonthlyFlow({ flow, withNames }) {
  return (
    <div className={card + " p-5"}>
      <h3 className="font-semibold text-slate-700">월별 레슨 기록</h3>
      <p className="text-xs text-slate-400 mb-4">커리큘럼은 이 기록을 근거로 만들어집니다.</p>
      <div className="space-y-4">
        {flow.map(f => {
          const shown = withNames ? f.entries.slice(0, 6) : f.entries;
          return (
            <div key={f.month} className="flex gap-3">
              <div className="w-16 shrink-0 text-sm font-semibold tabular-nums text-slate-600 pt-0.5">{f.month}</div>
              <div className="flex-1 min-w-0 border-l-2 border-slate-200 pl-3">
                <div className="flex flex-wrap gap-x-2.5 gap-y-1 items-center text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{f.count}회</span>
                  {withNames
                    ? <>
                        <span>학생 {f.students}명</span>
                        {LEVELS.filter(l => f.levels[l]).map(l => <span key={l}>{l} {f.levels[l]}</span>)}
                      </>
                    : <LevelPill level={f.level} />}
                  {f.bpmMin != null && (
                    <span className="text-amber-600">♩ {f.bpmMin === f.bpmMax ? f.bpmMin : `${f.bpmMin}~${f.bpmMax}`}</span>
                  )}
                  {!withNames && SKILL_KEYS.map((sk, i) => f.avg[sk] != null && (
                    <span key={sk} style={{ color: SKILL_COLORS[i] }}>{sk} {f.avg[sk]}</span>
                  ))}
                </div>
                <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
                  {shown.map(e => (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-slate-400 tabular-nums shrink-0">{e.date.slice(5)}</span>
                      {withNames && <span className="text-slate-500 shrink-0">{e.student}</span>}
                      <span className="min-w-0">{e.content || "-"}</span>
                    </li>
                  ))}
                </ul>
                {shown.length < f.entries.length && (
                  <div className="text-xs text-slate-400 mt-1">외 {f.entries.length - shown.length}건</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { alert("복사하지 못했습니다. 브라우저 권한을 확인하세요."); }
  };
  return [copied, copy];
}

function CurrHeader({ title, sub, stale, copied, onCopy, onDelete, children }) {
  return (
    <div className={card + " p-5 space-y-3"}>
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onCopy} className="px-3 py-2 rounded-lg border border-slate-300 text-sm flex items-center gap-1.5">
            <Copy size={14} /> {copied ? "복사됨!" : "복사"}
          </button>
          <button onClick={onDelete} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-500 hover:text-rose-600 flex items-center gap-1.5">
            <Trash2 size={14} /> 삭제
          </button>
        </div>
      </div>
      {stale > 0 && (
        <div className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
          이 커리큘럼을 만든 뒤 새 기록이 {stale}개 추가됐어요. "다시 생성"하면 반영됩니다.
        </div>
      )}
      {children}
    </div>
  );
}

function StudentCurriculum({ sorted, selKey, setSelKey, curricula, setCurricula }) {
  const s = sorted.find(x => studentKey(x) === selKey) || sorted[0];
  const k = s ? studentKey(s) : "";
  const flow = useMemo(() => (s ? monthlyFlow(s.entries) : []), [s]);
  const avgPerMonth = flow.length ? clampInt(s.count / flow.length, 1, 8) : 4;
  const [horizon, setHorizon] = useState(3);
  const [perMonth, setPerMonth] = useState(avgPerMonth);
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [err, setErr] = useState("");
  const [copied, copy] = useCopy();
  useEffect(() => { setPerMonth(avgPerMonth); setErr(""); }, [k]);
  if (!s) return null;

  const cur = curricula[k];
  const start = planStart(flow[flow.length - 1].month);
  const allUnits = cur ? cur.plan.flatMap(p => p.units) : [];
  const doneCount = allUnits.filter(u => u.done).length;

  const generate = async () => {
    if (doneCount && !confirm("새 계획으로 다시 만듭니다. 완료 체크한 단원은 새 커리큘럼에 반영돼요. 계속할까요?")) return;
    const target = k, h = horizon, pm = perMonth, st = start, snap = s, fl = flow;
    setBusy(true); setErr(""); setChars(0);
    try {
      const raw = await callJSON(buildStudentPrompt(snap, fl, { horizon: h, perMonth: pm, start: st }, cur),
        STUDENT_CURR_SCHEMA, setChars);
      const months = Array.from({ length: h }, (_, i) => addMonths(st, i));
      const next = {
        key: target, student: snap.student, academy: snap.academy,
        createdAt: new Date().toISOString(),
        basedOn: { lessonCount: snap.count, lastDate: snap.entries[snap.entries.length - 1].date, months: fl.map(f => f.month) },
        horizon: h, perMonth: pm,
        overview: asStr(raw.overview), currentStage: asStr(raw.currentStage),
        completed: asArr(raw.completed).map(x => ({
          month: asStr(x?.month), theme: asStr(x?.theme), topics: asArr(x?.topics).map(asStr), achievement: asStr(x?.achievement),
        })),
        focus: asArr(raw.focus).map(asStr),
        plan: asArr(raw.plan).slice(0, h).map((p, i) => ({ month: months[i], goal: asStr(p?.goal), units: asArr(p?.units).map(normUnit) })),
        milestones: asArr(raw.milestones).map(asStr),
      };
      if (!next.plan.length) throw new Error("EMPTY");
      setCurricula(prev => ({ ...prev, [target]: next }));
    } catch (e) { setErr(aiErrorText(e)); }
    setBusy(false);
  };

  const toggle = (uid) => setCurricula(prev => {
    const c = prev[k]; if (!c) return prev;
    return { ...prev, [k]: { ...c, plan: c.plan.map(p => ({ ...p, units: p.units.map(u => u.id === uid ? { ...u, done: !u.done } : u) })) } };
  });
  const remove = () => {
    if (!confirm(`${s.student} 학생의 커리큘럼을 삭제할까요?`)) return;
    setCurricula(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  return (
    <div className="space-y-5">
      <div className={card + " p-4 space-y-2"}>
        <div className="flex flex-wrap items-end gap-3">
          <OptField label="학생">
            <select className={optSel} value={k} disabled={busy} onChange={e => setSelKey(e.target.value)}>
              {sorted.map(x => (
                <option key={studentKey(x)} value={studentKey(x)}>
                  {x.student}{x.academy ? ` · ${x.academy}` : ""} ({x.count}회)
                </option>
              ))}
            </select>
          </OptField>
          <OptField label="계획 기간">
            <select className={optSel} value={horizon} disabled={busy} onChange={e => setHorizon(Number(e.target.value))}>
              {[1, 2, 3, 6].map(n => <option key={n} value={n}>{n}개월</option>)}
            </select>
          </OptField>
          <OptField label="월 레슨 횟수">
            <select className={optSel} value={perMonth} disabled={busy} onChange={e => setPerMonth(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}회{n === avgPerMonth ? " (기록 평균)" : ""}</option>)}
            </select>
          </OptField>
          <GenButton busy={busy} exists={!!cur} onClick={generate} />
        </div>
        <p className="text-xs text-slate-400">
          {flow.length}개월 · {s.count}회 기록을 바탕으로 {start}부터 {horizon}개월 계획을 만듭니다.
        </p>
      </div>

      <GenStatus busy={busy} chars={chars} />
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>}

      {cur ? (
        <>
          <CurrHeader
            title={`${cur.student} 커리큘럼`}
            sub={`${cur.createdAt.slice(0, 10)} 작성 · 기록 ${cur.basedOn.lessonCount}회 기준 · ${cur.plan[0]?.month} ~ ${cur.plan[cur.plan.length - 1]?.month}`}
            stale={s.count - (cur.basedOn?.lessonCount || 0)}
            copied={copied} onCopy={() => copy(studentCurrText(cur))} onDelete={remove}>
            {cur.overview && <p className="text-sm text-slate-700 leading-relaxed">{cur.overview}</p>}
            {cur.currentStage && (
              <div className="flex gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                <Target size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <span><b className="font-semibold">현재 단계</b> · {cur.currentStage}</span>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-1">전체 진행</div>
              <Progress done={doneCount} total={allUnits.length} />
            </div>
          </CurrHeader>

          <h3 className="font-semibold text-slate-700 flex items-center gap-1.5 px-1 pt-1">
            <CalendarRange size={16} /> 앞으로의 커리큘럼
          </h3>
          {cur.plan.map((p, pi) => (
            <div key={p.month + pi} className={card + " p-5"}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-base font-bold tabular-nums text-slate-800">{p.month}</span>
                <span className="text-xs text-slate-400">{pi + 1}개월차</span>
              </div>
              {p.goal && (
                <div className="flex gap-2 text-sm text-slate-700 mb-3">
                  <Flag size={15} className="text-teal-600 shrink-0 mt-0.5" /> {p.goal}
                </div>
              )}
              <div className="mb-3"><Progress done={p.units.filter(u => u.done).length} total={p.units.length} /></div>
              <UnitList units={p.units} onToggle={toggle} />
            </div>
          ))}

          <div className="grid md:grid-cols-2 gap-5">
            <div className={card + " p-5"}>
              <h3 className="font-semibold text-slate-700 mb-3">지금까지의 과정</h3>
              <div className="space-y-3">
                {cur.completed.map((c, i) => (
                  <div key={i} className="border-l-2 border-amber-300 pl-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs tabular-nums text-slate-400">{c.month}</span>
                      <span className="font-medium text-slate-800">{c.theme}</span>
                    </div>
                    {c.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.topics.map((t, j) => <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>)}
                      </div>
                    )}
                    {c.achievement && <p className="text-xs text-slate-500 mt-1">{c.achievement}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              {cur.milestones.length > 0 && (
                <div className={card + " p-5"}>
                  <h3 className="font-semibold text-slate-700 mb-2">계획을 마치면 도달할 목표</h3>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {cur.milestones.map((m, i) => (
                      <li key={i} className="flex gap-2"><CheckCircle2 size={15} className="text-teal-600 shrink-0 mt-0.5" />{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cur.focus.length > 0 && (
                <div className={card + " p-5"}>
                  <h3 className="font-semibold text-slate-700 mb-2">보완 포인트</h3>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {cur.focus.map((f, i) => <li key={i} className="flex gap-2"><span className="text-rose-400">•</span>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      ) : !busy && (
        <div className={card + " p-6 text-center"}>
          <GraduationCap size={28} className="mx-auto text-slate-300" />
          <div className="font-semibold text-slate-800 mt-2">아직 {s.student} 학생의 커리큘럼이 없습니다</div>
          <p className="text-sm text-slate-500 mt-1">
            위에서 "AI 커리큘럼 생성"을 누르면 아래 월별 기록을 분석해 지금까지의 과정 정리와 다음 달부터의 회차별 계획을 만들어요.
          </p>
        </div>
      )}

      <MonthlyFlow flow={flow} />
    </div>
  );
}

function CourseCurriculum({ lessons, curricula, setCurricula }) {
  const flow = useMemo(() => monthlyFlow(lessons), [lessons]);
  const studentCount = useMemo(() => new Set(lessons.map(studentKey)).size, [lessons]);
  const avgPerMonth = useMemo(() => {
    const pairs = new Set(lessons.map(l => `${studentKey(l)}||${ym(l.date)}`)).size;
    return pairs ? clampInt(lessons.length / pairs, 1, 8) : 4;
  }, [lessons]);
  const [months, setMonths] = useState(3);
  const [perMonth, setPerMonth] = useState(avgPerMonth);
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState(LEVELS[0]);
  const [copied, copy] = useCopy();
  const cur = curricula[COURSE_KEY];

  const generate = async () => {
    const m = months, pm = perMonth;
    setBusy(true); setErr(""); setChars(0);
    try {
      const raw = await callJSON(buildCoursePrompt(flow, { months: m, perMonth: pm }), COURSE_SCHEMA, setChars);
      const got = asArr(raw.levels);
      const levels = LEVELS.map(lv => got.find(x => x?.level === lv)).filter(Boolean).map(lv => ({
        level: lv.level, summary: asStr(lv.summary), entry: asStr(lv.entry), exit: asStr(lv.exit),
        months: asArr(lv.months).slice(0, m).map(mo => ({ title: asStr(mo?.title), goal: asStr(mo?.goal), units: asArr(mo?.units).map(normUnit) })),
      }));
      if (!levels.length) throw new Error("EMPTY");
      setCurricula(prev => ({
        ...prev,
        [COURSE_KEY]: {
          key: COURSE_KEY, createdAt: new Date().toISOString(),
          basedOn: { lessonCount: lessons.length, students: studentCount, months: flow.map(f => f.month) },
          months: m, perMonth: pm, overview: asStr(raw.overview), levels,
        },
      }));
    } catch (e) { setErr(aiErrorText(e)); }
    setBusy(false);
  };
  const remove = () => {
    if (!confirm("레벨별 표준 커리큘럼을 삭제할까요?")) return;
    setCurricula(prev => { const n = { ...prev }; delete n[COURSE_KEY]; return n; });
  };
  const lv = cur ? (cur.levels.find(x => x.level === level) || cur.levels[0]) : null;

  return (
    <div className="space-y-5">
      <div className={card + " p-4 space-y-2"}>
        <div className="flex flex-wrap items-end gap-3">
          <OptField label="레벨당 기간">
            <select className={optSel} value={months} disabled={busy} onChange={e => setMonths(Number(e.target.value))}>
              {[2, 3, 4].map(n => <option key={n} value={n}>{n}개월</option>)}
            </select>
          </OptField>
          <OptField label="월 레슨 횟수">
            <select className={optSel} value={perMonth} disabled={busy} onChange={e => setPerMonth(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}회{n === avgPerMonth ? " (기록 평균)" : ""}</option>)}
            </select>
          </OptField>
          <GenButton busy={busy} exists={!!cur} onClick={generate} />
        </div>
        <p className="text-xs text-slate-400">
          전체 {lessons.length}회 · {flow.length}개월 · 학생 {studentCount}명의 기록을 분석해 초급·중급·고급 표준 과정을 만듭니다.
        </p>
      </div>

      <GenStatus busy={busy} chars={chars} />
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>}

      {cur && lv ? (
        <>
          <CurrHeader
            title="레벨별 표준 커리큘럼"
            sub={`${cur.createdAt.slice(0, 10)} 작성 · 기록 ${cur.basedOn.lessonCount}회 · 학생 ${cur.basedOn.students}명 기준 · 레벨당 ${cur.months}개월`}
            stale={lessons.length - (cur.basedOn?.lessonCount || 0)}
            copied={copied} onCopy={() => copy(courseText(cur))} onDelete={remove}>
            {cur.overview && <p className="text-sm text-slate-700 leading-relaxed">{cur.overview}</p>}
          </CurrHeader>

          <div className="inline-flex p-1 rounded-xl bg-slate-200/70">
            {cur.levels.map(x => (
              <button key={x.level} onClick={() => setLevel(x.level)}
                className={"px-5 py-2 text-sm font-medium rounded-lg " +
                  (lv.level === x.level ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}>
                {x.level}
              </button>
            ))}
          </div>

          <div className={card + " p-5 space-y-3"}>
            <div className="flex items-center gap-2"><LevelPill level={lv.level} /><span className="text-sm text-slate-700">{lv.summary}</span></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500 mb-0.5">시작 조건</div>
                <div className="text-sm text-slate-700">{lv.entry}</div>
              </div>
              <div className="rounded-lg bg-teal-50 p-3">
                <div className="text-xs font-medium text-teal-700 mb-0.5">수료 기준</div>
                <div className="text-sm text-slate-700">{lv.exit}</div>
              </div>
            </div>
          </div>

          {lv.months.map((mo, i) => (
            <div key={i} className={card + " p-5"}>
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <span className="text-xs text-slate-400">{lv.level} {i + 1}개월차</span>
                <span className="text-base font-bold text-slate-800">{mo.title}</span>
              </div>
              {mo.goal && (
                <div className="flex gap-2 text-sm text-slate-700 mb-3">
                  <Flag size={15} className="text-teal-600 shrink-0 mt-0.5" /> {mo.goal}
                </div>
              )}
              <UnitList units={mo.units} />
            </div>
          ))}
        </>
      ) : !busy && (
        <div className={card + " p-6 text-center"}>
          <GraduationCap size={28} className="mx-auto text-slate-300" />
          <div className="font-semibold text-slate-800 mt-2">아직 표준 과정이 없습니다</div>
          <p className="text-sm text-slate-500 mt-1">
            모든 학생의 월별 기록에서 실제로 가르친 내용과 성장 순서를 뽑아, 새 학생에게 쓸 수 있는 초급·중급·고급 과정으로 정리해요.
          </p>
        </div>
      )}

      <MonthlyFlow flow={flow} withNames />
    </div>
  );
}

/* ================= List ================= */
function ListView({ lessons, flt, setFlt, academies, onEdit, onDelete }) {
  const students = [...new Set(lessons.filter(l => !flt.academy || l.academy === flt.academy).map(l => l.student))];
  const rows = lessons
    .filter(l => (!flt.academy || l.academy === flt.academy) && (!flt.student || l.student === flt.student))
    .sort((a, b) => b.date.localeCompare(a.date));
  const sel = "border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white";
  return (
    <div className={card + " p-5"}>
      <div className="flex flex-wrap gap-2 mb-4">
        <select className={sel} value={flt.academy} onChange={e => setFlt({ academy: e.target.value, student: "" })}>
          <option value="">전체 학원</option>
          {academies.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className={sel} value={flt.student} onChange={e => setFlt({ ...flt, student: e.target.value })}>
          <option value="">전체 학생</option>
          {students.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto text-sm text-slate-400 self-center">{rows.length}건</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">날짜</th>
              <th className="py-2 pr-3 font-medium">학원</th>
              <th className="py-2 pr-3 font-medium">학생</th>
              <th className="py-2 pr-3 font-medium">레슨 내용</th>
              <th className="py-2 pr-3 font-medium">레벨</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(l => (
              <tr key={l.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                <td className="py-3 pr-3 tabular-nums whitespace-nowrap text-slate-500">{l.date}</td>
                <td className="py-3 pr-3 whitespace-nowrap">{l.academy}</td>
                <td className="py-3 pr-3 whitespace-nowrap font-medium">{l.student}</td>
                <td className="py-3 pr-3 max-w-md text-slate-600">{l.content}</td>
                <td className="py-3 pr-3"><LevelPill level={l.level} /></td>
                <td className="py-3 whitespace-nowrap">
                  <button onClick={() => onEdit(l)} className="p-1.5 text-slate-400 hover:text-amber-600"><Pencil size={15} /></button>
                  <button onClick={() => onDelete(l.id)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelPill({ level }) {
  const c = { 초급: "bg-slate-100 text-slate-600", 중급: "bg-teal-100 text-teal-700", 고급: "bg-amber-100 text-amber-700" }[level] || "bg-slate-100";
  return <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + c}>{level}</span>;
}

/* ================= Student grid ================= */
function StudentGrid({ students, onOpen }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {students.sort((a, b) => b.count - a.count).map(s => {
        const latest = s.entries[s.entries.length - 1];
        return (
          <button key={s.academy + s.student} onClick={() => onOpen(s)}
            className={card + " p-4 text-left hover:border-amber-400 hover:shadow-md transition"}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-800">{s.student}</div>
              <LevelPill level={s.level} />
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{s.academy}</div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-2xl font-bold tabular-nums text-slate-700">{s.count}</span>
              <span className="text-xs text-slate-400">회 레슨</span>
              {latest?.bpm && <span className="ml-auto text-xs text-slate-400">최근 ♩={latest.bpm}</span>}
            </div>
            <div className="text-xs text-slate-400 mt-1 truncate">최근: {latest?.content}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ================= Student detail ================= */
function StudentDetail({ s, onBack, onEdit, onDelete, onCurriculum }) {
  if (!s) return null;
  const trend = s.entries.map(e => ({
    date: e.date.slice(5), ...e.skills, bpm: Number(e.bpm) || null,
  }));
  const latest = s.entries[s.entries.length - 1];
  const radar = SKILL_KEYS.map(k => ({ skill: k, value: latest.skills?.[k] ?? 0 }));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800">
        <ChevronLeft size={16} /> 학생 목록
      </button>
      <div className="flex items-end gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-slate-800">{s.student}</h2>
        <LevelPill level={s.level} />
        <span className="text-slate-400 text-sm">{s.academy} · 총 {s.count}회</span>
        {onCurriculum && (
          <button onClick={() => onCurriculum(s)}
            className="ml-auto px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5 hover:border-amber-400">
            <GraduationCap size={15} /> 커리큘럼
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={card + " p-5"}>
          <h3 className="font-semibold text-slate-700 mb-3">실력 변화 추이</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              {SKILL_KEYS.map((k, i) => (
                <Line key={k} dataKey={k} stroke={SKILL_COLORS[i]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className={card + " p-5"}>
          <h3 className="font-semibold text-slate-700 mb-3">최근 실력 프로필</h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radar} outerRadius={90}>
              <PolarGrid /><PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
              <Radar dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card + " p-5"}>
        <h3 className="font-semibold text-slate-700 mb-3">템포(BPM) 성장</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend.filter(t => t.bpm)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line dataKey="bpm" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={card + " p-5"}>
        <h3 className="font-semibold text-slate-700 mb-3">레슨 기록</h3>
        <div className="space-y-3">
          {[...s.entries].reverse().map(e => (
            <div key={e.id} className="border-l-2 border-amber-300 pl-3 py-1 group">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums text-slate-500">{e.date}</span>
                {e.bpm && <span className="text-xs text-slate-400">♩={e.bpm}</span>}
                <div className="ml-auto opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => onEdit(e)} className="p-1 text-slate-400 hover:text-amber-600"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(e.id)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="text-sm text-slate-700 mt-0.5">{e.content}</div>
              {e.homework && <div className="text-xs text-teal-700 mt-0.5">다음 과제 · {e.homework}</div>}
              {e.memo && <div className="text-xs text-slate-400 mt-0.5">{e.memo}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= Batch review (multi-student photo) ================= */
function BatchReview({ batch, setBatch, onSaveAll, onCancel, academies, students }) {
  const [openId, setOpenId] = useState(null);
  const inp = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";
  const studentNames = [...new Set(students.map(s => s.student))];
  const upd = (id, k, v) => setBatch(batch.map(b => b.id === id ? { ...b, [k]: v } : b));
  const updSkill = (id, k, v) => setBatch(batch.map(b => b.id === id ? { ...b, skills: { ...b.skills, [k]: Number(v) } } : b));
  const remove = (id) => setBatch(batch.filter(b => b.id !== id));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={onCancel} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800">
        <ChevronLeft size={16} /> 취소
      </button>
      <div className={card + " p-5 bg-amber-50/50 border-amber-200"}>
        <div className="font-semibold text-slate-800">여러 학생이 감지됐습니다 — {batch.length}명</div>
        <p className="text-sm text-slate-500 mt-1">각 항목을 확인·수정한 뒤 한 번에 저장하세요. 필요 없는 항목은 삭제할 수 있습니다.</p>
      </div>

      {batch.map((b, idx) => (
        <div key={b.id} className={card + " p-4"}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs grid place-items-center shrink-0">{idx + 1}</span>
            <input className={inp + " flex-1 font-medium"} list="bnames" value={b.student}
              onChange={e => upd(b.id, "student", e.target.value)} placeholder="학생 이름" />
            <datalist id="bnames">{studentNames.map(s => <option key={s} value={s} />)}</datalist>
            <button onClick={() => remove(b.id)} className="p-1.5 text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={16} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <input type="date" className={inp} value={b.date} onChange={e => upd(b.id, "date", e.target.value)} />
            <input className={inp} list="bacs" value={b.academy} onChange={e => upd(b.id, "academy", e.target.value)} placeholder="학원" />
            <datalist id="bacs">{academies.map(a => <option key={a} value={a} />)}</datalist>
            <select className={inp} value={b.level} onChange={e => upd(b.id, "level", e.target.value)}>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
            <input type="number" className={inp} value={b.bpm} onChange={e => upd(b.id, "bpm", e.target.value)} placeholder="BPM" />
          </div>
          <textarea className={inp + " w-full"} rows={2} value={b.content}
            onChange={e => upd(b.id, "content", e.target.value)} placeholder="레슨 내용" />

          <button onClick={() => setOpenId(openId === b.id ? null : b.id)}
            className="text-xs text-slate-500 mt-2 hover:text-slate-800">
            {openId === b.id ? "간단히 접기" : "과제·메모·실력 지표 펼치기"}
          </button>
          {openId === b.id && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <textarea className={inp + " w-full"} rows={2} value={b.homework} onChange={e => upd(b.id, "homework", e.target.value)} placeholder="다음 과제/목표" />
                <textarea className={inp + " w-full"} rows={2} value={b.memo} onChange={e => upd(b.id, "memo", e.target.value)} placeholder="메모" />
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {SKILL_KEYS.map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-10">{k}</span>
                    <input type="range" min={1} max={5} value={b.skills[k]}
                      onChange={e => updSkill(b.id, k, e.target.value)} style={{ accentColor: SKILL_COLORS[i], width: 80 }} />
                    <span className="text-xs font-semibold w-3 tabular-nums" style={{ color: SKILL_COLORS[i] }}>{b.skills[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2 justify-end sticky bottom-3">
        <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm">취소</button>
        <button onClick={onSaveAll} className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-900 font-semibold text-sm flex items-center gap-1.5 shadow-lg">
          <Save size={16} /> {batch.length}명 모두 저장
        </button>
      </div>
    </div>
  );
}

/* ================= Entry form ================= */
function EntryForm({ editing, setEditing, onSave, onCancel, onImage, onDrawing, parsing, parseErr, academies, students }) {
  const set = (k, v) => setEditing({ ...editing, [k]: v });
  const setSkill = (k, v) => setEditing({ ...editing, skills: { ...editing.skills, [k]: Number(v) } });
  const inp = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";
  const imgRef = useRef(null);
  const [mode, setMode] = useState("photo"); // photo | draw
  const studentNames = [...new Set(students.map(s => s.student))];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onCancel} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800">
        <ChevronLeft size={16} /> 취소
      </button>

      {/* auto-fill: photo or draw */}
      <div className={card + " p-5 border-dashed border-2 border-amber-200 bg-amber-50/40"}>
        <div className="flex items-center gap-2 mb-3">
          <div className="font-semibold text-slate-800 text-sm mr-auto">노트로 자동 채우기</div>
          <div className="inline-flex rounded-lg border border-amber-200 overflow-hidden text-xs">
            <button onClick={() => setMode("photo")}
              className={"px-3 py-1.5 flex items-center gap-1 " + (mode === "photo" ? "bg-amber-500 text-slate-900 font-medium" : "text-slate-500")}>
              <Upload size={13} /> 사진
            </button>
            <button onClick={() => setMode("draw")}
              className={"px-3 py-1.5 flex items-center gap-1 " + (mode === "draw" ? "bg-amber-500 text-slate-900 font-medium" : "text-slate-500")}>
              <PenLine size={13} /> 직접 필기
            </button>
          </div>
        </div>

        {mode === "photo" ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 grid place-items-center text-white shrink-0">
              {parsing ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
            </div>
            <div className="flex-1 text-xs text-slate-500">사진을 올리면 날짜·학생·내용·실력 지표를 자동으로 읽어 채웁니다. 한 장에 여러 학생이 있으면 학생별로 나눠 정리합니다.</div>
            <button onClick={() => imgRef.current?.click()} disabled={parsing}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap">
              {parsing ? "읽는 중…" : "사진 선택"}
            </button>
            <input ref={imgRef} type="file" accept="image/*" className="hidden"
              onChange={e => { onImage(e.target.files[0]); e.target.value = ""; }} />
          </div>
        ) : (
          <DrawPad onRead={onDrawing} parsing={parsing} />
        )}
        {parseErr && <div className="text-xs text-rose-600 mt-2">{parseErr}</div>}
      </div>

      <div className={card + " p-5 space-y-4"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜"><input type="date" className={inp} value={editing.date} onChange={e => set("date", e.target.value)} /></Field>
          <Field label="레벨">
            <select className={inp} value={editing.level} onChange={e => set("level", e.target.value)}>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="학원">
            <input className={inp} list="acs" value={editing.academy} onChange={e => set("academy", e.target.value)} placeholder="학원명" />
            <datalist id="acs">{academies.map(a => <option key={a} value={a} />)}</datalist>
          </Field>
          <Field label="학생">
            <input className={inp} list="sts" value={editing.student} onChange={e => set("student", e.target.value)} placeholder="이름" />
            <datalist id="sts">{studentNames.map(s => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
        <Field label="레슨 내용">
          <textarea className={inp} rows={3} value={editing.content} onChange={e => set("content", e.target.value)} placeholder="곡 / 패턴 / 루디먼트 등" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="다음 과제/목표"><textarea className={inp} rows={2} value={editing.homework} onChange={e => set("homework", e.target.value)} /></Field>
          <Field label="메모/특이사항"><textarea className={inp} rows={2} value={editing.memo} onChange={e => set("memo", e.target.value)} /></Field>
        </div>
        <Field label={`연습 템포 BPM ${editing.bpm ? "(♩=" + editing.bpm + ")" : ""}`}>
          <input type="number" className={inp} value={editing.bpm} onChange={e => set("bpm", e.target.value)} placeholder="예: 100" />
        </Field>

        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">실력 지표 (1~5)</div>
          <div className="space-y-2">
            {SKILL_KEYS.map((k, i) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-14 text-sm text-slate-600">{k}</span>
                <input type="range" min={1} max={5} value={editing.skills[k]}
                  onChange={e => setSkill(k, e.target.value)}
                  className="flex-1" style={{ accentColor: SKILL_COLORS[i] }} />
                <span className="w-5 text-center text-sm font-semibold tabular-nums" style={{ color: SKILL_COLORS[i] }}>{editing.skills[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm">취소</button>
        <button onClick={onSave} className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-900 font-semibold text-sm flex items-center gap-1.5">
          <Save size={16} /> 저장
        </button>
      </div>
    </div>
  );
}

/* ================= Drawing canvas ================= */
// Fixed logical writing surface. The backing store is created ONCE and never
// resized, so nothing is ever cropped when toggling fullscreen. On screen the
// canvas is CSS-scaled to the container width (aspect kept via aspect-ratio),
// and pointer coords are mapped rect -> logical, so pen and ink always align.
const LOGICAL_W = 1000;
const LOGICAL_H = 2000;
const PAD_H = 460;       // inline viewport height
const NOSEL = { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" };

function DrawPad({ onRead, parsing }) {
  const cvs = useRef(null);
  const wrapRef = useRef(null);      // clip/pan container (both modes)
  const drawing = useRef(false);
  const toolRef = useRef("pen");
  const dirtyRef = useRef(false);
  const maxYRef = useRef(0);         // lowest logical y drawn (for cropped export)
  const panning = useRef(false);
  const lastPanY = useRef(null);
  const offsetRef = useRef(0);       // current pan offset (display px)
  const [offset, setOffset] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState("pen"); // pen | eraser
  const [full, setFull] = useState(false);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const markDirty = () => {
    if (!dirtyRef.current) { dirtyRef.current = true; setDirty(true); }
  };

  const setupCtx = () => {
    const ctx = cvs.current.getContext("2d");
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // widths are in logical units (surface is 1000 wide)
    if (toolRef.current === "eraser") { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 36; }
    else { ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 3.2; }
  };

  // client coords -> logical canvas coords (correct under any CSS scale/transform)
  const pos = (e) => {
    const r = cvs.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (LOGICAL_W / r.width),
      y: (e.clientY - r.top) * (LOGICAL_H / r.height),
    };
  };

  // finger touches only (ignore Apple Pencil so palm/pen don't trigger pan)
  const fingers = (e) => [...e.touches].filter(t => t.touchType !== "stylus");
  const avgY = (list) => list.reduce((a, t) => a + t.clientY, 0) / list.length;

  useEffect(() => {
    const c = cvs.current;
    // one-time backing store init — never recreated afterwards
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = LOGICAL_W * dpr; c.height = LOGICAL_H * dpr;
    const ictx = c.getContext("2d");
    ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ictx.fillStyle = "#ffffff"; ictx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const down = (e) => {
      if (e.pointerType === "touch" && panning.current) return;
      e.preventDefault(); drawing.current = true;
      try { c.setPointerCapture(e.pointerId); } catch {}
      setupCtx();
      const ctx = c.getContext("2d"); const p = pos(e);
      maxYRef.current = Math.max(maxYRef.current, p.y);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing.current || panning.current) return;
      e.preventDefault();
      const ctx = c.getContext("2d");
      // coalesced events = every intermediate pencil sample -> smoother, truer strokes
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const p = pos(ev);
        maxYRef.current = Math.max(maxYRef.current, p.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke(); markDirty();
    };
    const up = (e) => {
      drawing.current = false;
      try { c.releasePointerCapture(e.pointerId); } catch {}
    };
    c.addEventListener("pointerdown", down, { passive: false });
    c.addEventListener("pointermove", move, { passive: false });
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", up);

    // touch gesture arbitration: pen/1 finger = draw, 2 fingers = pan.
    // preventDefault unconditionally so Safari never scrolls/selects/zooms on the pad.
    const tStart = (e) => {
      e.preventDefault();
      const f = fingers(e);
      if (f.length >= 2) { panning.current = true; drawing.current = false; lastPanY.current = avgY(f); }
    };
    const tMove = (e) => {
      e.preventDefault();
      const f = fingers(e);
      if (panning.current && f.length >= 2) {
        const y = avgY(f);
        if (lastPanY.current != null) {
          const dy = y - lastPanY.current;
          const wrapH = wrapRef.current ? wrapRef.current.clientHeight : 0;
          const max = Math.max(0, c.clientHeight - wrapH);
          let next = offsetRef.current - dy;
          next = Math.max(0, Math.min(max, next));
          offsetRef.current = next; setOffset(next);
        }
        lastPanY.current = y;
      }
    };
    const tEnd = (e) => {
      const f = fingers(e);
      if (f.length < 2) { panning.current = false; lastPanY.current = null; }
      if (e.touches.length === 0) drawing.current = false;
    };
    c.addEventListener("touchstart", tStart, { passive: false });
    c.addEventListener("touchmove", tMove, { passive: false });
    c.addEventListener("touchend", tEnd);
    c.addEventListener("touchcancel", tEnd);

    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", up);
      c.removeEventListener("touchstart", tStart);
      c.removeEventListener("touchmove", tMove);
      c.removeEventListener("touchend", tEnd);
      c.removeEventListener("touchcancel", tEnd);
    };
  }, []);

  // entering/leaving fullscreen: lock page scroll, reset pan.
  // The canvas itself is untouched — content is fully preserved.
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    offsetRef.current = 0; setOffset(0);
    return () => { document.body.style.overflow = ""; };
  }, [full]);

  const clearAll = () => {
    const ctx = cvs.current.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    dirtyRef.current = false; setDirty(false); maxYRef.current = 0;
  };

  // export cropped to the written area (blank bottom trimmed -> better AI reading)
  const read = () => {
    const c = cvs.current;
    const scale = c.width / LOGICAL_W; // backing px per logical px
    const cropH = Math.round(Math.min(LOGICAL_H, Math.max(400, maxYRef.current + 60)) * scale);
    const t = document.createElement("canvas");
    t.width = c.width; t.height = cropH;
    const tc = t.getContext("2d");
    tc.fillStyle = "#ffffff"; tc.fillRect(0, 0, t.width, t.height);
    tc.drawImage(c, 0, 0, c.width, cropH, 0, 0, t.width, cropH);
    onRead(t.toDataURL("image/png").split(",")[1]);
  };

  const toolBtn = (t, icon, label) => (
    <button onClick={() => setTool(t)} draggable={false} style={NOSEL}
      className={"px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 border " +
        (tool === t ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600")}>
      {icon} {label}
    </button>
  );

  return (
    <div onContextMenu={e => e.preventDefault()} style={NOSEL}
      className={full ? "fixed inset-0 z-50 bg-white flex flex-col p-3 gap-2" : ""}>
      {!full && <div className="text-xs text-slate-500 mb-2">아래 칸에 손가락이나 애플펜슬로 쓰세요. 두 손가락으로 위아래 스크롤. 레슨 중엔 "전체화면"으로 크게 쓰는 걸 권합니다.</div>}
      <div className="flex gap-2 items-center flex-wrap">
        {toolBtn("pen", <PenLine size={14} />, "펜")}
        {toolBtn("eraser", <Eraser size={14} />, "지우개")}
        <button onClick={clearAll} draggable={false} style={NOSEL}
          className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 border border-slate-300 text-slate-600">
          <RotateCcw size={14} /> 전체 지우기
        </button>
        <button onClick={() => setFull(f => !f)} draggable={false} style={NOSEL}
          className="ml-auto px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 border border-slate-300 text-slate-600">
          {full ? <><Minimize2 size={14} /> 축소</> : <><Maximize2 size={14} /> 전체화면</>}
        </button>
      </div>

      <div ref={wrapRef}
        className={"overflow-hidden relative rounded-xl border-2 border-amber-200 " + (full ? "flex-1 min-h-0" : "")}
        style={full ? undefined : { height: PAD_H }}>
        <canvas ref={cvs}
          className="w-full block bg-white absolute top-0 left-0"
          style={{ height: "auto", aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}`,
            touchAction: "none", ...NOSEL,
            transform: `translateY(${-offset}px)`,
            cursor: tool === "eraser" ? "cell" : "crosshair" }} />
      </div>

      <div className="flex gap-2 items-center">
        {full && <span className="text-xs text-slate-400" style={NOSEL}>펜슬·한 손가락 = 쓰기 · 두 손가락 = 스크롤</span>}
        <button onClick={read} disabled={!dirty || parsing} draggable={false} style={NOSEL}
          className="ml-auto px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-40 flex items-center gap-1.5">
          {parsing ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
          {parsing ? "읽는 중…" : "필기 읽기"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ================= Settings (API key) ================= */
function SettingsPage({ onBack }) {
  const [key, setKey] = useState(getApiKey());
  const [model, setModel] = useState(getModel());
  const [saved, setSaved] = useState(false);
  const save = () => {
    try {
      if (key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim());
      else localStorage.removeItem(API_KEY_STORAGE);
      localStorage.setItem(API_MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
  };
  const inp = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";
  return (
    <div className="max-w-xl mx-auto space-y-5">
      <button onClick={onBack} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800">
        <ChevronLeft size={16} /> 돌아가기
      </button>
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><KeyRound size={22} /> 설정</h2>
        <p className="text-slate-500 text-sm mt-1">사진 자동 인식과 AI 총평 기능을 쓰려면 본인 Anthropic API 키가 필요합니다.</p>
      </div>
      <div className={card + " p-6 space-y-4"}>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">Anthropic API 키</div>
          <input type="password" className={inp} value={key} onChange={e => setKey(e.target.value)}
            placeholder="sk-ant-..." autoComplete="off" />
          <p className="text-xs text-slate-400 mt-1">키는 이 기기의 브라우저에만 저장되며, 서버로 전송되지 않습니다.</p>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">모델 (기본값 권장)</div>
          <input className={inp} value={model} onChange={e => setModel(e.target.value)} placeholder={DEFAULT_MODEL} />
        </div>
        <button onClick={save}
          className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-900 font-semibold text-sm flex items-center gap-1.5">
          <Save size={16} /> {saved ? "저장됨!" : "저장"}
        </button>
      </div>
      <div className={card + " p-6 space-y-2 text-sm text-slate-600"}>
        <div className="font-semibold text-slate-800">API 키는 어떻게 얻나요?</div>
        <p>Anthropic 콘솔(console.anthropic.com)에서 로그인 후 API 키를 발급받아 위에 붙여넣으세요. 사용량만큼 과금되는 유료 서비스입니다.</p>
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
          className="inline-flex items-center gap-1 text-amber-700 hover:underline">
          콘솔에서 키 발급 <ExternalLink size={13} />
        </a>
        <p className="text-xs text-slate-400 pt-1">주의: 개인용 기기에서만 사용하세요. 키를 넣은 앱을 남과 공유하면 키가 노출될 수 있습니다.</p>
      </div>
    </div>
  );
}
