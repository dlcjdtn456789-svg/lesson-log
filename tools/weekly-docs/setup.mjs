// One-time setup: folder structure, a random connection key, the Apps Script code the
// user pastes into Google, and (once the web app URL is known) the iPad connect link.
//   node setup.mjs                 create folders, key, Code.gs, guide
//   node setup.mjs --url <exec>    also store the Apps Script web app URL
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  ROOT, DATA, PATHS, APP_URL, REQUESTS_TEMPLATE,
  ensureDir, readJSON, writeJSON, writeText, parseArgs, print,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
[ROOT, DATA, PATHS.lessonLogDir, PATHS.curriculumArchive, PATHS.setupDir].forEach(ensureDir);

const cfg = readJSON(PATHS.config, {});
const driveKey = cfg.driveKey || randomBytes(18).toString("base64url");
const driveUrl = typeof args.url === "string" ? args.url.trim() : cfg.driveUrl || "";
if (driveUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(driveUrl)) {
  print({ ok: false, error: "웹 앱 URL 형식이 아닙니다 (https://script.google.com/macros/s/.../exec)" });
  process.exit(2);
}
writeJSON(PATHS.config, { driveUrl, driveKey });

if (!existsSync(PATHS.requests)) writeText(PATHS.requests, REQUESTS_TEMPLATE);
writeText(join(PATHS.setupDir, "Code.gs"), appsScript(driveKey));
writeText(join(PATHS.setupDir, "설정 방법.txt"), guide(driveKey));

let linkFile = null;
if (driveUrl) {
  const token = Buffer.from(JSON.stringify({ u: driveUrl, k: driveKey })).toString("base64url");
  linkFile = join(PATHS.setupDir, "아이패드 연동 링크.txt");
  writeText(linkFile, [
    "아래 링크를 아이패드로 보내서(카카오톡 '나와의 채팅', 메모 등) 사파리에서 여세요.",
    "레슨 로그 앱에 구글 드라이브 연동 정보가 자동으로 입력되고 첫 백업이 올라갑니다.",
    "※ 연동 키가 들어 있으니 다른 사람에게 보내지 마세요.",
    "",
    `${APP_URL}#connect=${token}`,
    "",
  ].join("\n"));
}

print({ ok: true, root: ROOT, driveUrlSet: !!driveUrl, setupDir: PATHS.setupDir, linkFile });

function appsScript(key) {
  return [
    "// 레슨 로그 → 구글 드라이브 연동 (Apps Script 웹 앱)",
    "// 앱이 레슨 기록을 보내면 내 드라이브의 '레슨로그' 폴더에 저장하고, PC 주간 정리가 여기서 받아 갑니다.",
    "",
    "const SECRET = '" + key + "';",
    "const FOLDER_NAME = '레슨로그';",
    "const LATEST_NAME = '레슨로그_백업.json';",
    "",
    "function doPost(e) {",
    "  const lock = LockService.getScriptLock();",
    "  try {",
    "    lock.waitLock(20000);",
    "    const req = JSON.parse(e.postData.contents);",
    "    if (req.key !== SECRET) return reply_({ ok: false, error: 'unauthorized' });",
    "    if (!Array.isArray(req.lessons)) return reply_({ ok: false, error: 'no lessons' });",
    "    const now = new Date();",
    "    const body = JSON.stringify({ version: 1, exportedAt: now.toISOString(), lessons: req.lessons });",
    "    const folder = folder_(DriveApp.getRootFolder(), FOLDER_NAME);",
    "    upsert_(folder, LATEST_NAME, body);",
    "    const day = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');",
    "    upsert_(folder_(folder, '날짜별 백업'), '레슨로그_백업_' + day + '.json', body);",
    "    return reply_({ ok: true, count: req.lessons.length, savedAt: now.toISOString() });",
    "  } catch (err) {",
    "    return reply_({ ok: false, error: String(err) });",
    "  } finally {",
    "    lock.releaseLock();",
    "  }",
    "}",
    "",
    "function doGet(e) {",
    "  if (((e && e.parameter) || {}).key !== SECRET) return reply_({ ok: false, error: 'unauthorized' });",
    "  const files = folder_(DriveApp.getRootFolder(), FOLDER_NAME).getFilesByName(LATEST_NAME);",
    "  if (!files.hasNext()) return reply_({ ok: false, error: 'no backup yet' });",
    "  return ContentService.createTextOutput(files.next().getBlob().getDataAsString('UTF-8'))",
    "    .setMimeType(ContentService.MimeType.JSON);",
    "}",
    "",
    "function folder_(parent, name) {",
    "  const it = parent.getFoldersByName(name);",
    "  return it.hasNext() ? it.next() : parent.createFolder(name);",
    "}",
    "",
    "function upsert_(folder, name, text) {",
    "  const it = folder.getFilesByName(name);",
    "  if (it.hasNext()) it.next().setContent(text);",
    "  else folder.createFile(name, text, 'application/json');",
    "}",
    "",
    "function reply_(obj) {",
    "  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);",
    "}",
    "",
  ].join("\n");
}

function guide(key) {
  return `레슨 로그 → 구글 드라이브 자동 백업 설정 (처음 한 번만, PC에서)

[1] 구글 드라이브에 받는 곳 만들기
  1. https://script.google.com 에 접속해 구글 계정으로 로그인 → [새 프로젝트]
  2. 기본 코드를 모두 지우고, 이 폴더의 Code.gs 내용을 전부 복사해 붙여넣은 뒤 저장(Ctrl+S)
  3. 오른쪽 위 [배포] → [새 배포] → 유형 선택(톱니바퀴) → [웹 앱]
       실행 사용자: 나
       액세스 권한이 있는 사용자: 모든 사용자
  4. [배포] → [액세스 승인] → 계정 선택
       "Google에서 확인하지 않은 앱" 화면이 나오면 [고급] → [...(으)로 이동] → [허용]
       (내가 만든 스크립트라서 뜨는 정상 경고입니다)
  5. 표시되는 "웹 앱 URL"(https://script.google.com/macros/s/.../exec)을 복사

[2] PC 주간 정리에 URL 등록
  Claude에게 웹 앱 URL을 알려 주세요. 등록되면 이 폴더에 '아이패드 연동 링크.txt'가 생깁니다.
  (직접 하려면: lesson-log\\tools\\weekly-docs 폴더에서  node setup.mjs --url <웹 앱 URL>)

[3] 아이패드 앱 연결
  '아이패드 연동 링크.txt' 안의 링크를 카카오톡 '나와의 채팅'이나 메모로 아이패드에 보내고
  사파리에서 열면 설정이 자동으로 입력되고 첫 백업이 올라갑니다.
  (직접 입력하려면: 앱 [설정] → 구글 드라이브 자동 백업 → 웹 앱 URL과 아래 연동 키 입력)

  연동 키: ${key}
  ※ 연동 키는 레슨 기록을 읽고 쓰는 비밀번호입니다. 다른 사람에게 보내지 마세요.

이후에는 레슨을 저장할 때마다 앱이 드라이브에 자동으로 올리고,
매주 월요일 오전 8시에 PC가 드라이브에서 받아 워드 파일로 정리합니다.
`;
}
