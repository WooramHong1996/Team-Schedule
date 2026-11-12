# 화면 테스트

가짜 수퍼베이스(메모리 DB, `docs/preview/mock.js`)를 붙여 브라우저에서 화면을 돌려 봅니다.
로그인 전 / 승인 대기 / 팀원 / 관리자(배정·행사·팀원·퇴사·근무 일수) 흐름을 확인합니다.

```bash
npm i -D playwright   # 처음 한 번
node tests/run.js docs
```

- 줄마다 `PASS` / `FAIL` 이 나옵니다.
- 가짜 DB의 권한·잠금 규칙은 실제 RLS·트리거를 흉내 낸 것이라, DB 정책을 바꾸면 `docs/preview/mock.js` 도 같이 맞춰 주세요.
