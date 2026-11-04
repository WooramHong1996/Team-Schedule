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
    // 새 행사로 이동해서 인원 배정 창을 열어 둠 (날짜마다 다르면 여기서 바로 고치면 돼요)
    jumpToEvent(name); ADM.openBox = name; admRenderPanels();
    const row = [...document.querySelectorAll("[data-evrow]")].find(x=>x.dataset.evrow===name);
    if(row) row.scrollIntoView({block:"start"});
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
$("e-list").addEventListener("change", e=>{ const c=e.target.closest("input[data-d]"); if(!c) return;
  const box=c.closest(".nedit"), h=box.querySelector('[data-h="'+c.dataset.d+'"]'); h.disabled=!c.checked; if(c.checked) h.focus(); });
$("e-list").addEventListener("click", e=>{
  const boxOf = name => [...$("e-list").querySelectorAll("[data-nbox]")].find(x=>x.dataset.nbox===name);
  const ae = e.target.closest("[data-aedit]");
  if(ae){
    const name = ae.dataset.aedit, box = boxOf(name); if(!box) return;
    if(!box.hidden && box.dataset.mode==="assign"){ box.hidden = true; ADM.openBox = null; return; }
    ADM.openBox = name; renderAssignBox(box, name); return;
  }
  const arm = e.target.closest("[data-arm]");
  if(arm){
    const [d, n, s] = JSON.parse(arm.dataset.arm), name = arm.closest(".nedit").dataset.nbox;
    if(!confirm(md(d)+" "+(s?"야간":"주간")+" "+n+" 님을 「"+name+"」에서 뺄까요?")) return;
    assignOne(name, [d], n, s, true, false); return;
  }
  const an = e.target.closest("[data-anight]");
  if(an){ (ADM.nightOpen = ADM.nightOpen || new Set()).add(an.dataset.anight); renderAssignBox(an.closest(".nedit"), an.closest(".nedit").dataset.nbox); return; }
  if(e.target.closest("[data-aall]")){ addFromInput(e.target.closest(".nedit").querySelector("#ad-all-n")); return; }
  if(e.target.closest("[data-eedit],[data-needit],[data-nedit]")) ADM.openBox = null;
  const ee = e.target.closest("[data-eedit]");
  if(ee){
    const name = ee.dataset.eedit, box = boxOf(name), ev = DATA.events.find(x=>x.name===name); if(!box||!ev) return;
    if(!box.hidden && box.dataset.mode==="edit"){ box.hidden = true; return; }
    const v = k => esc(ev[k]==null?"":ev[k]);
    box.dataset.mode = "edit";
    box.innerHTML = '<div class="form">'+
      '<label class="frow"><span>행사명</span><input data-f="name" value="'+v("name")+'"></label>'+
      '<div class="fgrid"><label class="frow"><span>종류</span><select data-f="type">'+["전시","외부"].map(t=>'<option'+(ev.type===t?' selected':'')+'>'+t+'</option>').join("")+'</select></label>'+
      '<label class="frow"><span>시작일</span><input type="date" data-f="start" value="'+v("start")+'"></label>'+
      '<label class="frow"><span>종료일</span><input type="date" data-f="end" value="'+v("end")+'"></label></div>'+
      '<div class="fgrid"><label class="frow"><span>장소</span><input data-f="place" value="'+v("place")+'"></label>'+
      '<label class="frow"><span>담당자</span><input data-f="manager" value="'+v("manager")+'"></label>'+
      '<label class="frow"><span>연락처</span><input data-f="contact" inputmode="tel" value="'+v("contact")+'"></label></div>'+
      '<div class="fgrid"><label class="frow"><span>필요 인원 · 주간 (하루 기본)</span><input type="number" min="0" data-f="needDay" value="'+v("needDay")+'"></label>'+
      '<label class="frow"><span>필요 인원 · 야간 (하루 기본)</span><input type="number" min="0" data-f="needNight" value="'+v("needNight")+'"></label></div>'+
      '<label class="frow"><span>메모</span><textarea data-f="memo">'+v("memo")+'</textarea></label>'+
      '<div class="actions"><button type="button" class="btn" data-esave>저장</button><span class="count">이름을 바꾸면 배정·야간·필요 인원의 이름도 같이 바뀌어요</span></div></div>';
    box.hidden = false; return;
  }
  const es2 = e.target.closest("[data-esave]");
  if(es2){
    const box = es2.closest(".nedit"), old = box.dataset.nbox, f = {};
    box.querySelectorAll("[data-f]").forEach(x=>f[x.dataset.f]=x.value);
    if(f.end < f.start) return toast("종료일이 시작일보다 빨라요.", true);
    busy(true);
    api.adminUpdateEvent(old, f).then(r=>{ busy(false); admApply(r.data); toast("「"+f.name+"」 저장했어요."+(r.renamed?" (배정 "+r.renamed+"칸 이름도 바꿈)":"")); }, admFail);
    return;
  }
  const nd = e.target.closest("[data-needit]");
  if(nd){
    const name = nd.dataset.needit, box = boxOf(name), ev = DATA.events.find(x=>x.name===name); if(!box||!ev) return;
    if(!box.hidden && box.dataset.mode==="need"){ box.hidden = true; return; }
    box.dataset.mode = "need";
    const ov = DATA.needOv||{};
    box.innerHTML = '<p class="foot" style="margin:0">비워 두면 기본(주간 '+(ev.needDay??"-")+' · 야간 '+(ev.needNight??"-")+')을 써요. 그날만 다르면 숫자를 적으세요.</p>'+
      '<div class="nights">'+datesBetween(ev.start, ev.end).map(d=>{ const o = ov[d+"|"+name]||[null,null];
        return '<div class="nrow need"><span>'+md(d)+'</span>'+
          '<input type="number" min="0" data-nd="'+d+'" placeholder="주간 '+(ev.needDay??"-")+'" value="'+(o[0]??"")+'" aria-label="'+md(d)+' 주간 필요">'+
          '<input type="number" min="0" data-nn="'+d+'" placeholder="야간 '+(ev.needNight??"-")+'" value="'+(o[1]??"")+'" aria-label="'+md(d)+' 야간 필요"></div>'; }).join("")+'</div>'+
      '<div class="actions"><button type="button" class="btn" data-ndsave>날짜별 인원 저장</button></div>';
    box.hidden = false; return;
  }
  const nds = e.target.closest("[data-ndsave]");
  if(nds){
    const box = nds.closest(".nedit"), name = box.dataset.nbox;
    const rows = [...box.querySelectorAll("[data-nd]")].map(x=>({date:x.dataset.nd, day:x.value, night: box.querySelector('[data-nn="'+x.dataset.nd+'"]').value}));
    busy(true);
    api.adminSetEventNeeds(name, rows).then(r=>{ busy(false); admApply(r.data); toast("「"+name+"」 날짜별 인원을 저장했어요."); }, admFail);
    return;
  }
  const ne = e.target.closest("[data-nedit]");
  if(ne){
    const name = ne.dataset.nedit, box = boxOf(name);
    const ev = DATA.events.find(x=>x.name===name); if(!box||!ev) return;
    if(!box.hidden && box.dataset.mode==="night"){ box.hidden = true; return; }
    box.dataset.mode = "night";
    box.innerHTML = '<div class="nights">'+nightRowsHTML(ev.start, ev.end, nightsOf(name))+'</div>'+
      '<div class="actions"><button type="button" class="btn" data-nsave>야간 날짜 저장</button><span class="count">체크한 날만 야간 · 시간 비우면 일당</span></div>';
    box.hidden = false; return;
  }
  const sv = e.target.closest("[data-nsave]");
  if(sv){
    const box = sv.closest(".nedit"), name = box.dataset.nbox, nights = readNights(box);
    busy(true);
    api.adminSetEventNights(name, nights).then(r=>{ busy(false); admApply(r.data); toast("「"+name+"」 야간 "+nights.length+"일 저장했어요."); }, admFail);
    return;
  }
  const b = e.target.closest("[data-del]"); if(!b) return;
  const name = b.dataset.del;
  if(!confirm("「"+name+"」 행사를 지울까요?\n(이미 지난 근무 기록이 있는 행사는 급여 기록 보호를 위해 지울 수 없어요)")) return;
  const go = clear => api.adminDeleteEvent(name, clear).then(r=>{
      if(!r.ok && r.assigned){ busy(false);
        if(confirm("이 행사에 배정된 칸이 "+r.assigned+"개 있어요.\n배정까지 모두 지우고 행사를 삭제할까요?")) { busy(true); go(true); }
        return; }
      busy(false); admApply(r.data); toast("지웠어요."+(r.cleared?" (배정 "+r.cleared+"칸도 함께)":""));
    }, admFail);
  busy(true); go(false);
});
$("e-month").addEventListener("change", ()=>{ const v=$("e-month").value; if(!/^\d{4}-\d{2}$/.test(v)) return;
  ADM.evM = new Date(Number(v.slice(0,4)), Number(v.slice(5,7))-1, 1); $("e-q").value=""; ADM.openBox=null; admRenderPanels(); });
