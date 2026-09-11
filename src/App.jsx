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
  Settings, KeyRound, ExternalLink, CloudUpload,
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

async function callAnthropic(messages, maxTokens) {
  const key = getApiKey();
  if (!key) {
    const e = new Error("NO_API_KEY");
    e.code = "NO_API_KEY";
    throw e;
  }
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: getModel(), max_tokens: maxTokens, messages }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("API " + resp.status + ": " + t.slice(0, 300));
  }
  return resp.json();
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

/* ---------- Google Drive auto-backup (via the user's own Apps Script web app) ---------- */
const DRIVE_URL_STORAGE = "lesson_drive_url";
const DRIVE_KEY_STORAGE = "lesson_drive_key";
const DRIVE_LAST_STORAGE = "lesson_drive_last";
const DRIVE_PENDING_STORAGE = "lesson_drive_pending";

const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };
const getDriveConfig = () => ({ url: lsGet(DRIVE_URL_STORAGE), key: lsGet(DRIVE_KEY_STORAGE) });
function readDriveLast() {
  try { return JSON.parse(lsGet(DRIVE_LAST_STORAGE) || "null"); } catch { return null; }
}

// POSTs the whole lesson list; the Apps Script saves it into the user's Drive.
// text/plain keeps it a simple request (Apps Script cannot answer CORS preflights).
async function uploadToDrive(lessons) {
  const { url, key } = getDriveConfig();
  if (!url || !key) return null;
  const at = new Date().toISOString();
  const body = JSON.stringify({ key, lessons });
  const headers = { "content-type": "text/plain;charset=utf-8" };
  let result, resp = null;
  try {
    resp = await fetch(url, { method: "POST", headers, body });
  } catch {
    // no readable reply: offline, or the browser hid it (CORS). Only the latter is worth a blind resend.
    if (!navigator.onLine) result = { at, ok: false, error: "인터넷에 연결되어 있지 않습니다" };
    else {
      try {
        await fetch(url, { method: "POST", mode: "no-cors", headers, body });
        result = { at, ok: true, unconfirmed: true, count: lessons.length };
      } catch {
        result = { at, ok: false, error: "네트워크에 연결할 수 없습니다" };
      }
    }
  }
  if (resp) {
    let data = null;
    try { data = await resp.json(); } catch {}
    result = !data ? { at, ok: false, error: `웹 앱 URL의 응답이 올바르지 않습니다 (HTTP ${resp.status})` }
      : data.ok ? { at, ok: true, count: data.count }
      : { at, ok: false, error: data.error === "unauthorized" ? "연동 키가 맞지 않습니다" : (data.error || "드라이브 응답 오류") };
  }
  lsSet(DRIVE_LAST_STORAGE, JSON.stringify(result));
  lsSet(DRIVE_PENDING_STORAGE, result.ok ? "" : "1");
  return result;
}

