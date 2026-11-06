/* 달력 · 날짜 패널 · 이번 달 행사 목록 */
function render(){
  const y=view.getFullYear(), m=view.getMonth();
  document.getElementById("month").textContent = y+"년 "+(m+1)+"월";
  const first = new Date(y,m,1);
  const start = new Date(y,m,1-first.getDay());
  const lastDay = new Date(y,m+1,0);
  const weeks = Math.ceil((first.getDay()+lastDay.getDate())/7);
  const grid = document.getElementById("grid");
  let html = "";
  const monthEvents = new Map();
  // 휴대폰 막대: 같은 행사는 한 주 안에서 같은 줄(lane)에 놓아 이어져 보이게 합니다
  const cellItems = [];
  for(let i=0;i<weeks*7;i++) cellItems.push(itemsFor(iso(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i))));
  const MAXL = 4, MAXD = 6;   // 한 칸에 보이는 줄 수 (휴대폰 / 컴퓨터)
  const laneOf = [];   // 주마다 {행사명: 줄번호}
  for(let w=0; w<weeks; w++){
    const days = {};   // 행사명 -> 그 주에 들어간 요일들
    for(let k=0;k<7;k++) cellItems[w*7+k].forEach(it=>{ (days[kOf(it)] = days[kOf(it)]||[]).push(k); });
    const names = Object.keys(days).sort((a,b)=> days[a][0]-days[b][0] || days[b].length-days[a].length || (evMap.get(a.replace("#야간",""))?.idx??999)-(evMap.get(b.replace("#야간",""))?.idx??999) || (a<b?-1:1));
    const used = [], lanes = {};
    names.forEach(n=>{ let l=0; while(days[n].some(k=>used[l]&&used[l].has(k))) l++;
      (used[l]=used[l]||new Set()); days[n].forEach(k=>used[l].add(k)); lanes[n]=l; });
    laneOf.push(lanes);
  }
  const has = (i, key) => i>=0 && i<cellItems.length && cellItems[i].some(it=>kOf(it)===key);
  for(let i=0;i<weeks*7;i++){
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
    const key = iso(d), inMonth = d.getMonth()===m;
    const items = cellItems[i];
    if(inMonth) items.forEach(it=>monthEvents.set(it.ev.name, evMap.get(it.ev.name) || it.ev));
    const cls = ["day", inMonth?"":"out", d.getDay()===0?"sun":"", d.getDay()===6?"sat":"",
      key===todayKey?"today":"", key===selected?"sel":"", (!person&&hasMiss(items))?"warn":""].join(" ");
    const lanes = laneOf[Math.floor(i/7)], dow = i%7;
    // 컴퓨터 화면: 같은 행사는 같은 줄에 놓고, 이어지는 날은 칸 경계를 덮는 막대로 한 줄처럼 (이름은 첫 칸에만)
    // 막대 아래에는 그날 들어가는 사람(한 사람 보기면 주간/야간)
    const dslot = new Array(MAXD).fill('<div class="lslot"></div>');
    let dHidden = 0, dTop = -1;
    items.forEach(it=>{
      const kk = kOf(it), l = lanes[kk];
      if(l>=MAXD){ dHidden++; return; }
      const fromL = dow>0 && has(i-1, kk), toR = dow<6 && has(i+1, kk);
      let run = 1; if(!fromL) while(dow+run<7 && has(i+run, kk)) run++;
      const sub = person ? myShift(it)
        : (it.day.length ? who(it.day) : (it.night.length ? '' : '<span class="none">미배정</span>')) + (it.night.length ? ' <span class="night">야간 '+who(it.night)+'</span>' : '');
      dslot[l] = '<div class="lslot"><span class="dbar '+it.ev.cls+(fromL?' cl':'')+(toR?' cr':'')+'" style="--run:'+run+'">'+
        (fromL ? '' : '<em>'+(it.mine==="야간"?"야간 ":"")+esc(it.ev.name)+'</em>')+'</span><span class="lsub">'+sub+'</span></div>';
      dTop = Math.max(dTop, l);
    });
    const chips = dslot.slice(0, dTop+1).join("") + (dHidden ? '<span class="dmore">+'+dHidden+'개 더</span>' : '');
    const slot = new Array(MAXL).fill('<span class="bar empty"></span>');
    let hidden = 0, top = -1;
    items.forEach(it=>{
      const kk = kOf(it), l = lanes[kk];
      if(l>=MAXL){ hidden++; return; }
      const fromL = dow>0 && has(i-1, kk), toR = dow<6 && has(i+1, kk);
      let run = 1; if(!fromL) while(dow+run<7 && has(i+run, kk)) run++;
      // 이어지는 첫 칸에만 행사 이름을 짧게 적어요
      slot[l] = '<span class="bar '+it.ev.cls+(fromL?' cl':'')+(toR?' cr':'')+'" style="--run:'+run+'">'+(fromL?'':'<em>'+(it.mine==="야간"?"야간 ":"")+esc(it.ev.name)+'</em>')+'</span>';
      top = Math.max(top, l);
    });
    const bars = slot.slice(0, top+1).join("") + (hidden ? '<span class="more">+'+hidden+'</span>' : '');
    const label = (d.getMonth()+1)+"월 "+d.getDate()+"일 "+DOW[d.getDay()]+"요일, 행사 "+items.length+"건";
    html += '<button type="button" class="'+cls+'" data-key="'+key+'" aria-label="'+label+'">'+
      '<span class="num">'+d.getDate()+'</span>'+(inMonth && typeof ADM!=="undefined" && dayShort(key, cellItems[i])?'<span class="short-dot" title="인원 부족"></span>':'')+'<div class="chips">'+chips+'</div><div class="bars">'+bars+'</div></button>';
  }
  grid.innerHTML = html;

  const legend = document.getElementById("legend");
  const hasNightThisMonth = person && cellItems.some((its,i)=>{ const dd=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i); return dd.getMonth()===m && its.some(it=>it.mine==="야간"); });
  const typeCount = {};
  monthEvents.forEach(e=>{ const t = TYPE_CLS[String(e.type||"").trim()] ? String(e.type).trim() : "기타"; typeCount[t]=(typeCount[t]||0)+1; });
  legend.innerHTML = [...TYPE_ORDER, "기타"].filter(t=>t!=="기타" || typeCount[t])
    .map(t=>'<span><i class="sw '+clsFor(t==="기타"?"":t)+'"></i>'+t+' <em class="lgn">'+(typeCount[t]||0)+'건</em></span>').join("")
    + (person && hasNightThisMonth ? '<span><i class="sw c-night"></i>야간 근무</span>' : '');

  // 한 사람 보기일 때: 이번 달 근무 요약과 행사별 근무일 수
  const myDays = new Map(); let nDay=0, nNight=0; const workDates = new Set();
  if(person){
    for(let dd=1; dd<=lastDay.getDate(); dd++){
      const k = iso(new Date(y,m,dd));
      itemsFor(k).forEach(it=>{
        workDates.add(k);
        it.mine==="야간" ? nNight++ : nDay++;
        if(!myDays.has(it.ev.name)) myDays.set(it.ev.name, new Set());
        myDays.get(it.ev.name).add(k);
      });
    }
  }
  document.getElementById("mysum").innerHTML = person
    ? (m+1)+'월 근무 <b>'+workDates.size+'</b>일 · 주간 <b>'+nDay+'</b> · 야간 <b>'+nNight+'</b>'
    : '';
  document.getElementById("evtitle").textContent = person ? person+"님의 이번 달 행사" : "이번 달 행사";

  const evlist = document.getElementById("evlist");
  const mm = d => { const [yy,mo,dd]=d.split("-"); return Number(mo)+"/"+Number(dd)+" ("+DOW[new Date(yy,mo-1,dd).getDay()]+")"; };
  evlist.innerHTML = [...monthEvents.values()].sort((a,b)=>(a.start||"").localeCompare(b.start||""))
    .map(e=>'<div class="ev'+(ADM.admin?' jump':' jump')+'" data-jump="'+esc(e.name)+'"'+(ADM.admin?'':' data-evinfo="'+esc(e.name)+'"')+' role="button" tabindex="0"><i class="sw '+e.cls+'"></i><span class="when">'+(e.start?mm(e.start)+(e.end&&e.end!==e.start?" – "+mm(e.end):""):"")+'</span><span>'+esc(e.name)+'</span>'+(person?'<span class="cnt">'+(myDays.has(e.name)?myDays.get(e.name).size:0)+'일</span>':'')+'</div>').join("")
    || '<p class="empty">'+(person?esc(person)+'님은 이번 달 배정된 일정이 없어요.':'이번 달에는 등록된 행사가 없어요.')+'</p>';

  renderDay();
  if(typeof ADM!=='undefined' && ADM.admin && ADM.tab!=='cal') admRenderPanels();
}

