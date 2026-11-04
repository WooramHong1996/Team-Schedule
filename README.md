# Team-Schedule
팀 행사 일정 — 카카오 로그인 + 수퍼베이스

- `docs/` : 웹 화면 (GitHub Pages로 배포, main 브랜치의 /docs)
  - `index.html` 화면, `backend.js` 수퍼베이스 연결
- `supabase/migrations/` : DB 구조·권한
- `sheet-apps-script/Code.gs` : 구글 시트를 웹 데이터의 읽기 전용 사본으로 15분마다 동기화 (키는 스크립트 속성에)

권한
- 관리자(admins 표에 있는 계정): 전체 보기·수정
- 팀원: 카카오 로그인 → 관리자가 명단과 연결 → 본인 일정 + 같은 날 같은 행사 동료 이름만
