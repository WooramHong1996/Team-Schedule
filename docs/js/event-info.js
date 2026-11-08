/* 팀원 화면: 행사를 누르면 그 행사 자세히 보기 (장소 · 담당자 · 팀원 공지 · 내 근무 날짜 · 함께 일하는 사람) */
function showEventInfo(name){
  const ev = (DATA.events||[]).find(x=>x.name===name); if(!ev) return;
  const me = person;
  const days = datesBetween(ev.start, ev.end).length;

  // 내 근무 날짜 (주간/야간)
  const mine = {};
  DATA.assign.forEach(a=>{ if(a.event===name && a.name===me) (mine[a.date] = mine[a.date] || []).push(a.shift); });
  const myDates = Object.keys(mine).sort();
  const rows = myDates.map(d=>{
    const with_ = s => DATA.assign.filter(a=>a.event===name && a.date===d && a.shift===s && a.name!==me).map(a=>a.name);
    const shifts = mine[d].sort((a,b)=>a==="주간"?-1:1);
    const cls = d<todayKey ? " past" : d===todayKey ? " today" : "";
    return '<div class="eirow'+cls+'"><div class="eid">'+md(d)+(d===todayKey?' <span class="eitoday">오늘</span>':'')+'</div>'+
      shifts.map(s=>{ const w = with_(s);
        return '<div class="eis"><span class="'+(s==="야간"?'nbadge':'dbadge')+'">'+s+'</span>'+
          '<span class="eiw">'+(w.length ? '함께: '+w.map(n=>esc(n)+(noCert.has(n)?'<span class="miss">미이수</span>':'')).join(", ") : '혼자 근무')+'</span></div>'; }).join("")+
      '</div>'; }).join("");

  const hasTel = /[0-9]/.test(ev.contact||"");
  $("ei-body").innerHTML =
    '<div class="eihead"><i class="sw '+clsFor(ev.type)+'"></i><h2 id="ei-title">'+esc(ev.name)+'</h2></div>'+
    '<div class="eimeta">'+esc(ev.type||"")+(ev.type?' · ':'')+md(ev.start)+(ev.end!==ev.start?' – '+md(ev.end):'')+' ('+days+'일)</div>'+
    '<dl class="eidl">'+
      (ev.place ? '<dt>장소</dt><dd>'+esc(ev.place)+' <a class="eimap" href="https://map.naver.com/p/search/'+encodeURIComponent(ev.place)+'" target="_blank" rel="noopener">'+icon('map',14)+' 지도</a></dd>' : '')+
      (ev.manager || ev.contact ? '<dt>담당</dt><dd>'+esc(ev.manager||"")+(hasTel ? ' <a class="eitel" href="'+esc(telHref(ev.contact))+'">'+icon('phone',14)+' '+esc(ev.contact)+'</a>' : (ev.contact?' '+esc(ev.contact):''))+'</dd>' : '')+
    '</dl>'+
    (ev.notice ? '<div class="einotice"><b>공지</b><p>'+esc(ev.notice)+'</p></div>' : '')+
    '<h3>내 근무 <small>'+myDates.length+'일</small></h3>'+
    (rows || '<p class="empty">이 행사에 배정된 날이 없어요.</p>');
  const dlg = $("evinfo");
  if(typeof dlg.showModal === "function"){ if(!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
  const t = dlg.querySelector(".eirow.today") || dlg.querySelector(".eirow:not(.past)");
  if(t) setTimeout(()=>t.scrollIntoView({block:"nearest"}), 30);
}
function closeEventInfo(){ const d = $("evinfo"); if(d.open){ if(typeof d.close==="function") d.close(); else d.removeAttribute("open"); } }
$("ei-close").addEventListener("click", closeEventInfo);
$("evinfo").addEventListener("click", e=>{ if(e.target === $("evinfo")) closeEventInfo(); });   // 바깥 누르면 닫기

// 팀원 화면에서 행사 카드 · 이번 달 행사 목록을 누르면 열기 (관리자는 행사 관리로 이동)
["daypanel", "evlist"].forEach(id=>{
  const el = document.getElementById(id);
  el.addEventListener("click", e=>{ if(ADM.admin) return; const c = e.target.closest("[data-evinfo]"); if(c && !e.target.closest("a")) showEventInfo(c.dataset.evinfo); });
  el.addEventListener("keydown", e=>{ if(ADM.admin || e.key!=="Enter") return; const c = e.target.closest("[data-evinfo]"); if(c){ e.preventDefault(); showEventInfo(c.dataset.evinfo); } });
});
