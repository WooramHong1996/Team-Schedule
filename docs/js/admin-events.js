/* 행사 관리: 행사 추가·수정·삭제 · 야간 날짜 · 날짜별 필요 인원 · 일별 인원 배정 */
// ---------- 행사 관리 ----------
// ---------- 야간 날짜 편집 (행사 추가 / 행사 목록에서 공용) ----------
function nightsOf(ev){ const out={}; Object.entries(DATA.nightHours||{}).forEach(([k,h])=>{ const i=k.indexOf("|"); if(k.slice(i+1)===ev) out[k.slice(0,i)]=h; }); return out; }
function nightRowsHTML(start, end, cur){
  const ds = datesBetween(start, end);
  if(!ds.length) return '<p class="empty">시작일·종료일을 고르면 날짜가 나와요.</p>';
  return ds.map(d=>{ const on = d in cur, h = cur[d]||"";
    return '<div class="nrow"><input type="checkbox" data-d="'+d+'" aria-label="'+md(d)+' 야간"'+(on?' checked':'')+'>'+
      '<span>'+md(d)+'</span><input type="number" data-h="'+d+'" min="0" max="24" step="0.5" inputmode="decimal" placeholder="일당 · 시간 입력" value="'+h+'"'+(on?'':' disabled')+'></div>'; }).join("");
}
function readNights(box){ return [...box.querySelectorAll("input[data-d]:checked")].map(c=>({date:c.dataset.d, hours: box.querySelector('[data-h="'+c.dataset.d+'"]').value})); }
function wireNightBox(box){
  box.addEventListener("change", e=>{ const c=e.target.closest("input[data-d]"); if(!c) return;
    const h = box.querySelector('[data-h="'+c.dataset.d+'"]'); h.disabled = !c.checked; if(c.checked) h.focus(); });
}
wireNightBox($("e-nights"));
function refreshAddNights(){
  const f = $("e-form").elements, keep = {};
  readNights($("e-nights")).forEach(n=>keep[n.date]=n.hours);
  $("e-nights").innerHTML = nightRowsHTML(f.start.value, f.end.value, keep);
}
["start","end"].forEach(n=>$("e-form").elements[n].addEventListener("change", ()=>setTimeout(refreshAddNights)));

// 행사 추가 때 같이 넣을 인원 (기간 전체)
const ePeople = [];   // [{name, shift}]
function drawPTags(){
  $("e-ptags").innerHTML = ePeople.length
    ? ePeople.map((p,i)=>'<button type="button" class="tag" data-pi="'+i+'" aria-label="'+esc(p.name)+' 빼기">'+esc(p.name)+'<small>'+(p.shift?'야간':'주간')+'</small><span class="x" aria-hidden="true">×</span></button>').join("")
    : '<span class="hint">아직 고른 사람이 없어요</span>';
}
function addPTag(){
  const v = $("e-pin").value.trim(); if(!v) return;
  if(!DATA.members.some(m=>m.name===v)) return toast("팀원 명단에 없는 이름이에요: "+v, true);
  const sh = Number($("e-pshift").value);
  if(!ePeople.some(p=>p.name===v && p.shift===sh)) ePeople.push({name:v, shift:sh});
  $("e-pin").value = ""; drawPTags(); $("e-pin").focus();
}
$("e-padd").addEventListener("click", addPTag);
$("e-pin").addEventListener("keydown", e=>{ if(e.key==="Enter" && !e.isComposing){ e.preventDefault(); addPTag(); } });
$("e-pin").addEventListener("input", e=>{ if(e.inputType==="insertReplacementText") addPTag(); });
$("e-ptags").addEventListener("click", e=>{ const t=e.target.closest("[data-pi]"); if(!t) return; ePeople.splice(Number(t.dataset.pi),1); drawPTags(); });

