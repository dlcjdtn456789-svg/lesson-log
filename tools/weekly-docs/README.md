# weekly-docs

Weekly Word documents built from lesson-log data, run by a Claude scheduled task every Monday.

- **강의 커리큘럼.docx** — a cumulative teaching curriculum. Each run reflects only lessons not yet
  incorporated (oldest month first); Claude writes an additions-only patch, `apply.mjs` merges it with
  de-duplication, so content accumulates instead of being regenerated.
- **레슨일지/레슨일지_YYYY-MM-DD.docx** — full lesson-log backup.

Data path: the app POSTs its lessons to the user's own Apps Script web app, which stores them in
Google Drive; `fetch.mjs` reads them back with a shared key. Outputs and state live in
`%USERPROFILE%\Documents\레슨로그` (override with `LESSON_DOCS_DIR`); nothing personal is kept in this repo.

| Script | Purpose |
|---|---|
| `setup.mjs [--url <exec>]` | folders, connection key, `Code.gs` + setup guide, iPad connect link |
| `fetch.mjs [--from <json>]` | download the backup (refuses a backup less than half the previous size) |
| `prepare.mjs [--month YYYY-MM]` | pending months / teacher requests; writes the month's lessons and the ID outline |
| `apply.mjs --patch <f> (--month M \| --requests) [--run D]` | merge a patch; removals/edits/moves only with `--requests` |
| `render.mjs [--run D]` | write both .docx files; archives the previous curriculum when this run changed it |
| `log.mjs "<text>"` | append to `실행 기록.txt` |

Setup: `npm install` in this folder.