$("e-q").addEventListener("input", ()=>{ ADM.openBox=null; admRenderPanels(); });
$("e-prev").addEventListener("click", ()=>{ const b=ADM.evM||new Date(); ADM.evM=new Date(b.getFullYear(), b.getMonth()-1, 1); $("e-q").value=""; ADM.openBox=null; admRenderPanels(); });
$("e-next").addEventListener("click", ()=>{ const b=ADM.evM||new Date(); ADM.evM=new Date(b.getFullYear(), b.getMonth()+1, 1); $("e-q").value=""; ADM.openBox=null; admRenderPanels(); });


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
      return '<div class="ad-day'+(d===todayKey?' today':'')+'"><div class="ad-head">'+md(d)+((DATA.closings||{})[d.slice(0,7)]?'<span class="lockb">마감</span>':'')+' '+needLine(d, it)+'</div>'+
        '<div class="ad-row"><span class="k">주간</span><span class="ad-names">'+g.주간.map(n=>chip(n,d,0)).join("")+adder(d,0)+'</span></div>'+
        (showNight
          ? '<div class="ad-row night"><span class="k">야간</span><span class="ad-names">'+g.야간.map(n=>chip(n,d,1)).join("")+adder(d,1)+
              (planned?'<span class="count" style="margin:0">'+(h?h+'시간제':'일당')+'</span>':'')+'</span></div>'
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
  const box = inp.closest(".nedit"), name = box.dataset.nbox;
  if(inp.id==="ad-all-n"){
    const ev = DATA.events.find(x=>x.name===name);
    assignOne(name, datesBetween(ev.start, ev.end), v, Number(box.querySelector("#ad-all-s").value), false, false);
  } else {
    const [d, s] = JSON.parse(inp.dataset.aadd);
    assignOne(name, [d], v, s, false, false);
  }
  inp.value = "";
}
$("e-list").addEventListener("change", e=>{ const inp = e.target.closest("[data-aadd],#ad-all-n"); if(inp && inp.id!=="ad-all-n") addFromInput(inp); });
// 목록에서 이름을 고르면 바로 추가 (휴대폰은 고를 때 change 대신 input이 먼저 와요)
$("e-list").addEventListener("input", e=>{ const inp = e.target.closest("[data-aadd]"); if(inp && e.inputType==="insertReplacementText") addFromInput(inp); });
$("e-list").addEventListener("keydown", e=>{ if(e.key!=="Enter" || e.isComposing) return; const inp = e.target.closest("[data-aadd],#ad-all-n"); if(inp){ e.preventDefault(); addFromInput(inp); } });

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
  const mm = s => Number(s.slice(5,7))+"/"+Number(s.slice(8,10));
  $("e-month").value = ey+"-"+pad(em+1);
  document.querySelector(".mnav").classList.toggle("dim", !!q);
  $("e-title").textContent = q ? "검색 결과 "+evs.length+"개" : (em+1)+"월 행사 "+evs.length+"개";
  const keepY = window.scrollY;
  let lastMon = "";
  $("e-list").innerHTML = evs.map(e=>{ const c = clsFor(e.type);
    const monHead = (q && e.start.slice(0,7)!==lastMon) ? '<div class="emon">'+Number(e.start.slice(0,4))+"년 "+Number(e.start.slice(5,7))+'월</div>' : '';
    lastMon = e.start.slice(0,7);
    const ovN = Object.keys(DATA.needOv||{}).filter(k=>k.endsWith("|"+e.name)).length;
    return monHead+'<div class="erow" data-evrow="'+esc(e.name)+'"><i class="sw '+c+'"></i><div class="emain"><b>'+(q?hl(e.name,q):esc(e.name))+'</b>'+
      '<span>'+esc(e.type||"종류 없음")+' · '+mm(e.start)+(e.end!==e.start?"–"+mm(e.end):"")+' · 배정 '+(cnt[e.name]||0)+'칸'+(e.place?' · '+esc(e.place):'')+'</span>'+
      (e.manager||e.contact?'<span>담당 '+esc(e.manager||"")+(e.contact?' '+esc(e.contact):'')+'</span>':'')+
      (e.memo?'<span class="memo">'+esc(e.memo)+'</span>':'')+
      (()=>{ const nn = nightsOf(e.name), ks = Object.keys(nn).sort();
        return ks.length ? '<span class="nightinfo">야간 '+ks.map(k=>Number(k.slice(5,7))+"/"+Number(k.slice(8,10))+(nn[k]?" "+nn[k]+"h":"")).join(", ")+'</span>' : ''; })()+
      '<span>필요 인원: 주간 '+(e.needDay??"-")+' · 야간 '+(e.needNight??"-")+(ovN?' (날짜별 '+ovN+'일 따로)':'')+'</span>'+
      '<div class="actions" style="margin-top:4px">'+
        '<button type="button" class="lnk" data-aedit="'+esc(e.name)+'"><b>인원 배정</b></button>'+
        '<button type="button" class="lnk" data-eedit="'+esc(e.name)+'">정보 수정</button>'+
        '<button type="button" class="lnk" data-needit="'+esc(e.name)+'">날짜별 인원</button>'+
        '<button type="button" class="lnk" data-nedit="'+esc(e.name)+'">야간 날짜</button></div>'+
      '<div class="nedit" data-nbox="'+esc(e.name)+'" hidden></div></div>'+
      '<button type="button" class="danger" data-del="'+esc(e.name)+'">삭제</button></div>'; }).join("")
    || '<p class="empty">'+(q?'"'+esc(q)+'"(이)가 들어간 행사가 없어요.':(em+1)+'월에는 행사가 없어요.')+'</p>';
  $("memlist").innerHTML = DATA.members.map(mb=>'<option value="'+esc(mb.name)+'">').join("");
  // 인원 배정 창이 열려 있었다면 다시 열어 둠 (저장할 때마다 닫히지 않게)
  if(ADM.openBox){
    const box = [...$("e-list").querySelectorAll("[data-nbox]")].find(x=>x.dataset.nbox===ADM.openBox);
    if(box){ renderAssignBox(box, ADM.openBox); window.scrollTo(0, keepY); } else ADM.openBox = null;
  }
}
