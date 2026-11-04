# Team-Schedule
팀 행사 일정 — 카카오 로그인 + 수퍼베이스

- `docs/` : 웹 화면 (GitHub Pages로 배포, main 브랜치의 /docs)
  - `index.html` 화면, `backend.js` 수퍼베이스 연결
- `supabase/migrations/` : DB 구조·권한
- `legacy-apps-script/` : 예전 구글 시트 + Apps Script 버전 (참고용)

권한
- 관리자(admins 표에 있는 계정): 전체 보기·수정
- 팀원: 카카오 로그인 → 관리자가 명단과 연결 → 본인 일정 + 같은 날 같은 행사 동료 이름만
