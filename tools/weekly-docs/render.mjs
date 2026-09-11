// Renders the cumulative curriculum and the lesson-log backup as Word files.
//   node render.mjs [--run 2026-09-14]
import { existsSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle, LevelFormat, Footer, PageNumber,
} from "docx";
import {
  ROOT, PATHS, LEVELS, SECTIONS, SKILL_KEYS, asArr, asStr, localDate, ensureDir,
  loadLessons, loadState, groupByMonth, parseArgs, print,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const runDate = typeof args.run === "string" ? args.run : localDate();

const FONT = { ascii: "Malgun Gothic", eastAsia: "Malgun Gothic", hAnsi: "Malgun Gothic", cs: "Malgun Gothic" };
const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134; // 2 cm
const CONTENT_W = A4.width - MARGIN * 2; // 9638
const C = {
  ink: "1E293B", sub: "64748B", faint: "94A3B8", amber: "B45309", teal: "0F766E",
  line: "CBD5E1", head: "F1F5F9", label: "F8FAFC",
};

/* ---------- building blocks ---------- */
const t = (text, o = {}) => new TextRun({ text: String(text), ...o });
const para = (children, o = {}) => new Paragraph({ ...o, children: Array.isArray(children) ? children : [children] });
const small = (text, o = {}) => para(t(text, { size: 18, color: C.sub }), o);
const h1 = (text, o = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, ...o, children: [t(text)] });
const h2 = (children) => new Paragraph({ heading: HeadingLevel.HEADING_2, children });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t(text)] });
const bullet = (children) => new Paragraph({ numbering: { reference: "bullet", level: 0 }, spacing: { after: 40 }, children });

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text, width, { bold = false, fill = null, color = C.ink, size = 19 } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    children: asStr(text).split(/\r?\n/).map(line =>
      new Paragraph({ spacing: { after: 0, line: 276 }, children: [t(line, { bold, color, size })] })),
  });
}

function grid(widths, rows) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      cantSplit: true,
      children: r.map((v, ci) => cell(v, widths[ci], ri === 0 ? { bold: true, fill: C.head, color: C.sub, size: 18 } : {})),
    })),
  });
}

const titleBlock = (title, subtitle) => [
  new Paragraph({ spacing: { after: 60 }, children: [t(title, { size: 44, bold: true, color: "0F172A" })] }),
  new Paragraph({
    spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.amber, space: 6 } },
    children: [t(subtitle, { size: 19, color: C.sub })],
  }),
];

function buildDoc(title, children) {
  const heading = (id, name, size, color, spacing, outlineLevel) => ({
    id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
    run: { font: FONT, size, bold: true, color },
    paragraph: { spacing, outlineLevel, keepNext: true },
  });
  return new Document({
    creator: "레슨 로그",
    title,
    styles: {
      default: { document: { run: { font: FONT, size: 20, color: C.ink }, paragraph: { spacing: { after: 80, line: 300 } } } },
      paragraphStyles: [
        heading("Heading1", "Heading 1", 32, C.amber, { before: 240, after: 160 }, 0),
        heading("Heading2", "Heading 2", 26, "0F172A", { before: 320, after: 80 }, 1),
        heading("Heading3", "Heading 3", 20, C.teal, { before: 160, after: 40 }, 2),
      ],
    },
    numbering: {
      config: [{
        reference: "bullet",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } } },
        }],
      }],
    },
    sections: [{
      properties: { page: { size: A4, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.faint })],
          })],
        }),
      },
      children,
    }],
  });
}

