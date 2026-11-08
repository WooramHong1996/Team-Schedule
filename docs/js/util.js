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
const md = k => { const [yy,mo,dd]=k.split("-").map(Number); return mo+"/"+dd+" ("+DOW[new Date(yy,mo-1,dd).getDay()]+")"; };   // "11/7 (토)"
const mdShort = k => Number(k.slice(5,7))+"/"+Number(k.slice(8,10));                                                                // "11/7"
const mdhm = t => { const d = new Date(t); return (d.getMonth()+1)+"/"+d.getDate()+" "+pad(d.getHours())+":"+pad(d.getMinutes()); }; // "11/7 09:05"
const telHref = s => "tel:"+String(s||"").replace(/[^0-9+]/g,"");

/* 아이콘: 이모지 대신 선 아이콘(SVG). 글자색을 따라가고, 화면 읽기에서는 숨김 */
const ICONS = {
  pin:   '<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l2.6 3.2H6.4z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  lock:  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chat:  '<path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.7L5.5 21l4.3-2.4c.7.1 1.4.2 2.2.2 5.5 0 10-3.6 10-8s-4.5-7.8-10-7.8z" fill="currentColor" stroke="none"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  map:   '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'
};
function icon(name, size){
  const s = size || 16;
  return '<svg class="ico" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+ICONS[name]+'</svg>';
}
