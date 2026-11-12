/* 근무 일수: 달력에서 보고 있는 달의 사람별 근무 (급여 기능은 11/12 윗선 요청으로 삭제) */
function renderStats(){
  const y=view.getFullYear(), m=view.getMonth();
  const mStart = iso(new Date(y,m,1)), mEnd = iso(new Date(y,m+1,0));
  $("p-title").textContent = y+"년 "+(m+1)+"월 근무 일수";
  const blank = () => ({day:0, night:0, days:new Set()});
  const st = new Map(DATA.members.map(mb=>[mb.name, blank()]));
  DATA.assign.forEach(a=>{
    if(a.date<mStart || a.date>mEnd) return;
    if(!st.has(a.name)) st.set(a.name, blank());   // 퇴사자도 그 달 근무가 있으면 보여 줌
    const s = st.get(a.name);
    a.shift==="야간" ? s.night++ : s.day++;
    s.days.add(a.date);
  });
  const rows = [...st.entries()].map(([n,s])=>({n, s, total:s.day+s.night}))
    .sort((a,b)=>b.s.days.size-a.s.days.size || b.total-a.total || a.n.localeCompare(b.n));
  const sum = rows.reduce((t,r)=>({day:t.day+r.s.day, night:t.night+r.s.night, ppl:t.ppl+(r.total?1:0)}), {day:0, night:0, ppl:0});
  $("p-sum").innerHTML =
    '<div class="kpi"><span>근무 인원</span><b>'+sum.ppl+'명</b></div>'+
    '<div class="kpi"><span>주간</span><b>'+sum.day+'회</b></div>'+
    '<div class="kpi"><span>야간</span><b>'+sum.night+'회</b></div>';
  $("p-table").innerHTML = '<thead><tr><th>이름</th><th class="r">근무일</th><th class="r">주간</th><th class="r">야간</th></tr></thead><tbody>'+
    rows.map(r=>'<tr class="'+(r.total?'':'idle')+'"><td>'+esc(r.n)+(noCert.has(r.n)?' <span class="miss">미이수</span>':'')+'</td>'+
      '<td class="r">'+r.s.days.size+'일</td><td class="r">'+r.s.day+'회</td><td class="r">'+r.s.night+'회</td></tr>').join("")+
    '</tbody><tfoot><tr><td>합계</td><td class="r"></td><td class="r">'+sum.day+'회</td><td class="r">'+sum.night+'회</td></tr></tfoot>';
}