function renderDay(){
  const p = document.getElementById("daypanel");
  const [yy,mo,dd] = selected.split("-").map(Number);
  const d = new Date(yy,mo-1,dd);
  const items = itemsFor(selected);
  // 한 사람 보기: 같은 행사의 주간·야간은 카드 하나로 합쳐서 보여 줌
  let pItems = items;
  if(person){
    const byName = new Map();
    items.forEach(it=>{
      const n = it.ev.name;
      if(!byName.has(n)) byName.set(n, {...it, ev: evMap.get(n) || {...it.ev, cls: clsFor(it.ev.type)}, mines: []});
      byName.get(n).mines.push(it.mine);
    });
    pItems = [...byName.values()];
  }
  const nEv = person ? pItems.length : items.length;
  let html = '<h2>'+mo+'월 '+dd+'일 '+DOW[d.getDay()]+'요일<small>'+(nEv?"행사 "+nEv+"건":"")+'</small></h2>';
  if(!items.length){ html += '<p class="empty">'+(person?esc(person)+'님은 이날 일정이 없어요.':'이날은 일정이 없어요.')+'</p>'; }
  else if(ADM.admin && !person) html += items.map(admDayExtra).join("");
  else if(person) html += pItems.map(it=>{ const o = others(it);
    const onlyNight = it.mines.length===1 && it.mines[0]==="야간";
    const jump = (typeof ADM!=="undefined" && ADM.admin) ? ' jumpcard" data-jump="'+esc(it.ev.name)+'" role="button" tabindex="0" title="행사 관리로 이동'
               : ' infocard" data-evinfo="'+esc(it.ev.name)+'" role="button" tabindex="0" title="행사 자세히 보기';
    const shiftTxt = it.mines.map(m=> m==="야간" ? '<span class="nbadge">야간</span>' : '주간').join(" · ");
    return '<div class="item '+(onlyNight?'c-night':it.ev.cls)+jump+'"><span class="t" style="grid-column:1/-1">'+esc(it.ev.name)+'</span>'+
    '<span class="k">근무</span><span class="v"><b>'+shiftTxt+'</b></span>'+
    '<span class="k">함께 주간</span><span class="v">'+(o.day.length?who(o.day):"-")+'</span>'+
    '<span class="k">함께 야간</span><span class="v">'+(o.night.length?who(o.night):"-")+'</span>'+
    (it.ev.place?'<span class="meta">장소: '+esc(it.ev.place)+'</span>':'')+
    (!ADM.admin ? '<span class="meta more">'+(it.ev.notice?'📌 공지 있음 · ':'')+'자세히 보기 ›</span>' : '')+'</div>'; }).join("");
  else html += items.map(it=>
    '<div class="item '+it.ev.cls+'"><span class="t" style="grid-column:1/-1">'+esc(it.ev.name)+'</span>'+
    '<span class="k">주간</span><span class="v">'+(it.day.length?who(it.day):"-")+'</span>'+
    '<span class="k">야간</span><span class="v">'+(it.night.length?who(it.night):"-")+'</span>'+
    (it.ev.place?'<span class="meta">장소: '+esc(it.ev.place)+'</span>':'')+
    (!it.day.length&&!it.night.length?'<span class="meta">아직 배정된 인원이 없어요.</span>':'')+'</div>').join("");
  p.innerHTML = html;
}

