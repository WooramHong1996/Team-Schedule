/* 관리자 공통: 탭 · 날짜 패널 카드 · 필요 인원 계산 */
// ================= 관리자 모드 =================
// 관리자(간부) 계정으로 로그인하면 boot()가 ADM.admin 을 켭니다. 권한은 DB(RLS)가 다시 확인해요.
const ADM = { admin:false, tab:"cal" };
function admFail(err){ busy(false); toast(err && err.message ? err.message : String(err), true);
  if(/로그인이 만료/.test(String(err && err.message))) doLogout(); }

function admExit(){ if(confirm("로그아웃할까요?")) doLogout(); }
function admApply(data){ setData(data); fillPeople(); showUpdated(); render(); }
function admTab(t){
  // 행사 화면을 보다가 '행사 관리' 탭을 다시 누르면 목록으로
  if(t==="events" && ADM.tab==="events" && ADM.evOpen && typeof closeEvent==="function"){ closeEvent(); return; }
  ADM.tab = t;
  document.querySelectorAll(".atabs button").forEach(b=>b.setAttribute("aria-selected", b.dataset.t===t ? "true":"false"));
  document.body.dataset.tab = t;
  if(t!=="cal") admRenderPanels();
}
document.querySelectorAll(".atabs button").forEach(b=>b.addEventListener("click", ()=>admTab(b.dataset.t)));
$("admexit").addEventListener("click", ()=>admExit());

// ---------- 공용 ----------
function eventsSorted(){ return [...DATA.events].sort((a,b)=>(a.start||"").localeCompare(b.start||"") || a.name.localeCompare(b.name)); }
// 일정 화면의 날짜 패널: 카드를 누르면 그 행사 관리로 이동 (수정은 행사 관리에서)
$("daypanel").addEventListener("click", e=>{
  if(e.target.closest("a")) return;   // 연락처 전화 걸기는 그대로
  const jp = e.target.closest("[data-jump]");
  if(jp && ADM.admin) jumpToEvent(jp.dataset.jump, selected);
});
// 필요 인원: 그 날짜 값(필요인원 탭) → 없으면 행사 기본(M·N)
function needFor(date, name){
  const ev = DATA.events.find(x=>x.name===name)||{}, o = (DATA.needOv||{})[date+"|"+name]||[null,null];
  return [o[0]??ev.needDay??null, o[1]??ev.needNight??null];
}
function needLine(date, it){
  const [nd, nn] = needFor(date, it.ev.name);
  if(nd==null && nn==null) return '<span class="needl">필요 인원 미입력</span>';
  const part = (lab, need, got) => need==null ? '' : '<span>'+lab+' 필요 <b>'+need+'</b> · 배정 <b>'+got+'</b> '+
    (got<need ? '<span class="bad">'+(need-got)+'명 부족</span>' : got>need ? '<span class="over">'+(got-need)+'명 초과</span>' : '<span class="ok">OK</span>')+'</span>';
  return '<span class="needl">'+part("주간", nd, it.day.length)+part("야간", nn, it.night.length)+'</span>';
}
function dayShort(date, items){
  if(!ADM.admin) return false;
  return items.some(it=>{ const [nd,nn] = needFor(date, it.ev.name); return (nd!=null && it.day.length<nd) || (nn!=null && it.night.length<nn); });
}
function jumpToEvent(name, date){
  const ev = DATA.events.find(x=>x.name===name); if(!ev) return;
  // 목록의 달도 그 행사(또는 누른 날짜)의 달로 맞춰 둠 — "‹ 목록"을 누르면 그 달 목록이 보이게
  const base = date || (ev.start<=iso(new Date(view.getFullYear(), view.getMonth()+1, 0)) && ev.end>=iso(new Date(view.getFullYear(), view.getMonth(), 1)) ? iso(view) : ev.start);
  ADM.evM = new Date(Number(base.slice(0,4)), Number(base.slice(5,7))-1, 1);
  $("e-q").value = "";
  admTab("events");
  openEvent(name, {tab:"assign", date: date && date>=ev.start && date<=ev.end ? date : null});
}
function admDayExtra(it){
  const e = it.ev;
  const names = arr => arr.length ? who(arr) : "-";
  const NHm = DATA.nightHours||{}, key = selected+'|'+e.name, planned = key in NHm, h = NHm[key];
  return '<div class="item '+e.cls+' jumpcard" data-jump="'+esc(e.name)+'" role="button" tabindex="0" title="행사 관리로 이동">'+
    '<span class="t" style="grid-column:1/-1">'+esc(e.name)+'</span>'+
    needLine(selected, it)+
    '<span class="k">주간</span><span class="v">'+names(it.day)+'</span>'+
    '<span class="k">야간</span><span class="v">'+names(it.night)+'</span>'+
    ((it.night.length || planned) ? '<span class="nh">'+(planned?'야간 예정':'야간')+' · '+(h?'<b>'+h+'시간</b> × 각자 시급':'일당')+(planned&&!it.night.length?' · <span class="miss">미배정</span>':'')+'</span>' : '')+
    (e.place?'<span class="k">장소</span><span class="v">'+esc(e.place)+'</span>':'')+
    (e.manager||e.contact?'<span class="k">담당</span><span class="v">'+esc(e.manager||"")+(e.contact?' · <a class="eitel" href="tel:'+esc(e.contact.replace(/[^0-9+]/g,""))+'">'+esc(e.contact)+'</a>':'')+'</span>':'')+
    (e.memo?'<span class="k">메모</span><span class="v memo">'+esc(e.memo)+'</span>':'')+'</div>';
}

// 관리자 탭 화면을 다시 그림 (각 탭의 그리기 함수는 admin-*.js)
function admRenderPanels(){
  if(!ADM.admin) return;
  admRenderMembers();
  renderEventList();
  renderPay();
}
