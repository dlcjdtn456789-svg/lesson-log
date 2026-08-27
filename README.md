# 레슨 로그 (Lesson Log)

드럼 레슨 기록 관리 웹앱. 애플펜슬 필기 → AI 자동 정리, 학생별 실력 통계, 월별 리포트.

- **정적 단일 파일**: `index.html` 하나로 동작 (React + recharts + lucide, esbuild 번들 + Tailwind CDN)
- **데이터**: 브라우저 localStorage에만 저장 (백업·복원 메뉴에서 JSON 내보내기/가져오기)
- **AI 기능**: 사용자가 '설정'에서 본인 Anthropic API 키를 입력하면 브라우저에서 직접 API 호출
  (`x-api-key` + `anthropic-version: 2023-06-01` + `anthropic-dangerous-direct-browser-access: true`)
- **필기 캔버스**: pointer 이벤트 기반. 펜슬/한 손가락 = 쓰기, 두 손가락 = 스크롤(전체화면).
  iPad Safari에서 스크롤·선택·확대에 가로채이지 않도록 touch 기본동작을 차단.

## 개발

```bash
npm install
npm run build   # src/ → index.html (단일 파일)
```

소스는 `src/App.jsx`, 빌드 스크립트는 `build.mjs`, HTML 껍데기는 `template.html`.