// "#connect=<base64url JSON {u, k}>" links are produced by the PC setup script
function readConnectLink() {
  const m = location.hash.match(/^#connect=([\w-]+)$/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
    return obj && obj.u && obj.k ? obj : null;
  } catch { return null; }
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
  const [driveLast, setDriveLast] = useState(readDriveLast);
  const driveTimer = useRef(null);
  const fileRef = useRef(null);

  const backupToDrive = async (list) => {
    clearTimeout(driveTimer.current);
    const r = await uploadToDrive(list);
    if (r) setDriveLast(r);
    return r;
  };
  // debounce bursts of edits into one upload; the pending flag retries on the next app open
  const scheduleDrive = (list) => {
    if (!getDriveConfig().url) return;
    lsSet(DRIVE_PENDING_STORAGE, "1");
    clearTimeout(driveTimer.current);
    driveTimer.current = setTimeout(() => backupToDrive(list), 3000);
  };

  useEffect(() => {
    loadData().then(res => {
      setLessons(res.data);
      if (res.corrupt) setLoadWarn(true);
      setReady(true);
      const hasData = res.ok && !res.corrupt && res.data.length > 0;
      const link = readConnectLink();
      if (link) {
        history.replaceState(null, "", location.pathname + location.search);
        if (confirm("구글 드라이브 자동 백업을 연결할까요?\n이 기기의 레슨 기록이 내 구글 드라이브에 저장됩니다.")) {
          lsSet(DRIVE_URL_STORAGE, link.u);
          lsSet(DRIVE_KEY_STORAGE, link.k);
          if (!hasData) { alert("연결했습니다. 레슨을 저장하면 드라이브에 백업됩니다."); return; }
          backupToDrive(res.data).then(r => r && alert(r.ok
            ? `연결했습니다. 구글 드라이브에 ${r.count}개 기록을 백업했습니다.`
            : `연결은 저장했지만 백업에 실패했습니다: ${r.error}`));
          return;
        }
      }
      // never auto-upload an empty or unreadable list over the Drive copy
      const last = readDriveLast();
      const stale = !last || Date.now() - Date.parse(last.at) > 24 * 3600e3;
      if (getDriveConfig().url && hasData && (lsGet(DRIVE_PENDING_STORAGE) || stale)) backupToDrive(res.data);
    });
  }, []);

  const persist = async (list) => {
    setSaveState("saving");
    const ok = await saveData(list);
    setSaveState(ok ? "saved" : "error");
    if (ok) scheduleDrive(list);
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
  const buildJSON = () => JSON.stringify(lessons, null, 2);
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
  // returns number added, or -1 on parse error
  const restoreFromText = (text) => {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) return -1;
      const ids = new Set(lessons.map(l => l.id));
      const add = arr.filter(a => a && a.id && !ids.has(a.id));
      if (add.length) commit([...lessons, ...add]);
      return add.length;
    } catch { return -1; }
  };
  const importFile = (file) => {
    const r = new FileReader();
    r.onload = () => {
      const n = restoreFromText(String(r.result));
      if (n < 0) alert("올바른 백업(JSON) 내용이 아닙니다.");
      else alert(n === 0 ? "새로 추가된 기록이 없습니다 (이미 있는 기록)." : `${n}개 기록을 복원했습니다.`);
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
            <SaveChip state={saveState} count={lessons.length} drive={driveLast} />
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
        {lessons.length === 0 && ["dashboard", "list", "students", "report"].includes(tab) && (
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
            onBack={() => setSelStudent(null)} onEdit={startEdit} onDelete={removeEntry} />}
        {tab === "report" && lessons.length > 0 &&
          <MonthlyReport lessons={lessons} students={students} />}
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
          <SettingsPage onBack={() => setTab("dashboard")}
            lessons={lessons} driveLast={driveLast} onDriveBackup={backupToDrive} />}
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
function SaveChip({ state, count, drive }) {
  const map = {
    idle: { t: `${count}개 저장됨`, c: "text-slate-400" },
    saving: { t: "저장 중…", c: "text-amber-300" },
    saved: { t: `저장됨 · ${count}개`, c: "text-emerald-300" },
    error: { t: "저장 실패", c: "text-rose-300" },
  };
  const s = map[state] || map.idle;
  return (
    <span className="text-[11px] flex items-center gap-2">
      <span className={s.c}>{s.t}</span>
      {drive && !drive.ok && getDriveConfig().url && <span className="text-rose-300">드라이브 백업 실패</span>}
    </span>
  );
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
    const n = onRestoreText(pasteVal.trim());
    if (n < 0) setMsg("붙여넣은 내용이 올바른 백업(JSON)이 아닙니다.");
    else { setMsg(n === 0 ? "새로 추가된 기록이 없습니다 (이미 있는 기록)." : `${n}개 기록을 복원했습니다.`); setPasteVal(""); }
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
function StudentDetail({ s, onBack, onEdit, onDelete }) {
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
function SettingsPage({ onBack, lessons, driveLast, onDriveBackup }) {
  const [key, setKey] = useState(getApiKey());
  const [model, setModel] = useState(getModel());
  const [saved, setSaved] = useState(false);
  const [driveUrl, setDriveUrl] = useState(lsGet(DRIVE_URL_STORAGE));
  const [driveKey, setDriveKey] = useState(lsGet(DRIVE_KEY_STORAGE));
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState("");
  const saveDrive = async () => {
    lsSet(DRIVE_URL_STORAGE, driveUrl.trim());
    lsSet(DRIVE_KEY_STORAGE, driveKey.trim());
    setDriveMsg("");
    if (!driveUrl.trim() || !driveKey.trim()) { setDriveMsg("연동을 해제했습니다."); return; }
    if (!lessons.length) { setDriveMsg("저장했습니다. 레슨 기록이 생기면 자동으로 백업됩니다."); return; }
    setDriveBusy(true);
    await onDriveBackup(lessons);
    setDriveBusy(false);
  };
  const when = (iso) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
      <div className={card + " p-6 space-y-4"}>
        <div>
          <div className="font-semibold text-slate-800 flex items-center gap-1.5"><CloudUpload size={17} /> 구글 드라이브 자동 백업</div>
          <p className="text-sm text-slate-500 mt-1">
            레슨을 저장할 때마다 내 구글 드라이브 '레슨로그' 폴더에 기록을 올립니다. PC의 주간 워드 정리가 이 백업을 사용합니다.
          </p>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">웹 앱 URL</div>
          <input className={inp} value={driveUrl} onChange={e => setDriveUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">연동 키</div>
          <input type="password" className={inp} value={driveKey} onChange={e => setDriveKey(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveDrive} disabled={driveBusy}
            className="px-5 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm flex items-center gap-1.5 disabled:opacity-50">
            {driveBusy ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
            {driveBusy ? "백업 중…" : "저장하고 지금 백업"}
          </button>
          {driveMsg
            ? <span className="text-sm text-slate-600">{driveMsg}</span>
            : driveLast && driveUrl && (
              <span className={"text-sm " + (!driveLast.ok ? "text-rose-600" : driveLast.unconfirmed ? "text-amber-700" : "text-emerald-700")}>
                {driveLast.ok
                  ? `마지막 백업 ${when(driveLast.at)} · ${driveLast.count}개${driveLast.unconfirmed ? " (응답을 확인하지 못했어요 — 웹 앱 URL을 확인하세요)" : ""}`
                  : `백업 실패 (${when(driveLast.at)}): ${driveLast.error}`}
              </span>
            )}
        </div>
        <p className="text-xs text-slate-400">
          설정 방법은 PC의 '문서\레슨로그\구글드라이브 연동\설정 방법.txt'에 있습니다. 연동 링크로 앱을 열면 자동으로 입력됩니다.
        </p>
      </div>
    </div>
  );
}
