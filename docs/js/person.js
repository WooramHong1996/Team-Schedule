/* 이름 검색 · 한 사람 보기 */
// ---- 한 사람 보기 ----
const pin = document.getElementById("person"), plist = document.getElementById("plist");
let NAMES = [], matches = [];
function fillPeople(){
  NAMES = DATA.members.map(m=>m.name);
  if(person && !NAMES.includes(person)) NAMES.push(person);
}
function openList(){
  const q = pin.value.trim();
  const pos = n => { let i=n.toLowerCase().indexOf(q.toLowerCase()); if(i<0&&isCho(q)) i=cho(n).indexOf(q); return i; };
  matches = NAMES.filter(n=>matchName(n,q)).sort((a,b)=>pos(a)-pos(b));   // 앞글자부터 맞는 이름을 위로
  plist.innerHTML = (q ? '' : '<li data-n="" role="option">전체 보기</li>') +
    (matches.map((n,i)=>'<li data-n="'+esc(n)+'" role="option"'+(q&&i===0?' class="act"':'')+'>'+hl(n,q)+'</li>').join("")
     || '<li class="none">"'+esc(q)+'" 이름이 없어요</li>');
  plist.hidden = false; pin.setAttribute("aria-expanded","true");
}
function closeList(){ plist.hidden = true; pin.setAttribute("aria-expanded","false"); }
function moveAct(d){
  const items=[...plist.querySelectorAll("li[data-n]")]; if(!items.length) return;
  const cur = items.findIndex(li=>li.classList.contains("act"));
  const next = cur<0 ? (d>0?0:items.length-1) : (cur+d+items.length)%items.length;
  items.forEach((li,i)=>li.classList.toggle("act", i===next));
  items[next].scrollIntoView({block:"nearest"});
}
function choose(n){ closeList(); pin.blur(); setPerson(n); }
pin.addEventListener("focus", ()=>{ pin.value = ""; openList(); });
pin.addEventListener("input", openList);
pin.addEventListener("keydown", e=>{
  if(e.isComposing) return;   // 한글 조합 중에는 Enter를 무시
  if(e.key==="ArrowDown"){ e.preventDefault(); if(plist.hidden) openList(); else moveAct(1); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); moveAct(-1); }
  else if(e.key==="Enter"){ e.preventDefault();
    const a = plist.querySelector("li.act[data-n]");
    if(a) choose(a.dataset.n);
    else if(!pin.value.trim()) choose("");
    else if(matches.length===1) choose(matches[0]);
  }
  else if(e.key==="Escape"){ closeList(); pin.blur(); }
});
// 목록 누르기 (mousedown이라 입력칸에서 포커스가 빠지기 전에 선택돼요)
plist.addEventListener("mousedown", e=>{ const li=e.target.closest("li[data-n]"); if(!li) return; e.preventDefault(); choose(li.dataset.n); });
pin.addEventListener("blur", ()=>setTimeout(()=>{ if(document.activeElement!==pin){ closeList(); pin.value = person; } },150));
document.getElementById("pclear").addEventListener("mousedown", e=>{ e.preventDefault(); closeList(); pin.blur(); setPerson(""); });

function setPerson(n, keepSelected){
  person = n || "";
  pin.value = person;
  document.querySelector(".who").classList.toggle("on", !!person);
  try { person ? localStorage.setItem("teamCalPerson", person) : localStorage.removeItem("teamCalPerson"); } catch(e){}
  if(!keepSelected) selected = (view.getMonth()===now.getMonth()&&view.getFullYear()===now.getFullYear()) ? todayKey : firstEventDay(view.getFullYear(),view.getMonth());
  render();
}
