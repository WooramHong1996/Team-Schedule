/* 첫 화면 큰 카드
   팀원: 달력에서 고른 날의 내 근무 (처음엔 오늘, 오늘 근무가 없으면 다음 근무). 달력 아래 날짜 칸 대신 이 카드가 바뀜
   간부: '오늘 현장' + 이달 숫자 카드 */
function renderHero(){
  const el = document.getElementById("hero"); if(!el) return;
  const me = ADM.admin ? "" : person;
  el.innerHTML = ADM.admin ? heroAdmin() : (me ? heroMember(me) : "");
  el.hidden = !el.innerHTML;
  countUp(el);
}
// 큰 날짜: "22  11월 일요일 / 2026 · 오늘"
function heroDate(key, extra, sm){
  const [y,m,d] = key.split("-").map(Number), wd = DOW[new Date(y,m-1,d).getDay()];
  return '<div class="hdate'+(sm?' sm':'')+'"><b>'+d+'</b><span><em>'+m+'월 '+wd+'요일</em><small>'+y+(key===todayKey?' · 오늘':'')+'</small></span>'+(extra||'')+'</div>';
}
function heroMember(me){
  const mine = DATA.assign.filter(a=>a.name===me);
  const isToday = selected===todayKey;
  let day = selected, label;
  let pick = mine.filter(a=>a.date===day);
  if(isToday && !pick.length){   // 오늘 근무가 없으면 다음 근무를 보여 줌
    const next = mine.filter(a=>a.date>todayKey).sort((a,b)=>a.date.localeCompare(b.date))[0];
    if(next){ day = next.date; pick = mine.filter(a=>a.date===day); label = '다음 근무 · '+md(day); }
  }
  label = label || (isToday ? '오늘의 근무' : (day<todayKey ? '지난 근무' : '이날 근무'));
  const back = isToday ? '' : '<button type="button" class="hback" data-today>오늘로</button>';
  const head = heroDate(selected, back);
  const rule = (t, live) => '<div class="hlabel"><span>'+t+'</span><i aria-hidden="true"></i>'+(live?'<span class="hlive"><i aria-hidden="true"></i>오늘</span>':'')+'</div>';
  if(!pick.length) return head+'<div class="hcard empty">'+rule(isToday?'오늘의 근무':'이날 근무')+
    '<b class="htitle">'+(isToday ? '예정된 근무가 없어요' : '이날은 근무가 없어요')+'</b>'+
    '<span class="hsub">'+(isToday ? '새로 배정되면 여기 가장 먼저 보여요.' : '달력에서 다른 날을 눌러 보세요.')+'</span></div>';
  // 같은 날 행사가 둘 이상이면 행사마다 한 덩어리
  const byEv = new Map(); pick.forEach(a=>{ (byEv.get(a.event) || byEv.set(a.event, []).get(a.event)).push(a.shift); });
  return head+[...byEv.entries()].map(([name, shs], i)=>{
    const ev = evMap.get(name) || {name};
    const shifts = shs.sort((x,y)=>x==="주간"?-1:1).join(" · ")+' 근무';
    const mates = new Set(DATA.assign.filter(x=>x.event===name && x.date===day && x.name!==me).map(x=>x.name)).size;
    return '<div class="hcard">'+(i===0 ? rule(label, day===todayKey) : '')+
      '<b class="htitle">'+esc(ev.name)+'</b>'+
      '<span class="hmeta"><span>'+shifts+'</span>'+(ev.place ? '<span>'+esc(ev.place)+'</span>' : '')+'<span>함께 '+mates+'명</span></span>'+
      (ev.notice ? '<dl class="hrows"><div><dt>공지</dt><dd>'+esc(ev.notice)+'</dd></div></dl>' : '')+
      '<button type="button" class="hbtn" data-evinfo="'+esc(name)+'"><span>상세 보기</span>'+icon('arrow',20)+'</button></div>';
  }).join("");
}
function heroAdmin(){
  const y=view.getFullYear(), m=view.getMonth(), s=iso(new Date(y,m,1)), e=iso(new Date(y,m+1,0));
  const inM = DATA.assign.filter(a=>a.date>=s && a.date<=e);
  const evs = DATA.events.filter(x=>x.start<=e && x.end>=s);
  const short = evs.filter(x=>shortDays(x.name)>0).length;
  const t = DATA.assign.filter(a=>a.date===todayKey), tEv = new Set(t.map(a=>a.event));
  const kpi = (label, n, unit, sub, warn) => '<div class="hkpi'+(warn?' warn':'')+'"><span class="hk-l">'+label+'</span><b data-n="'+n+'">'+n+'</b><i>'+unit+'</i>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
  // 인원 부족이 있으면 맨 먼저, 누르면 행사 관리로
  const alert = short
    ? '<button type="button" class="halert" data-atab="events"><b>'+short+'</b><span><strong>인원이 부족한 행사</strong><small>눌러서 행사 관리에서 채우기</small></span>'+icon('arrow',20)+'</button>'
    : '<div class="halert ok"><span><strong>'+(m+1)+'월 행사 인원이 모두 채워졌어요</strong></span></div>';
  return heroDate(todayKey, '', true)+alert+
    '<div class="hcard admin"><div class="hlabel"><span>오늘 현장</span><i aria-hidden="true"></i></div>'+
      '<b class="htitle">'+(t.length ? t.length+'명 · 행사 '+tEv.size+'개' : '오늘은 배정이 없어요')+'</b>'+
      (t.length ? '<span class="hmeta">'+[...tEv].map(x=>'<span>'+esc(x)+'</span>').join('')+'</span>' : '')+'</div>'+
    '<div class="hlabel"><span>'+(m+1)+'월</span><i aria-hidden="true"></i></div>'+
    '<div class="hkpis">'+
      kpi('배정', inM.length, '칸', '')+
      kpi('근무자', new Set(inM.map(a=>a.name)).size, '명', '')+
      kpi('행사', evs.length, '개', '')+
      kpi('야간', inM.filter(a=>a.shift==="야간").length, '칸', '')+
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
  if(e.target.closest("[data-today]")){ document.getElementById("today").click(); return; }
  const at = e.target.closest("[data-atab]"); if(at && ADM.admin){ admTab(at.dataset.atab); return; }
  const c = e.target.closest("[data-evinfo]"); if(c && !ADM.admin) showEventInfo(c.dataset.evinfo);
});
document.getElementById("hero").addEventListener("keydown", e=>{
  if(e.key!=="Enter") return; const c = e.target.closest("[data-evinfo]"); if(c && !ADM.admin){ e.preventDefault(); showEventInfo(c.dataset.evinfo); }
});
