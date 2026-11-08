# Team-Schedule
팀 행사 일정 — 카카오 로그인 + 수퍼베이스 + GitHub Pages

사이트: https://wooramhong1996.github.io/Team-Schedule/ (main 브랜치의 `docs/` 를 그대로 배포)

## 폴더 구조

```
docs/                      웹 화면 (빌드 없이 그대로 배포)
  index.html               화면 뼈대(HTML)만. 스타일·코드는 아래 파일들
  css/style.css            화면 디자인 전부 (색 변수 → 공통·달력 → 관리자 → 마무리)
  preview.html             로그인 없이 가짜 데이터로 화면 보기 (디자인 작업용)
  preview/seed.js          미리보기 가짜 데이터 (이번 달 기준으로 날짜 생성)
  preview/mock.js          가짜 수퍼베이스 (미리보기 · 테스트가 같이 씀)
  preview/bar.js           미리보기 도구 막대 (팀원/관리자 · 밝게/어둡게 · 휴대폰 틀)
  js/api.js                수퍼베이스 연결. 화면은 api.함수() 만 부름 (Promise)
  js/util.js               날짜·글자·초성 검색·알림(toast) 같은 공용 도구
  js/data.js               DATA(받아 온 데이터), 날짜별 묶기, 다시 불러오기
  js/calendar.js           달력 · 날짜 패널 · 이번 달 행사 목록
  js/person.js             이름 검색 · 한 사람 보기
  js/admin-core.js         관리자 공통: 탭 전환, 필요 인원 계산, 행사 관리로 이동
  js/admin-events.js       행사 관리: 추가·수정·삭제, 야간 날짜, 날짜별 인원, 일별 인원 배정
  js/admin-members.js      팀원 관리: 추가·일당·이름·카카오 연결·간부·퇴사, 연결 요청
  js/admin-pay.js          인원·급여: 월별 급여 표, 월 마감, 엑셀
  js/event-info.js         팀원: 행사 자세히 보기 (장소·담당·팀원 공지·내 근무 날짜·함께 일하는 사람)
  js/boot.js               로그인 화면, 시작 (팀원 / 관리자 / 승인 대기 분기)
supabase/migrations/       DB 구조·권한·함수 (번호 순서대로 적용)
sheet-apps-script/Code.gs  구글 시트를 웹 데이터의 읽기 전용 사본으로 15분마다 동기화
tests/                     가짜 DB를 붙인 화면 테스트 (node tests/run.js docs)
.claude/                   Claude 작업 도구: 스킬(UI 점검·Superpowers·Postgres 규칙), /code-review, 코드 정리 에이전트
                           출처·라이선스는 .claude/licenses/README.md, 추천 플러그인 등록은 .claude/settings.json
```

스크립트는 `index.html` 아래쪽에 적힌 순서대로 읽힙니다(일반 `<script>`, 전역 공유).
새 파일을 만들면 그 목록에 순서를 맞춰 추가하세요.

## 권한
- 관리자(간부, `admins` 표): 전체 보기·수정, 월 마감
- 팀원: 카카오 로그인 → 관리자가 명단과 연결 → 본인 일정 + 같은 날 같은 행사 동료 이름만
- 화면이 아니라 DB(RLS · 트리거)가 최종으로 막습니다:
  지난 근무 기록이 있는 팀원·행사 삭제 금지, 마감한 달 배정 잠금, 마지막 관리자 해제 금지

## 디자인 고치기

**1. 화면 띄우기 — 로그인 필요 없음**
- 사이트에서 바로: https://wooramhong1996.github.io/Team-Schedule/preview.html
- 내 컴퓨터에서: `docs` 폴더에서 `python3 -m http.server` → http://localhost:8000/preview.html
- 아래 막대에서 팀원 / 관리자 / 처음 로그인 / 로그인 전, 밝게 / 어둡게, 휴대폰 틀을 바꿔 볼 수 있어요.
  주소로도 돼요: `preview.html?as=admin&theme=dark&frame=phone`
- 가짜 데이터라 실제 DB에는 아무것도 저장되지 않고, 새로고침하면 처음으로 돌아가요.

**2. 무엇을 어디서 고치나**

| 바꾸고 싶은 것 | 고칠 곳 |
|---|---|
| 색 (띠·바탕·글자·오늘·경고·행사 종류) | `css/style.css` 맨 위 `:root` 변수. 다크 모드는 바로 아래 블록 |
| 글꼴 | `--f-ui` 변수 + `index.html` 의 글꼴 `<link>` |
| 둥근 정도 | `--r-card`(큰 카드) · `--r-in`(안쪽 칸) |
| 칸·카드 모양, 여백, 크기 | `css/style.css` 의 해당 클래스 (브라우저 개발자 도구로 클래스 이름 확인) |
| 휴대폰에서만 다르게 | `css/style.css` 의 `@media (max-width:720px)` 블록 |
| 버튼 문구, 카드 안 순서 | `js/` 파일 (화면 HTML 이 자바스크립트 안에서 만들어져요 — 위 폴더 구조 참고) |
| 새 행사 종류 색 | `js/data.js` 의 `TYPE_CLS` 에 종류 추가 + `css/style.css` 에 `.c-이름` 과 `--이름-bg/-ink` 변수 |

- 색은 되도록 새 값(#...)을 직접 쓰지 말고 변수를 쓰거나 새 변수를 만들어 주세요. 다크 모드가 같이 따라와요.
- HTML·JS 에 `style="..."` 를 쓰지 말고 클래스를 만들어 `css/style.css` 에 넣어 주세요.
- `css/style.css` 끝의 '마무리 덮어쓰기'는 앞 규칙보다 뒤에 와야 결과가 같아서 남겨 둔 것이에요. 그 자리에서 고쳐 주세요.

**3. 지킬 것** — 누르는 곳은 휴대폰에서 44px 이상, 글자 12px 이상, 글자와 배경 대비 4.5:1 이상.
`.claude/skills/ui-ux-pro-max/` 스킬로 점검할 수 있어요.

**4. 확인** — `node tests/run.js docs` (화면 기능 테스트 63개). 디자인만 바꿨으면 모두 통과해야 해요.