$("e-form").addEventListener("submit", ev=>{
  ev.preventDefault();
  const f = Object.fromEntries(new FormData($("e-form")).entries());
  if(f.end < f.start) return toast("종료일이 시작일보다 빨라요.", true);
  f.nights = readNights($("e-nights"));
  const people = ePeople.slice(), name = f.name.trim(), days = datesBetween(f.start, f.end);
  const finish = (data, msg) => {
    busy(false); $("e-form").reset(); ePeople.length = 0; drawPTags(); refreshAddNights(); $("e-adddet").open = false;
    admApply(data); toast(msg);
    // 새 행사 화면(인원 배정)으로 이동 (날짜마다 다르면 여기서 바로 고치면 돼요)
    openEvent(name, {tab:"assign"});
  };
  // 사람을 주간/야간별로 묶어 차례로 넣음
  const groups = [0,1].map(sh=>({shift:sh, names: people.filter(p=>p.shift===sh).map(p=>p.name)})).filter(g=>g.names.length);
  const putPeople = (i, data, overwrite) => {
    if(i>=groups.length) return finish(data, "「"+name+"」 행사를 추가했어요."+(people.length?" (인원 "+people.length+"명)":"")+(f.nights.length?" (야간 "+f.nights.length+"일)":""));
    const g = groups[i];
    api.adminSetAssign({dates:days, names:g.names, shift:g.shift, event:name, onlyEvent:"", overwrite:!!overwrite}).then(r=>{
      if(!r.ok && r.conflicts){
        const list = r.conflicts.slice(0,8).map(c=>"· "+c.date.slice(5)+" "+c.name+" → 이미 「"+c.current+"」").join("\n");
        if(confirm("이미 다른 행사에 배정된 칸이 "+r.conflicts.length+"개 있어요.\n"+list+"\n\n「"+name+"」(으)로 바꿀까요? (취소하면 그 칸만 빼고 넣어요)")) return putPeople(i, data, true);
        // 취소: 겹치지 않는 칸만 넣기
        const busyKey = new Set(r.conflicts.map(c=>c.date+"|"+c.name));
        const free = days.flatMap(d=>g.names.filter(n=>!busyKey.has(d+"|"+n)).map(n=>[d,n]));
        const byName = {}; free.forEach(([d,n])=>(byName[n]=byName[n]||[]).push(d));
        const names = Object.keys(byName);
        const step = (k, dd) => { if(k>=names.length) return putPeople(i+1, dd, false);
          api.adminSetAssign({dates:byName[names[k]], names:[names[k]], shift:g.shift, event:name, onlyEvent:"", overwrite:false}).then(rr=>step(k+1, rr.data||dd), admFail); };
        return step(0, data);
      }
      putPeople(i+1, r.data||data, false);
    }, admFail);
  };
  busy(true);
  api.adminAddEvent(f).then(r=>putPeople(0, r.data, false), admFail);
});
$("e-form").elements.start.addEventListener("change", e=>{ const end=$("e-form").elements.end; if(!end.value || end.value<e.target.value) end.value=e.target.value; });
// ---------- 행사 하나 화면 ----------
// 목록에서 행사를 누르면 그 행사만 보이는 화면으로. 휴대폰 뒤로 가기 = 목록으로.
function evOrder(){ return (ADM.evOrder && ADM.evOrder.length) ? ADM.evOrder : eventsSorted().map(e=>e.name); }
function openEvent(name, opt){
  opt = opt || {};
  if(!DATA.events.some(x=>x.name===name)) return;
  ADM.evOpen = name; ADM.evTab = opt.tab || "assign";
  const st = {ev:name};
  if(opt.push === false) {}
  else if(history.state && history.state.ev) history.replaceState(st, "");
  else history.pushState(st, "");
  renderEventDetail();
  window.scrollTo(0, 0);
  if(opt.date) setTimeout(()=>{ const d = $("ed-body").querySelector('[data-day="'+opt.date+'"]');
    if(d){ d.scrollIntoView({block:"center"}); d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash"); } }, 30);
}
function showEventList(){
  ADM.evOpen = null;
  $("e-detail").hidden = true; $("e-listview").hidden = false;
  renderEventList();
  if(ADM.lastOpen){ const row = [...document.querySelectorAll("[data-open]")].find(x=>x.dataset.open===ADM.lastOpen);
    if(row){ row.scrollIntoView({block:"center"}); row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); } }
}
function closeEvent(){ if(history.state && history.state.ev) history.back(); else showEventList(); }
window.addEventListener("popstate", e=>{
  if(!ADM.admin) return;
  const name = e.state && e.state.ev;
  if(name && DATA.events.some(x=>x.name===name)){ admTab("events"); openEvent(name, {push:false, tab:ADM.evTab}); }
  else if(ADM.evOpen) showEventList();
});
function shortDays(name){
  const ev = DATA.events.find(x=>x.name===name); if(!ev) return 0;
  const by = {}; DATA.assign.forEach(a=>{ if(a.event===name){ const g = by[a.date] = by[a.date]||[0,0]; g[a.shift==="야간"?1:0]++; } });
  return datesBetween(ev.start, ev.end).filter(d=>{ const [nd,nn] = needFor(d, name), g = by[d]||[0,0];
    return (nd!=null && g[0]<nd) || (nn!=null && g[1]<nn); }).length;
}
// 종류 고르기: 전시/외부. 종류가 없는 행사는 '종류 없음'을 골라 둬서, 저장해도 다른 종류로 바뀌지 않게
function typeOptions(cur){
  const known = TYPE_ORDER.includes(cur);
  return (known ? '' : '<option value="" selected>종류 없음</option>') +
    TYPE_ORDER.map(t=>'<option value="'+t+'"'+(cur===t?' selected':'')+'>'+t+'</option>').join("");
}
function renderEventDetail(){
  const name = ADM.evOpen, ev = DATA.events.find(x=>x.name===name);
  if(!ev){ showEventList(); return; }
  ADM.lastOpen = name;
  $("e-listview").hidden = true; $("e-detail").hidden = false;
  const cnt = DATA.assign.filter(a=>a.event===name).length, sh = shortDays(name);
  const nn = Object.keys(nightsOf(name)).length;
  const closed = datesBetween(ev.start, ev.end).some(d=>(DATA.closings||{})[d.slice(0,7)]);
  $("ed-head").innerHTML =
    '<h2><i class="sw '+clsFor(ev.type)+'"></i>'+esc(ev.name)+'</h2>'+
    '<span class="meta">'+esc(ev.type||"종류 없음")+' · '+mdShort(ev.start)+(ev.end!==ev.start?" – "+mdShort(ev.end):"")+' ('+datesBetween(ev.start, ev.end).length+'일)'+(ev.place?' · '+esc(ev.place):'')+'</span>'+
    (ev.manager||ev.contact ? '<span class="meta">담당 '+esc(ev.manager||"")+(ev.contact?' · <a class="eitel" href="'+esc(telHref(ev.contact))+'">'+esc(ev.contact)+'</a>':'')+'</span>' : '')+
    (ev.notice ? '<span class="memo"><b>팀원 공지</b> '+esc(ev.notice)+'</span>' : '')+
    (ev.memo ? '<span class="memo"><b>메모</b> '+esc(ev.memo)+'</span>' : '')+
    '<div class="ebadges"><span class="ebadge">배정 '+cnt+'칸</span>'+
      (sh ? '<span class="ebadge bad">인원 부족 '+sh+'일</span>' : (ev.needDay!=null||ev.needNight!=null ? '<span class="ebadge ok">필요 인원 OK</span>' : '<span class="ebadge">필요 인원 미입력</span>'))+
      (nn ? '<span class="ebadge">야간 '+nn+'일</span>' : '')+(closed ? '<span class="ebadge">급여 마감된 날 있음</span>' : '')+'</div>';
  const order = evOrder(), k = order.indexOf(name);
  $("ed-prev").disabled = k<=0; $("ed-next").disabled = k<0 || k>=order.length-1;
  document.querySelectorAll("[data-etab]").forEach(b=>b.setAttribute("aria-selected", b.dataset.etab===ADM.evTab ? "true":"false"));
  const box = $("ed-body"); box.dataset.nbox = name;
  if(ADM.evTab === "assign") return renderAssignBox(box, name);
  if(ADM.evTab === "info"){
    const v = k2 => esc(ev[k2]==null?"":ev[k2]);
    box.dataset.mode = "edit";
    box.innerHTML = '<div class="form">'+
      '<label class="frow"><span>행사명</span><input data-f="name" value="'+v("name")+'"></label>'+
      '<div class="fgrid"><label class="frow"><span>종류</span><select data-f="type">'+typeOptions(ev.type)+'</select></label>'+
      '<label class="frow"><span>시작일</span><input type="date" data-f="start" value="'+v("start")+'"></label>'+
      '<label class="frow"><span>종료일</span><input type="date" data-f="end" value="'+v("end")+'"></label></div>'+
      '<div class="fgrid"><label class="frow"><span>장소</span><input data-f="place" value="'+v("place")+'"></label>'+
      '<label class="frow"><span>담당자</span><input data-f="manager" value="'+v("manager")+'"></label>'+
      '<label class="frow"><span>연락처</span><input data-f="contact" inputmode="tel" value="'+v("contact")+'"></label></div>'+
      '<div class="fgrid"><label class="frow"><span>필요 인원 · 주간 (하루 기본)</span><input type="number" min="0" data-f="needDay" value="'+v("needDay")+'"></label>'+
      '<label class="frow"><span>필요 인원 · 야간 (하루 기본)</span><input type="number" min="0" data-f="needNight" value="'+v("needNight")+'"></label></div>'+
      '<label class="frow"><span>팀원 공지 — 팀원 화면에 보여요 (집합 시간·복장·준비물 등)</span><textarea data-f="notice">'+v("notice")+'</textarea></label>'+
      '<label class="frow"><span>메모 — 관리자만 보여요</span><textarea data-f="memo">'+v("memo")+'</textarea></label>'+
      '<div class="actions"><button type="button" class="btn" data-esave>저장</button><span class="count">이름을 바꿔도 배정은 그대로 이어져요</span></div></div>'+
      '<div class="dangerzone"><button type="button" class="danger" data-del="'+esc(name)+'">이 행사 삭제</button><span class="count">지난 근무 기록이 있는 행사는 지울 수 없어요</span></div>';
    return;
  }
  // 야간 · 필요 인원
  box.dataset.mode = "extra";
  const ov = DATA.needOv||{};
  box.innerHTML =
    '<h3>야간 날짜</h3><p class="foot tight">야간이 있는 날만 체크 · 시간제면 시간 입력 (비우면 일당)</p>'+
    '<div class="nights">'+nightRowsHTML(ev.start, ev.end, nightsOf(name))+'</div>'+
    '<div class="actions"><button type="button" class="btn" data-nsave>야간 날짜 저장</button></div>'+
    '<h3>날짜별 필요 인원</h3><p class="foot tight">비워 두면 기본(주간 '+(ev.needDay??"-")+' · 야간 '+(ev.needNight??"-")+')을 써요. 그날만 다르면 숫자를 적으세요.</p>'+
    '<div class="nights">'+datesBetween(ev.start, ev.end).map(d=>{ const o = ov[d+"|"+name]||[null,null];
      return '<div class="nrow need"><span>'+md(d)+'</span>'+
        '<input type="number" min="0" data-nd="'+d+'" placeholder="주간 '+(ev.needDay??"-")+'" value="'+(o[0]??"")+'" aria-label="'+md(d)+' 주간 필요">'+
        '<input type="number" min="0" data-nn="'+d+'" placeholder="야간 '+(ev.needNight??"-")+'" value="'+(o[1]??"")+'" aria-label="'+md(d)+' 야간 필요"></div>'; }).join("")+'</div>'+
    '<div class="actions"><button type="button" class="btn" data-ndsave>날짜별 인원 저장</button></div>';
}
$("ed-back").addEventListener("click", closeEvent);
$("ed-prev").addEventListener("click", ()=>{ const o = evOrder(), k = o.indexOf(ADM.evOpen); if(k>0) openEvent(o[k-1], {tab:ADM.evTab}); });
$("ed-next").addEventListener("click", ()=>{ const o = evOrder(), k = o.indexOf(ADM.evOpen); if(k>=0 && k<o.length-1) openEvent(o[k+1], {tab:ADM.evTab}); });
document.querySelector(".edtabs").addEventListener("click", e=>{ const b = e.target.closest("[data-etab]"); if(!b) return; ADM.evTab = b.dataset.etab; renderEventDetail(); });
$("e-list").addEventListener("click", e=>{ const r = e.target.closest("[data-open]"); if(r) openEvent(r.dataset.open); });
$("e-list").addEventListener("keydown", e=>{ if(e.key!=="Enter") return; const r = e.target.closest("[data-open]"); if(r){ e.preventDefault(); openEvent(r.dataset.open); } });

$("e-detail").addEventListener("change", e=>{ const c=e.target.closest("input[data-d]"); if(!c) return;
  const box=c.closest(".nedit"), h=box.querySelector('[data-h="'+c.dataset.d+'"]'); h.disabled=!c.checked; if(c.checked) h.focus(); });
$("e-detail").addEventListener("click", e=>{
  const name = ADM.evOpen; if(!name) return;
  const arm = e.target.closest("[data-arm]");
  if(arm){
    const [d, n, s] = JSON.parse(arm.dataset.arm);
    if(!confirm(md(d)+" "+(s?"야간":"주간")+" "+n+" 님을 「"+name+"」에서 뺄까요?")) return;
    assignOne(name, [d], n, s, true, false); return;
  }
  const an = e.target.closest("[data-anight]");
  if(an){ (ADM.nightOpen = ADM.nightOpen || new Set()).add(an.dataset.anight); renderAssignBox($("ed-body"), name); return; }
  if(e.target.closest("[data-aall]")){ addFromInput($("ed-body").querySelector("#ad-all-n")); return; }
  if(e.target.closest("[data-esave]")){
    const f = {}; $("ed-body").querySelectorAll("[data-f]").forEach(x=>f[x.dataset.f]=x.value);
    if(f.end < f.start) return toast("종료일이 시작일보다 빨라요.", true);
    busy(true);
    api.adminUpdateEvent(name, f).then(r=>{ busy(false);
      const nn = f.name.trim(); if(nn && nn!==name){ ADM.evOpen = nn; history.replaceState({ev:nn}, ""); }
      admApply(r.data); toast("「"+f.name+"」 저장했어요."); }, admFail);
    return;
  }
  if(e.target.closest("[data-ndsave]")){
    const box = $("ed-body");
    const rows = [...box.querySelectorAll("[data-nd]")].map(x=>({date:x.dataset.nd, day:x.value, night: box.querySelector('[data-nn="'+x.dataset.nd+'"]').value}));
    busy(true);
    api.adminSetEventNeeds(name, rows).then(r=>{ busy(false); admApply(r.data); toast("「"+name+"」 날짜별 인원을 저장했어요."); }, admFail);
    return;
  }
  if(e.target.closest("[data-nsave]")){
    const nights = readNights($("ed-body"));
    busy(true);
    api.adminSetEventNights(name, nights).then(r=>{ busy(false); admApply(r.data); toast("「"+name+"」 야간 "+nights.length+"일 저장했어요."); }, admFail);
    return;
  }
  if(!e.target.closest("[data-del]")) return;
  if(!confirm("「"+name+"」 행사를 지울까요?\n(이미 지난 근무 기록이 있는 행사는 급여 기록 보호를 위해 지울 수 없어요)")) return;
  const go = clear => api.adminDeleteEvent(name, clear).then(r=>{
      if(!r.ok && r.assigned){ busy(false);
        if(confirm("이 행사에 배정된 칸이 "+r.assigned+"개 있어요.\n배정까지 모두 지우고 행사를 삭제할까요?")) { busy(true); go(true); }
        return; }
      busy(false); ADM.lastOpen = null; admApply(r.data); closeEvent(); toast("지웠어요."+(r.cleared?" (배정 "+r.cleared+"칸도 함께)":""));
    }, admFail);
  busy(true); go(false);
});
$("e-month").addEventListener("change", ()=>{ const v=$("e-month").value; if(!/^\d{4}-\d{2}$/.test(v)) return;
  ADM.evM = new Date(Number(v.slice(0,4)), Number(v.slice(5,7))-1, 1); $("e-q").value=""; admRenderPanels(); });
$("e-q").addEventListener("input", ()=>admRenderPanels());
$("e-prev").addEventListener("click", ()=>{ const b=ADM.evM||new Date(); ADM.evM=new Date(b.getFullYear(), b.getMonth()-1, 1); $("e-q").value=""; admRenderPanels(); });
$("e-next").addEventListener("click", ()=>{ const b=ADM.evM||new Date(); ADM.evM=new Date(b.getFullYear(), b.getMonth()+1, 1); $("e-q").value=""; admRenderPanels(); });


// ---------- 행사 관리 → 인원 배정 (일별) ----------
function renderAssignBox(box, name){
  const ev = DATA.events.find(x=>x.name===name); if(!ev) return;
  box.dataset.mode = "assign"; box.hidden = false;
  const byDay = {};
  DATA.assign.forEach(a=>{ if(a.event===name){ (byDay[a.date]=byDay[a.date]||{주간:[],야간:[]})[a.shift].push(a.name); } });
  const NHm = DATA.nightHours||{};
  const open = ADM.nightOpen || (ADM.nightOpen = new Set());
  const chip = (n,d,s) => '<button type="button" class="ad-chip" data-arm="'+esc(JSON.stringify([d,n,s]))+'" aria-label="'+esc(n)+' 빼기">'+esc(n)+(noCert.has(n)?' <span class="miss">미이수</span>':'')+'<span class="x" aria-hidden="true">×</span></button>';
  const adder = (d,s) => '<span class="ad-add"><input list="memlist" placeholder="이름 추가" data-aadd="'+esc(JSON.stringify([d,s]))+'" aria-label="'+md(d)+' '+(s?'야간':'주간')+' 이름 추가" enterkeyhint="done"></span>';
  const days = datesBetween(ev.start, ev.end);
  box.innerHTML =
    '<div class="ad-all"><b>여러 날 한 번에</b> <input list="memlist" placeholder="이름" id="ad-all-n">'+
      '<select id="ad-all-s"><option value="0">주간</option><option value="1">야간</option></select>'+
      '<span>'+md(days[0])+' ~ '+md(days[days.length-1])+' 전체에</span><button type="button" class="ad-more" data-aall>추가</button></div>'+
    days.map(d=>{
      const g = byDay[d]||{주간:[],야간:[]}, key = d+'|'+name, planned = key in NHm, h = NHm[key];
      const showNight = planned || g.야간.length || open.has(key);
      const it = {ev, day:g.주간, night:g.야간};
      return '<div class="ad-day'+(d===todayKey?' today':'')+'" data-day="'+d+'"><div class="ad-head">'+md(d)+((DATA.closings||{})[d.slice(0,7)]?'<span class="lockb">마감</span>':'')+' '+needLine(d, it)+'</div>'+
        '<div class="ad-row"><span class="k">주간</span><span class="ad-names">'+g.주간.map(n=>chip(n,d,0)).join("")+adder(d,0)+'</span></div>'+
        (showNight
          ? '<div class="ad-row night"><span class="k">야간</span><span class="ad-names">'+g.야간.map(n=>chip(n,d,1)).join("")+adder(d,1)+
              (planned?'<span class="count tight">'+(h?h+'시간제':'일당')+'</span>':'')+'</span></div>'
          : '<div><button type="button" class="ad-more" data-anight="'+esc(key)+'">+ 야간</button></div>')+
      '</div>'; }).join("");
}
function assignOne(name, dates, person, shift, remove, overwrite){
  busy(true);
  api.adminSetAssign({dates, names:[person], shift, event: remove?"":name, onlyEvent: remove?name:"", overwrite:!!overwrite}).then(r=>{
    busy(false);
    if(!r.ok && r.conflicts){
      const list = r.conflicts.slice(0,8).map(c=>"· "+c.date.slice(5)+" → 이미 「"+c.current+"」").join("\n");
      if(confirm(person+" 님은 이미 다른 행사에 배정돼 있어요.\n"+list+"\n\n「"+name+"」(으)로 바꿀까요?")) assignOne(name, dates, person, shift, false, true);
      return;
    }
    admApply(r.data);
    toast(remove ? person+" 님을 뺐어요." : person+" 님을 넣었어요"+(dates.length>1?" ("+r.changed+"일)":"")+".");
  }, admFail);
}
function addFromInput(inp){
  const v = inp.value.trim(); if(!v) return;
  if(!DATA.members.some(m=>m.name===v)){ toast("팀원 명단에 없는 이름이에요: "+v, true); return; }
  const box = $("ed-body"), name = ADM.evOpen;
  if(inp.id==="ad-all-n"){
    const ev = DATA.events.find(x=>x.name===name);
    assignOne(name, datesBetween(ev.start, ev.end), v, Number(box.querySelector("#ad-all-s").value), false, false);
  } else {
    const [d, s] = JSON.parse(inp.dataset.aadd);
    assignOne(name, [d], v, s, false, false);
  }
  inp.value = "";
}
$("e-detail").addEventListener("change", e=>{ const inp = e.target.closest("[data-aadd],#ad-all-n"); if(inp && inp.id!=="ad-all-n") addFromInput(inp); });
// 목록에서 이름을 고르면 바로 추가 (휴대폰은 고를 때 change 대신 input이 먼저 와요)
$("e-detail").addEventListener("input", e=>{ const inp = e.target.closest("[data-aadd]"); if(inp && e.inputType==="insertReplacementText") addFromInput(inp); });
$("e-detail").addEventListener("keydown", e=>{ if(e.key!=="Enter" || e.isComposing) return; const inp = e.target.closest("[data-aadd],#ad-all-n"); if(inp){ e.preventDefault(); addFromInput(inp); } });

// 행사 관리: 월별 행사 목록
function renderEventList(){
  const y=view.getFullYear(), m=view.getMonth();
  // 행사 관리: 월별로 보기 (기본은 달력에서 보고 있는 달)
  if(!ADM.evM) ADM.evM = new Date(y, m, 1);
  const ey = ADM.evM.getFullYear(), em = ADM.evM.getMonth();
  const eStart = iso(new Date(ey,em,1)), eEnd = iso(new Date(ey,em+1,0));
  const cnt = {}; DATA.assign.forEach(a=>cnt[a.event]=(cnt[a.event]||0)+1);
  const q = $("e-q").value.trim();
  // 이름 검색이 있으면 모든 달에서 찾고, 없으면 고른 달의 행사만
  const evs = q ? eventsSorted().filter(e=>matchName(e.name, q))
                : eventsSorted().filter(e=>e.start<=eEnd && e.end>=eStart);
  $("e-month").value = ey+"-"+pad(em+1);
  document.querySelector(".mnav").classList.toggle("dim", !!q);
  $("e-title").textContent = q ? "검색 결과 "+evs.length+"개" : (em+1)+"월 행사 "+evs.length+"개";
  ADM.evOrder = evs.map(e=>e.name);
  let lastMon = "";
  $("e-list").innerHTML = evs.map(e=>{ const c = clsFor(e.type);
    const monHead = (q && e.start.slice(0,7)!==lastMon) ? '<div class="emon">'+Number(e.start.slice(0,4))+"년 "+Number(e.start.slice(5,7))+'월</div>' : '';
    lastMon = e.start.slice(0,7);
    const sh = shortDays(e.name), nn = Object.keys(nightsOf(e.name)).length;
    const noNeed = e.needDay==null && e.needNight==null;
    return monHead+'<div class="erow eopen" data-open="'+esc(e.name)+'" role="button" tabindex="0"><i class="sw '+c+'"></i><div class="emain"><b>'+(q?hl(e.name,q):esc(e.name))+'</b>'+
      '<span>'+esc(e.type||"종류 없음")+' · '+mdShort(e.start)+(e.end!==e.start?"–"+mdShort(e.end):"")+(e.place?' · '+esc(e.place):'')+'</span>'+
      '<div class="ebadges"><span class="ebadge">배정 '+(cnt[e.name]||0)+'칸</span>'+
        (sh ? '<span class="ebadge bad">부족 '+sh+'일</span>' : noNeed ? '' : '<span class="ebadge ok">인원 OK</span>')+
        (nn ? '<span class="ebadge">야간 '+nn+'일</span>' : '')+'</div>'+
      '</div><span class="chev" aria-hidden="true">›</span></div>'; }).join("")
    || '<p class="empty">'+(q?'"'+esc(q)+'"(이)가 들어간 행사가 없어요.':(em+1)+'월에는 행사가 없어요.')+'</p>';
  $("memlist").innerHTML = DATA.members.map(mb=>'<option value="'+esc(mb.name)+'">').join("");
  // 행사 화면이 열려 있으면 그 화면을 새 데이터로 다시 그림 (스크롤 위치 유지)
  if(ADM.evOpen){ const y0 = window.scrollY; renderEventDetail(); window.scrollTo(0, y0); }
}
