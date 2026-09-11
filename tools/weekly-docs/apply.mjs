// Applies a curriculum patch (written by the weekly Claude run) to the state file.
// Month patches can only add content; edits, removals and moves are accepted only
// with --requests (teacher's written requests), so a month run never deletes anything.
//   node apply.mjs --patch <file> --month 2026-07 [--run 2026-09-14]
//   node apply.mjs --patch <file> --requests     [--run 2026-09-14]
import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  WORK, PATHS, LEVELS, SECTIONS, REQUESTS_TEMPLATE,
  asArr, asStr, normText, shortId, localDate, readJSON, writeJSON, writeText,
  ensureDir, loadState, readRequests, parseArgs, print,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const run = typeof args.run === "string" ? args.run : localDate();
const month = typeof args.month === "string" ? args.month : "";
const requestsMode = args.requests === true;
const fail = (error) => { print({ ok: false, error }); process.exit(2); };

if (typeof args.patch !== "string" || (!month && !requestsMode) || (month && requestsMode)) {
  fail("사용법: apply.mjs --patch <file> (--month YYYY-MM | --requests) [--run YYYY-MM-DD]");
}
let patch;
try { patch = readJSON(args.patch, null); } catch (e) { fail(`patch JSON을 읽을 수 없습니다: ${e.message}`); }
if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("patch 파일이 비었거나 JSON 객체가 아닙니다");

let lessonIds = [];
if (month) {
  const f = join(WORK, `pending_${month}.json`);
  if (!existsSync(f)) fail(`먼저 node prepare.mjs --month ${month} 를 실행하세요`);
  lessonIds = readJSON(f, []);
}

const state = loadState();
const now = new Date().toISOString();
const logId = shortId();
const warnings = [];
let units = state.units.map(u => ({ ...u, ...Object.fromEntries(SECTIONS.map(s => [s.k, [...asArr(u[s.k])]])) }));
const findUnit = (id) => units.find(u => u.id === asStr(id));
let addedItems = 0, addedUnits = 0, changed = 0;

