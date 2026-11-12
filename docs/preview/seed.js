/* 미리보기용 가짜 데이터 — 이번 달 기준으로 날짜를 만들어서 언제 열어도 화면이 채워져 있어요.
   실제 DB와 연결되지 않고, 새로고침하면 처음 상태로 돌아가요. */
(function(){
  const P = window.__PREVIEW || {};
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const Y = now.getFullYear(), M = now.getMonth(), T = now.getDate();
  const pad = n => String(n).padStart(2, "0");
  const day = d => { const x = new Date(Y, M, d); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); };
  const rel = k => day(T + k);   // 오늘 기준 k일 뒤

  const names = ["홍우람", "박진원", "오한솔", "김도윤", "이서준", "최민재", "정하은", "강지호", "윤서연", "임태현"];
  const members = names.map((n, i) => ({
    id: i + 1, name: n, cert: (i === 1 || i === 6) ? "없음" : "있음", note: null,
    user_id: i === 0 ? "U-admin" : i === 1 ? "U-park" : null, active: true, retired_at: null, sort_order: i + 1
  }));
  members.push({ id: 99, name: "송퇴사", cert: "있음", user_id: null, active: false, retired_at: day(1), sort_order: 99 });

  const ev = (id, name, type, a, b, o) => Object.assign({ id, name, type, start_date: a, end_date: b, place: null, manager: null, contact: null, memo: null, notice: null, need_day: null, need_night: null }, o || {});
  const events = [
    ev(11, "코엑스 리빙디자인페어", "전시", rel(-2), rel(2), { place: "코엑스 A홀", manager: "김담당", contact: "010-1234-5678", notice: "06:30 B게이트 집합 · 검정 정장 · 무전기 지참", memo: "주최 측 요청: 개막식 VIP 동선 따로", need_day: 4, need_night: 1 }),
    ev(12, "구리 아파트 입주자 총회", "외부", rel(1), rel(1), { place: "구리시 체육관", manager: "박총무", contact: "010-9876-5432", need_day: 3 }),
    ev(13, "킨텍스 모터쇼", "전시", rel(5), rel(9), { place: "킨텍스 제2전시장", notice: "주차권 지급 · 07시 집합", need_day: 5 }),
    ev(14, "성수 팝업스토어 오픈", "외부", rel(-6), rel(-5), { place: "성수동", need_day: 2 }),
    ev(15, "벡스코 게임쇼", "전시", rel(12), rel(15), { place: "부산 벡스코", need_day: 4, need_night: 2 }),
  ];

  let aid = 100; const assignments = [];
  const put = (evId, d, ids, shift) => ids.forEach(m => assignments.push({ id: ++aid, work_date: d, member_id: m, shift: shift || "주간", event_id: evId }));
  for (let k = -2; k <= 2; k++) { put(11, rel(k), k === 0 ? [1, 2, 3, 4] : [1, 2, 5, 6]); if (k < 2) put(11, rel(k), [7], "야간"); }
  put(12, rel(1), [3, 4, 8]);
  for (let k = 5; k <= 9; k++) put(13, rel(k), k < 7 ? [2, 3, 5, 9, 10] : [1, 3, 5, 9]);
  put(14, rel(-6), [2, 8]); put(14, rel(-5), [2, 8]);
  for (let k = 12; k <= 13; k++) put(15, rel(k), [4, 6]);
  const night_plans = [{ work_date: rel(-1), event_id: 11, hours: 10 }];

  const users = {
    admin:  { id: "U-admin", user_metadata: { full_name: "홍우람" } },
    member: { id: "U-park",  user_metadata: { full_name: "박진원" } },
    new:    { id: "U-new2",  user_metadata: { full_name: "새 팀원", avatar_url: null }, email: "new@example.com" },
    guest:  null
  };
  window.__MOCK = {
    user: users[P.as] !== undefined ? users[P.as] : users.member,
    tables: {
      members, events, assignments, night_plans, need_overrides: [],
      admins: [{ user_id: "U-admin" }],
      link_requests: [{ user_id: "U-new", display_name: "한솔이", claimed_name: "오한솔", requested_at: new Date().toISOString() }]
    }
  };
})();