document.getElementById("evlist").addEventListener("click", e=>{
  const j = e.target.closest("[data-jump]"); if(!j || !ADM.admin) return; jumpToEvent(j.dataset.jump); });
document.getElementById("daypanel").addEventListener("keydown", e=>{
  if(e.key!=="Enter") return; const j = e.target.closest(".jumpcard[data-jump]"); if(!j || !ADM.admin) return; jumpToEvent(j.dataset.jump); });
document.getElementById("evlist").addEventListener("keydown", e=>{
  if(e.key!=="Enter") return; const j = e.target.closest("[data-jump]"); if(!j || !ADM.admin) return; jumpToEvent(j.dataset.jump); });
document.getElementById("grid").addEventListener("click", e=>{
  const b = e.target.closest(".day"); if(!b) return;
  selected = b.dataset.key;
  const [yy,mo] = selected.split("-").map(Number);
  if(mo-1!==view.getMonth()){ view = new Date(yy,mo-1,1); }
  render();
  if(window.matchMedia("(max-width:720px)").matches){
    document.getElementById("daypanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
});
document.getElementById("prev").onclick = ()=>{ view=new Date(view.getFullYear(),view.getMonth()-1,1); selected=firstEventDay(view.getFullYear(),view.getMonth()); render(); };
document.getElementById("next").onclick = ()=>{ view=new Date(view.getFullYear(),view.getMonth()+1,1); selected=firstEventDay(view.getFullYear(),view.getMonth()); render(); };
document.getElementById("today").onclick = ()=>{ view=new Date(now.getFullYear(),now.getMonth(),1); selected=todayKey; render(); };
