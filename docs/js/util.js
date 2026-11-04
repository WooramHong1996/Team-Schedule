/* 공용 도구: 날짜·글자·화면 알림 */
const pad = n => String(n).padStart(2,"0");
const iso = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const DOW = ["일","월","화","수","목","금","토"];
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $ = id => document.getElementById(id);
function toast(msg, bad){
  const t = $("toast"); t.textContent = msg; t.className = "toast show"+(bad?" bad":"");
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.className="toast", 3500);
}
function busy(on){ document.body.classList.toggle("busy", !!on); }
// 초성 검색: "ㅎㅇㄹ" 로도 "홍우람"을 찾을 수 있어요
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const cho = s => [...s].map(c=>{ const k=c.charCodeAt(0)-0xAC00; return (k>=0&&k<11172) ? CHO[Math.floor(k/588)] : c; }).join("");
const isCho = q => [...q].every(c=>CHO.includes(c));
function matchName(n, q){
  if(!q) return true;
  return n.toLowerCase().includes(q.toLowerCase()) || (isCho(q) && cho(n).includes(q));
}
function hl(n, q){
  if(!q) return esc(n);
  let i = n.toLowerCase().indexOf(q.toLowerCase());
  if(i<0 && isCho(q)) i = cho(n).indexOf(q);
  if(i<0) return esc(n);
  return esc(n.slice(0,i))+'<mark>'+esc(n.slice(i,i+q.length))+'</mark>'+esc(n.slice(i+q.length));
}
function datesBetween(a,b){
  const out=[]; if(!a||!b||b<a) return out;
  const [y,m,d]=a.split("-").map(Number); let t=new Date(y,m-1,d);
  for(let k=iso(t); k<=b && out.length<62; t=new Date(t.getFullYear(),t.getMonth(),t.getDate()+1), k=iso(t)) out.push(k);
  return out;
}
const md = k => { const [yy,mo,dd]=k.split("-").map(Number); return mo+"/"+dd+" ("+DOW[new Date(yy,mo-1,dd).getDay()]+")"; };
