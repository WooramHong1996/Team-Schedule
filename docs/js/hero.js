/* 첫 화면 큰 카드: 팀원은 '오늘 내 근무'(없으면 다음 근무), 간부는 '오늘 현장' + 이달 숫자 카드 */
function renderHero(){
  const el = document.getElementById("hero"); if(!el) return;
  const me = ADM.admin ? "" : person;
  el.innerHTML = ADM.admin ? heroAdmin() : (me ? heroMember(me) : "");
  el.hidden = !el.innerHTML;
  countUp(el);
}
function heroMember(me){
  const mine = DATA.assign.filter(a=>a.name===me);
  const today = mine.filter(a=>a.date===todayKey);
  const next = today.length ? null : mine.filter(a=>a.date>todayKey).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const pick = today.length ? today : (next ? mine.filter(a=>a.date===next.date) : []);
  if(!pick.length) return '<div class="hcard"><span class="hlabel">'+md(todayKey)+'</span><b class="htitle">예정된 근무가 없어요</b><span class="hsub">새로 배정되면 여기 가장 먼저 보여요.</span></div>';
  const a = pick[0], ev = evMap.get(a.event) || {name:a.event};
  const shifts = pick.map(x=>x.shift).sort((x,y)=>x==="주간"?-1:1).join(" · ");
  const mates = DATA.assign.filter(x=>x.event===a.event && x.date===a.date && x.name!==me).length;
  return '<div class="hcard" data-evinfo="'+esc(a.event)+'" role="button" tabindex="0">'+
    '<span class="hlabel">'+(today.length ? '오늘 · '+md(todayKey) : '다음 근무 · '+md(a.date))+'</span>'+
    '<b class="htitle">'+esc(ev.name)+'</b>'+
    '<span class="hmeta">'+
      '<span>'+icon('check',15)+' '+shifts+'</span>'+
      (ev.place ? '<span>'+icon('map',15)+' '+esc(ev.place)+'</span>' : '')+
      '<span>'+icon('users',15)+' 함께 '+mates+'명</span>'+
    '</span>'+
    (ev.notice ? '<span class="hnote">'+icon('pin',14)+' '+esc(ev.notice)+'</span>' : '')+
    '<span class="hmore">자세히 보기 ›</span></div>';
}
function heroAdmin(){
  const y=view.getFullYear(), m=view.getMonth(), s=iso(new Date(y,m,1)), e=iso(new Date(y,m+1,0));
  const inM = DATA.assign.filter(a=>a.date>=s && a.date<=e);
  const evs = DATA.events.filter(x=>x.start<=e && x.end>=s);
  const short = evs.filter(x=>shortDays(x.name)>0).length;
  const t = DATA.assign.filter(a=>a.date===todayKey), tEv = new Set(t.map(a=>a.event));
  const kpi = (ic, label, n, unit, sub, warn) => '<div class="hkpi'+(warn?' warn':'')+'"><span class="hk-l">'+label+icon(ic,17)+'</span><b data-n="'+n+'">'+n+'</b><i>'+unit+'</i>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
  return '<div class="hcard admin"><span class="hlabel">오늘 현장 · '+md(todayKey)+'</span>'+
      '<b class="htitle">'+(t.length ? t.length+'명 · 행사 '+tEv.size+'개' : '오늘은 배정이 없어요')+'</b>'+
      (t.length ? '<span class="hsub">'+[...tEv].map(esc).join(' · ')+'</span>' : '')+'</div>'+
    '<div class="hkpis">'+
      kpi('calendar', (m+1)+'월 배정', inM.length, '칸', '주간 '+inM.filter(a=>a.shift!=="야간").length+' · 야간 '+inM.filter(a=>a.shift==="야간").length)+
      kpi('users', '근무자', new Set(inM.map(a=>a.name)).size, '명', '')+
      kpi('flag', '행사', evs.length, '개', '')+
      kpi('alert', '인원 부족', short, '개', short ? '행사 관리에서 확인' : '모두 채워졌어요', short>0)+
    '</div>';
}
// 처음 한 번만 숫자가 0부터 올라가요 (움직임 줄이기 설정이면 바로 표시)
let heroCounted = false;
function countUp(el){
  if(heroCounted || matchMedia("(prefers-reduced-motion: reduce)").matches){ return; }
  heroCounted = true;
  document.body.classList.add("intro"); setTimeout(()=>document.body.classList.remove("intro"), 1200);   // 떠오르는 효과도 처음 한 번만
  el.querySelectorAll("[data-n]").forEach(b=>{
    const to = Number(b.dataset.n); if(!to) return;
    const t0 = performance.now(), dur = 900;
    const step = t=>{ const k = Math.min(1,(t-t0)/dur), v = Math.round(to*(1-Math.pow(1-k,3))); b.textContent = v; if(k<1) requestAnimationFrame(step); };
    b.textContent = 0; requestAnimationFrame(step);
  });
}
document.getElementById("hero").addEventListener("click", e=>{
  const c = e.target.closest("[data-evinfo]"); if(c && !ADM.admin) showEventInfo(c.dataset.evinfo);
});
document.getElementById("hero").addEventListener("keydown", e=>{
  if(e.key!=="Enter") return; const c = e.target.closest("[data-evinfo]"); if(c && !ADM.admin){ e.preventDefault(); showEventInfo(c.dataset.evinfo); }
});