const touch = (u) => {
  u.updatedAt = now;
  if (month) u.months = [...new Set([...asArr(u.months), month])].sort();
};
const addTexts = (u, sk, texts) => {
  const seen = new Set(u[sk].map(i => normText(i.text)));
  let n = 0;
  asArr(texts).map(t => asStr(t).trim()).forEach(text => {
    const key = normText(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    u[sk].push({ id: shortId(), text, month: month || null, logId });
    n++;
  });
  addedItems += n;
  return n;
};

if (!requestsMode && (asArr(patch.removals).length || asArr(patch.updates).length || asArr(patch.moves).length)) {
  warnings.push("월 반영에서는 removals/updates/moves를 무시합니다 (수정 요청 처리 때만 허용)");
}

if (requestsMode) {
  asArr(patch.removals).forEach(r => {
    if (r?.itemId) {
      let hit = false;
      units.forEach(u => SECTIONS.forEach(s => {
        const before = u[s.k].length;
        u[s.k] = u[s.k].filter(i => i.id !== r.itemId);
        if (u[s.k].length !== before) { hit = true; touch(u); }
      }));
      if (hit) changed++; else warnings.push(`삭제할 항목을 찾지 못함: ${r.itemId}`);
    } else if (r?.unitId) {
      const before = units.length;
      units = units.filter(u => u.id !== r.unitId);
      if (units.length !== before) changed++; else warnings.push(`삭제할 단원을 찾지 못함: ${r.unitId}`);
    }
  });

  asArr(patch.updates).forEach(up => {
    if (up?.itemId) {
      const text = asStr(up.text).trim();
      let hit = false;
      units.forEach(u => SECTIONS.forEach(s => {
        u[s.k] = u[s.k].map(i => {
          if (i.id !== up.itemId || !text) return i;
          hit = true; touch(u);
          return { ...i, text, logId };
        });
      }));
      if (hit) changed++; else warnings.push(`수정할 항목을 찾지 못함: ${up.itemId}`);
      return;
    }
    const u = findUnit(up?.unitId);
    if (!u) { warnings.push(`수정할 단원을 찾지 못함: ${up?.unitId}`); return; }
    ["title", "goal", "bpm"].forEach(k => {
      const v = asStr(up[k]).trim();
      if (v && v !== u[k]) { u[k] = v; changed++; touch(u); u.editLogId = logId; }
    });
    if (LEVELS.includes(up.level) && up.level !== u.level) { u.level = up.level; changed++; touch(u); u.editLogId = logId; }
  });

  asArr(patch.moves).forEach(mv => {
    const idx = units.findIndex(u => u.id === mv?.unitId);
    if (idx < 0) { warnings.push(`옮길 단원을 찾지 못함: ${mv?.unitId}`); return; }
    const [u] = units.splice(idx, 1);
    let at;
    if (mv.afterUnitId) {
      at = units.findIndex(x => x.id === mv.afterUnitId);
      if (at < 0) { units.splice(idx, 0, u); warnings.push(`기준 단원을 찾지 못함: ${mv.afterUnitId}`); return; }
      at += 1;
    } else {
      at = units.findIndex(x => x.level === u.level);
      if (at < 0) at = units.length;
    }
    units.splice(at, 0, u);
    changed++;
  });
}

asArr(patch.additions).forEach(a => {
  const u = findUnit(a?.unitId);
  if (!u) { warnings.push(`없는 단원 ID라 추가하지 않음: ${a?.unitId}`); return; }
  let c = SECTIONS.reduce((n, s) => n + addTexts(u, s.k, a[s.k]), 0) > 0;
  ["goal", "bpm"].forEach(k => {
    const v = asStr(a[k]).trim();
    if (v && v !== u[k]) { u[k] = v; changed++; c = true; u.editLogId = logId; }
  });
  if (c) touch(u);
});

const lastAfter = {};
asArr(patch.newUnits).forEach(n => {
  const title = asStr(n?.title).trim();
  if (!title) return;
  const same = units.find(u => normText(u.title) === normText(title));
  if (same) {
    if (SECTIONS.reduce((k, s) => k + addTexts(same, s.k, n[s.k]), 0)) touch(same);
    warnings.push(`같은 이름의 단원이 있어 기존 단원에 합침: ${title}`);
    return;
  }
  const level = LEVELS.includes(n.level) ? n.level : LEVELS[0];
  if (!LEVELS.includes(n.level)) warnings.push(`레벨 값이 올바르지 않아 초급으로 둠: ${title}`);
  const u = {
    id: shortId(), level, title, goal: asStr(n.goal).trim(), bpm: asStr(n.bpm).trim(),
    months: month ? [month] : [], createdAt: now, updatedAt: now, logId,
    exercises: [], tips: [], issues: [], homework: [],
  };
  SECTIONS.forEach(s => addTexts(u, s.k, n[s.k]));
  // right after the anchor (keeping patch order for shared anchors), else after the level's last unit
  const anchorId = n.afterUnitId ? (lastAfter[n.afterUnitId] || n.afterUnitId) : "";
  let at = anchorId ? units.findIndex(x => x.id === anchorId) : -1;
  if (at < 0) at = units.map(x => x.level).lastIndexOf(level);
  if (at < 0) at = units.length - 1;
  units.splice(at + 1, 0, u);
  if (n.afterUnitId) lastAfter[n.afterUnitId] = u.id;
  addedUnits++;
});

const overview = asStr(patch.overview).trim();
if (overview && overview !== state.overview) changed++;

// keep a copy of the previous state so any run can be rolled back by hand
if (existsSync(PATHS.state)) {
  ensureDir(PATHS.stateHistory);
  copyFileSync(PATHS.state, join(PATHS.stateHistory, `커리큘럼_상태_${now.replace(/[:.]/g, "-")}.json`));
}

writeJSON(PATHS.state, {
  ...state,
  createdAt: state.createdAt || now,
  updatedAt: now,
  overview: overview || state.overview,
  units,
  incorporated: [...new Set([...state.incorporated, ...lessonIds])],
  log: [...state.log, {
    id: logId, run, at: now,
    kind: month ? "기록 반영" : "수정 요청",
    month: month || null, lessonCount: lessonIds.length,
    summary: asStr(patch.summary).trim(),
    addedUnits, addedItems, changed,
  }],
});

if (requestsMode) {
  const text = readRequests();
  if (text) writeText(join(PATHS.processedRequests, `수정요청_${run}_${Date.now()}.txt`), text + "\n");
  writeText(PATHS.requests, REQUESTS_TEMPLATE);
}

print({
  ok: true, kind: month ? "기록 반영" : "수정 요청", month: month || null, run,
  addedUnits, addedItems, changed, incorporated: lessonIds.length, warnings,
});
