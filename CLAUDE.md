# 팀 행사 일정 — 작업 규칙

경호팀 행사 근무표 웹. 카카오 로그인 + Supabase(Postgres, 서울) + GitHub Pages(`main` 의 `docs/`).
폴더 구조와 디자인 안내는 README.md 참고.

## 절대 지킬 것
- **비밀 값은 커밋 금지** — 공개 저장소. 시트 동기화 키(`sheet-apps-script/Code.gs` 의 `EXPORT_KEY` 는 저장소에선 항상 `''`), 카카오 Client Secret(수퍼베이스 대시보드에만). 공개 키(publishable/anon)는 `docs/js/api.js` 에 있어도 됨.
- **권한은 DB가 최종으로 막는다** — 화면에서 숨기는 것과 별개로 RLS·트리거·security definer 함수(`private` 스키마)로 막을 것.
- **팀원에게 임금(일당·급여) 노출 금지.** 팀원은 본인 일정 + 같은 날 같은 행사 동료 이름만.
- **행사 '메모'는 관리자 전용**, 팀원에게 보일 내용은 '팀원 공지'(`events.notice`). 담당자·연락처는 팀원에게 보임.
- **기록 보호** — 지난 근무가 있는 팀원·행사는 삭제 대신 퇴사/보관. 마감한 달은 배정 잠금. 마지막 관리자 해제 금지.
- **날짜는 한국 시간(KST)** — DB는 `private.today_kst()`, 화면은 `api.today()`. `current_date`·`new Date()` 그대로 쓰지 말 것.

## DB 바꿀 때
- `supabase/migrations/` 에 다음 번호로 파일 추가 → 적용. 기존 파일은 고치지 않음.
- 함수 시그니처를 바꿀 땐 DROP 대신 새 이름(예: `my_schedule_v2`)으로 만들고 화면을 옮김.
- 배정 저장은 `set_assignments` RPC(advisory lock, 한 번에 처리)로.

## 화면 바꿀 때
- 빌드 없음. 일반 `<script>` 를 `index.html` 아래 순서대로 읽음(전역 공유). 새 파일은 그 순서에 맞춰 추가.
- 디자인은 `docs/css/style.css` 하나. 색은 맨 위 변수만 쓰기(새 #색 직접 쓰지 않기), HTML·JS 에 `style="..."` 금지(동적 CSS 변수 `--run` 만 예외).
- 화면 HTML 은 JS 문자열로 만듦 → 사용자 입력은 반드시 `esc()` 로 감싸기(XSS).
- 기준: 손가락 화면에서 누르는 곳 44px+, 글자 12px+, 대비 4.5:1+. 점검은 `.claude/skills/ui-ux-pro-max`.
- 로그인 없이 보기: `docs/preview.html?as=member|admin|new|guest&theme=dark&frame=phone`.

## 확인 · 올리기
- `node tests/run.js docs` — 가짜 DB(`docs/preview/mock.js`)로 화면 테스트 58개. 전부 통과해야 함.
- 커밋 후 `main` 에 push 하면 1~2분 뒤 사이트 반영. 작업 브랜치 `setup/supabase-schema` 도 같이 맞춰 둠.
- 사용자(홍우람)에게는 쉬운 한국어로, 개발 용어 대신 화면에서 보이는 말로 설명.