/* ---------- 강의 커리큘럼 ---------- */
function curriculumDoc(state, lessons) {
  const runLogs = state.log.filter(l => l.run === runDate);
  const runIds = new Set(runLogs.map(l => l.id));
  const isNew = (x) => !!(x && ((x.logId && runIds.has(x.logId)) || (x.editLogId && runIds.has(x.editLogId))));
  const itemCount = state.units.reduce((n, u) => n + SECTIONS.reduce((m, s) => m + asArr(u[s.k]).length, 0), 0);
  const inc = new Set(state.incorporated);
  const reflected = lessons.filter(l => inc.has(l.id));
  const period = reflected.length
    ? `${reflected[0].date.slice(0, 7)} ~ ${reflected[reflected.length - 1].date.slice(0, 7)}` : "-";
  const lastLog = state.log[state.log.length - 1];

  const children = [
    ...titleBlock("드럼 강의 커리큘럼", `레슨 기록을 반영해 매주 보강되는 수업 준비 자료 · ${runDate} 기준`),
    grid([2700, 1350, 1650, 2138, 1800], [
      ["단원", "수업 자료", "반영한 레슨 기록", "기록 기간", "마지막 보강"],
      [
        `${state.units.length}개\n${LEVELS.map(lv => `${lv} ${state.units.filter(u => u.level === lv).length}`).join(" · ")}`,
        `${itemCount}개`, `${state.incorporated.length}회`, period, lastLog ? lastLog.run : "-",
      ],
    ]),
    small("※ 이 문서는 매주 월요일 자동으로 다시 만들어집니다. 직접 고칠 내용은 '커리큘럼_수정요청.txt'에 적어 두면 다음 정리 때 반영됩니다. ▲ 표시는 이번 정리에서 새로 추가되거나 수정된 내용입니다.",
      { spacing: { before: 120, after: 120 } }),
  ];

  if (state.overview) children.push(h1("과정 개요"), para(t(state.overview)));

  children.push(h1(`이번 정리 내역 (${runDate})`));
  if (!runLogs.length) {
    children.push(para(t("이번 정리에서는 새로 반영할 레슨 기록이나 수정 요청이 없었습니다.", { color: C.sub })));
  } else {
    runLogs.forEach(l => {
      const isRequest = l.kind === "수정 요청";
      const counts = [
        l.addedUnits && `단원 +${l.addedUnits}`,
        l.addedItems && `자료 +${l.addedItems}`,
        isRequest && l.changed && `수정 ${l.changed}`,
      ].filter(Boolean).join(" · ");
      children.push(bullet([
        t(isRequest ? "수정 요청 반영" : `${l.month} 기록 ${l.lessonCount}회 반영`, { bold: true }),
        ...(counts ? [t(`  ${counts}`, { color: C.sub })] : []),
        ...(l.summary ? [t(` — ${l.summary}`)] : []),
      ]));
    });
    // new units are named only (their content follows in the level sections);
    // existing units show exactly which items this run added or edited
    const newUnits = state.units.filter(u => u.logId && runIds.has(u.logId));
    const enriched = state.units.filter(u =>
      !newUnits.includes(u) && (isNew(u) || SECTIONS.some(s => asArr(u[s.k]).some(isNew))));
    if (newUnits.length) {
      children.push(h3("새 단원"));
      newUnits.forEach(u => children.push(bullet([
        t(`[${u.level}] ${u.title}`, { bold: true }),
        t(`  자료 ${SECTIONS.reduce((n, s) => n + asArr(u[s.k]).length, 0)}개`, { color: C.sub }),
      ])));
    }
    if (enriched.length) {
      children.push(h3("보강·수정된 단원"));
      enriched.forEach(u => {
        children.push(bullet([
          t(`[${u.level}] ${u.title}`, { bold: true }),
          ...(u.editLogId && runIds.has(u.editLogId) ? [t("  목표·템포 등 수정", { color: C.sub })] : []),
        ]));
        SECTIONS.forEach(s => asArr(u[s.k]).filter(isNew).forEach(i =>
          children.push(para(t(`${s.label}: ${i.text}`, { size: 19, color: C.sub }), { indent: { left: 720 }, spacing: { after: 20 } }))));
      });
    }
  }

  LEVELS.forEach(lv => {
    const us = state.units.filter(u => u.level === lv);
    children.push(h1(`${lv} 과정`, { pageBreakBefore: true }));
    if (!us.length) {
      children.push(para(t(`아직 ${lv} 단원이 없습니다. 해당 레벨의 레슨 기록이 쌓이면 추가됩니다.`, { color: C.sub })));
      return;
    }
    us.forEach((u, i) => {
      children.push(h2([
        t(`${i + 1}. ${u.title}`),
        ...(isNew(u) ? [t(u.logId && runIds.has(u.logId) ? "  ▲ 새 단원" : "  ▲ 수정", { color: C.teal, size: 20 })] : []),
      ]));
      const months = asArr(u.months);
      const meta = [
        u.goal && `목표: ${u.goal}`,
        u.bpm && `권장 템포: ${u.bpm}`,
        months.length && `반영 기간: ${months[0]}${months.length > 1 ? ` ~ ${months[months.length - 1]}` : ""}`,
      ].filter(Boolean).join("   |   ");
      if (meta) children.push(para(t(meta, { size: 19, color: C.sub }), { spacing: { after: 60 } }));
      SECTIONS.forEach(s => {
        const list = asArr(u[s.k]);
        if (!list.length) return;
        children.push(h3(s.label));
        list.forEach(it => children.push(bullet([
          ...(isNew(it) ? [t("▲ ", { bold: true, color: C.teal })] : []),
          t(it.text, isNew(it) ? { color: C.teal } : {}),
          ...(it.month ? [t(`  (${it.month})`, { size: 16, color: C.faint })] : []),
        ])));
      });
    });
  });

  children.push(h1("보강 이력", { pageBreakBefore: true }));
  if (!state.log.length) children.push(para(t("아직 이력이 없습니다.", { color: C.sub })));
  else children.push(grid([1250, 1150, 1000, 750, 700, 700, 4088], [
    ["정리일", "구분", "반영 월", "기록", "단원+", "자료+", "요약"],
    ...[...state.log].reverse().map(l => [
      l.run, l.kind, l.month || "-", l.lessonCount ? `${l.lessonCount}회` : "-",
      String(l.addedUnits), String(l.addedItems), l.summary || "",
    ]),
  ]));

  return buildDoc("드럼 강의 커리큘럼", children);
}

