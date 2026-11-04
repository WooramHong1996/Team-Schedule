# Team-Schedule
팀 행사 일정 — 카카오 로그인 + 수퍼베이스 + GitHub Pages

사이트: https://wooramhong1996.github.io/Team-Schedule/ (main 브랜치의 `docs/` 를 그대로 배포)

## 폴더 구조

```
docs/                      웹 화면 (빌드 없이 그대로 배포)
  index.html               화면 뼈대(HTML)만. 스타일·코드는 아래 파일들
  css/base.css             공통 · 달력 · 팀원 화면 · 로그인
  css/admin.css            관리자 화면
  js/api.js                수퍼베이스 연결. 화면은 api.함수() 만 부름 (Promise)
  js/util.js               날짜·글자·초성 검색·알림(toast) 같은 공용 도구
  js/data.js               DATA(받아 온 데이터), 날짜별 묶기, 다시 불러오기
  js/calendar.js           달력 · 날짜 패널 · 이번 달 행사 목록
  js/person.js             이름 검색 · 한 사람 보기
  js/admin-core.js         관리자 공통: 탭 전환, 필요 인원 계산, 행사 관리로 이동
  js/admin-events.js       행사 관리: 추가·수정·삭제, 야간 날짜, 날짜별 인원, 일별 인원 배정
  js/admin-members.js      팀원 관리: 추가·일당·이름·카카오 연결·간부·퇴사, 연결 요청
  js/admin-pay.js          인원·급여: 월별 급여 표, 월 마감, 엑셀
  js/boot.js               로그인 화면, 시작 (팀원 / 관리자 / 승인 대기 분기)
supabase/migrations/       DB 구조·권한·함수 (번호 순서대로 적용)
sheet-apps-script/Code.gs  구글 시트를 웹 데이터의 읽기 전용 사본으로 15분마다 동기화
tests/                     가짜 DB를 붙인 화면 테스트 (node tests/run.js docs)
```

스크립트는 `index.html` 아래쪽에 적힌 순서대로 읽힙니다(일반 `<script>`, 전역 공유).
새 파일을 만들면 그 목록에 순서를 맞춰 추가하세요.

## 권한
- 관리자(간부, `admins` 표): 전체 보기·수정, 월 마감
- 팀원: 카카오 로그인 → 관리자가 명단과 연결 → 본인 일정 + 같은 날 같은 행사 동료 이름만
- 화면이 아니라 DB(RLS · 트리거)가 최종으로 막습니다:
  지난 근무 기록이 있는 팀원·행사 삭제 금지, 마감한 달 배정 잠금, 마지막 관리자 해제 금지
