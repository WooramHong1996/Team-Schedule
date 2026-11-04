/* 데이터 · 날짜별 묶기 · 지금 보는 달 상태 */
let DATA = {updated:"", members:[], events:[], assign:[]};
// 색은 행사 종류로만 구분합니다: 전시 = 파랑, 외부 = 주황, 그 외 = 초록
const TYPE_CLS = {"전시":"c-blue","외부":"c-orange"};
const TYPE_ORDER = ["전시","외부"];
const clsFor = type => TYPE_CLS[String(type||"").trim()] || "c-green";
let evMap = new Map(), noCert = new Set(), byDate = new Map();
function setData(d){
  // 배정은 [날짜, 이름, 0=주간/1=야간, 행사] 배열로 옵니다
  d.assign = (d.assign||[]).map(a => Array.isArray(a) ? {date:a[0], name:a[1], shift:a[2]?"야간":"주간", event:a[3]} : a);
  DATA = d;
  evMap = new Map(DATA.events.map((e,i)=>[e.name,{...e,idx:i,cls:clsFor(e.type)}]));
  noCert = new Set([...DATA.members, ...(DATA.formerMembers||[])].filter(m=>!m.cert).map(m=>m.name));
  byDate = new Map();
  DATA.assign.forEach(a=>{ if(!byDate.has(a.date)) byDate.set(a.date,[]); byDate.get(a.date).push(a); });
}

function itemsFor(key){
  const names = new Set();
  DATA.events.forEach(e=>{ if(e.start<=key && key<=e.end) names.add(e.name); });
  (byDate.get(key)||[]).forEach(a=>names.add(a.event));
  const list = [...names].map(n=>{
    const ev = evMap.get(n) || {name:n,idx:999,cls:clsFor(""),type:""};
    const rows = (byDate.get(key)||[]).filter(a=>a.event===n);
    return {ev, day:rows.filter(a=>a.shift==="주간").map(a=>a.name), night:rows.filter(a=>a.shift==="야간").map(a=>a.name)};
  });
  // 한 사람 보기: 그 사람의 주간과 야간을 따로 한 줄씩 (야간은 남색으로 구분)
  const out = [];
  if(person) list.forEach(it=>{
    if(it.day.includes(person)) out.push({...it, mine:"주간"});
    if(it.night.includes(person)) out.push({...it, mine:"야간", ev:{...it.ev, key:it.ev.name+"#야간", cls:"c-night"}});
  });
  else out.push(...list);
  return out.sort((a,b)=>a.ev.idx-b.ev.idx);
}
// 한 사람 보기: 그 사람이 들어간 행사만 보여 줍니다 ("" = 전체)
let person = "";
const myShift = it => it.mine || [it.day.includes(person)?"주간":"", it.night.includes(person)?"야간":""].filter(Boolean).join("·");
const kOf = it => it.ev.key || it.ev.name;   // 막대 줄 맞춤용: 같은 행사라도 야간은 따로
const others = it => ({day:it.day.filter(n=>n!==person), night:it.night.filter(n=>n!==person)});
const who = arr => arr.map(n=> noCert.has(n) ? esc(n)+'<span class="miss">(미이수)</span>' : esc(n)).join(", ");
const hasMiss = items => items.some(it=>[...it.day,...it.night].some(n=>noCert.has(n)));

const now = new Date();
const todayKey = iso(now);
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let selected = todayKey;

function firstEventDay(y,m){
  const last = new Date(y,m+1,0).getDate();
  for(let d=1; d<=last; d++){ const k=iso(new Date(y,m,d)); if(itemsFor(k).length) return k; }
  return iso(new Date(y,m,1));
}
function showUpdated(){ document.getElementById("updated").textContent = DATA.updated+" 기준"; }
// 다시 불러오기 (↻ 버튼, 5분마다 자동)
function load(fresh){
  const up = document.getElementById("updated");
  if(fresh) up.textContent = "새로 불러오는 중…";
  api.getData().then(d=>{ if(ADM.admin) admApply(d); else { setData(d); fillPeople(); showUpdated(); render(); } },
    err=>{ up.textContent = "일정을 불러오지 못했어요. 새로고침해 주세요. ("+err.message+")"; });
}
document.getElementById("reload").onclick = ()=>load(true);