/* ---------- 레슨일지 백업 ---------- */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const weekday = (d) => WEEKDAY[new Date(`${d}T00:00:00`).getDay()];

function lessonLogDoc(lessons) {
  const byStudent = {};
  lessons.forEach(l => { (byStudent[`${l.academy}||${l.student}`] ||= []).push(l); });
  const period = lessons.length ? `${lessons[0].date} ~ ${lessons[lessons.length - 1].date}` : "-";

  const children = [
    ...titleBlock("레슨일지 백업",
      `백업일 ${runDate} · 기록 ${lessons.length}회 · 학생 ${Object.keys(byStudent).length}명 · ${period}`),
    h1("학생별 요약"),
    grid([1500, 1900, 800, 1300, 1300, 1238, 1600], [
      ["학생", "학원", "레슨", "첫 레슨", "최근 레슨", "최근 레벨", "최근 템포"],
      ...Object.values(byStudent)
        .sort((a, b) => b.length - a.length || a[0].student.localeCompare(b[0].student))
        .map(es => {
          const last = es[es.length - 1];
          const bpm = [...es].reverse().find(e => e.bpm)?.bpm;
          return [last.student, last.academy || "-", `${es.length}회`, es[0].date, last.date, last.level || "-", bpm ? `♩=${bpm}` : "-"];
        }),
    ]),
  ];
  if (!lessons.length) children.push(para(t("백업할 레슨 기록이 없습니다.", { color: C.sub })));

  const LABEL_W = 1500;
  groupByMonth(lessons).forEach((g, gi) => {
    children.push(h1(`${g.month} (${g.entries.length}회)`, { pageBreakBefore: gi > 0 }));
    g.entries.forEach(e => {
      children.push(h3(`${e.date.slice(5)} (${weekday(e.date)})   ${e.student}${e.academy ? ` · ${e.academy}` : ""}`));
      const rows = [
        ["레벨 · 템포", [e.level, e.bpm && `♩=${e.bpm}`].filter(Boolean).join("   ")],
        ["실력 지표", SKILL_KEYS.map(k => `${k} ${e.skills?.[k] ?? "-"}`).join("    ")],
        ["레슨 내용", e.content],
        ["다음 과제", e.homework],
        ["메모", e.memo],
      ].filter(([, v]) => asStr(v).trim());
      children.push(new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [LABEL_W, CONTENT_W - LABEL_W],
        rows: rows.map(([k, v]) => new TableRow({
          cantSplit: true,
          children: [
            cell(k, LABEL_W, { bold: true, fill: C.label, color: C.sub, size: 18 }),
            cell(v, CONTENT_W - LABEL_W),
          ],
        })),
      }));
    });
  });

  return buildDoc("레슨일지 백업", children);
}

/* ---------- main ---------- */
async function save(doc, path) {
  const buf = await Packer.toBuffer(doc);
  try {
    writeFileSync(path, buf);
    return { path };
  } catch (e) {
    if (e.code !== "EBUSY" && e.code !== "EPERM") throw e;
    const alt = path.replace(/\.docx$/, ` (새 버전 ${Date.now()}).docx`);
    writeFileSync(alt, buf);
    return { path: alt, warning: "기존 파일이 워드에서 열려 있어 다른 이름으로 저장했습니다" };
  }
}

let lessons;
try { lessons = loadLessons(); }
catch (e) { print({ ok: false, error: e.message }); process.exit(2); }
const state = loadState();
[ROOT, PATHS.lessonLogDir, PATHS.curriculumArchive].forEach(ensureDir);

// archive the previous curriculum only when this run actually changed it
let archived = null;
if (existsSync(PATHS.curriculumDoc) && state.log.some(l => l.run === runDate)) {
  const stamp = statSync(PATHS.curriculumDoc).mtime.toLocaleDateString("sv-SE");
  const dest = join(PATHS.curriculumArchive, `강의 커리큘럼_${stamp}.docx`);
  if (!existsSync(dest)) { copyFileSync(PATHS.curriculumDoc, dest); archived = dest; }
}

const curriculum = await save(curriculumDoc(state, lessons), PATHS.curriculumDoc);
const lessonLog = await save(lessonLogDoc(lessons), join(PATHS.lessonLogDir, `레슨일지_${runDate}.docx`));
print({ ok: true, run: runDate, curriculum, lessonLog, archived, units: state.units.length, lessons: lessons.length });
