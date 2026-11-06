/* 인원·급여: 월별 급여 표 · 월 마감 · 엑셀 */
// 인원·급여 표 (달력에서 보고 있는 달 기준)
function renderPay(){
  const y=view.getFullYear(), m=view.getMonth();
  const mStart = iso(new Date(y,m,1)), mEnd = iso(new Date(y,m+1,0));
  // 인원 현황 · 급여 (달력에서 보고 있는 달 기준)
  // 배정 1칸 = 1회 × 일당(전시/외부).  단, 야간시간 탭에 그 날짜·행사의 시간이 있으면 그 야간은 시간 × 각자 시급.
  $("p-title").textContent = y+"년 "+(m+1)+"월 인원 현황 · 급여";
  const won = v => v==null ? "-" : Math.round(v).toLocaleString("ko-KR")+"원";
  const hrs = v => (Math.round(v*10)/10)+"시간";
  const NH = DATA.nightHours || {};
  const mem = new Map([...(DATA.formerMembers||[]), ...DATA.members].map(mb=>[mb.name,mb]));
  const blank = () => ({exh:0,out:0,etc:0,hr:0,hours:0,night:0,days:new Set()});
  const st = new Map(DATA.members.map(mb=>[mb.name,blank()]));
  DATA.assign.forEach(a=>{ if(a.date<mStart||a.date>mEnd) return;
    if(!st.has(a.name)) st.set(a.name,blank());
    const s = st.get(a.name), t = String((evMap.get(a.event)||{}).type||"").trim();
    const h = a.shift==="야간" ? NH[a.date+"|"+a.event] : 0;
    if(h){ s.hr++; s.hours += h; }
    else t==="전시" ? s.exh++ : t==="외부" ? s.out++ : s.etc++;
    if(a.shift==="야간") s.night++;
    s.days.add(a.date); });
  const ym = mStart.slice(0,7), closed = (DATA.closings||{})[ym];
  const rows = closed ? closed.lines.map(l=>{
    const s = {exh:l.exh,out:l.out,etc:l.etc,hr:l.hr,hours:l.hours,night:l.night,days:{size:l.days}};
    const mb = {rateExh:l.rateExh,rateOut:l.rateOut,rateHour:l.rateHour}, miss = [];
    if((s.out && mb.rateOut==null) || (s.exh && mb.rateExh==null)) miss.push("일당");
    if(s.hr && mb.rateHour==null) miss.push("시급");
    return {n:l.name,s,mb,pay:l.pay,miss,total:s.exh+s.out+s.etc+s.hr};
  }).sort((a,b)=>b.pay-a.pay || b.total-a.total || a.n.localeCompare(b.n)) : [...st.entries()].map(([n,s])=>{
    const mb = mem.get(n)||{};
    const miss = [];
    if((s.out && mb.rateOut==null) || (s.exh && mb.rateExh==null)) miss.push("일당");
    if(s.hr && mb.rateHour==null) miss.push("시급");
    const pay = s.out*(mb.rateOut||0) + s.exh*(mb.rateExh||0) + s.hours*(mb.rateHour||0);
    return {n,s,mb,pay,miss,total:s.exh+s.out+s.etc+s.hr};
  }).sort((a,b)=>b.pay-a.pay || b.total-a.total || a.n.localeCompare(b.n));
  const sum = rows.reduce((t,r)=>({pay:t.pay+r.pay, exh:t.exh+r.s.exh, out:t.out+r.s.out, etc:t.etc+r.s.etc, hr:t.hr+r.s.hr, hours:t.hours+r.s.hours, ppl:t.ppl+(r.total?1:0)}), {pay:0,exh:0,out:0,etc:0,hr:0,hours:0,ppl:0});
  const noDay = rows.filter(r=>r.miss.includes("일당")).length, noHour = rows.filter(r=>r.miss.includes("시급")).length;
  $("p-sum").innerHTML =
    '<div class="kpi"><span>총 급여</span><b>'+won(sum.pay)+'</b></div>'+
    '<div class="kpi"><span>근무 인원</span><b>'+sum.ppl+'명</b></div>'+
    '<div class="kpi"><span>전시 / 외부</span><b>'+sum.exh+'회 / '+sum.out+'회</b></div>'+
    '<div class="kpi"><span>야간 시간제</span><b>'+sum.hr+'회 · '+hrs(sum.hours)+'</b></div>'+
    (noDay?'<p class="warnline">일당이 비어 있는 사람이 '+noDay+'명 있어요. 팀원 관리 → 일당 또는 팀원 탭 D·E열을 채워 주세요.</p>':'')+
    (noHour?'<p class="warnline">야간 시간제 근무가 있는데 시급이 비어 있는 사람이 '+noHour+'명 있어요. 팀원 탭 F열(시급)을 채워 주세요.</p>':'')+
    (sum.etc?'<p class="warnline">종류(전시/외부)가 없는 행사 배정 '+sum.etc+'회는 급여 계산에서 빠졌어요. 행사 탭 B열을 확인해 주세요.</p>':'');
  const when = closed ? new Date(closed.closedAt) : null;
  $("p-close").className = "pclose"+(closed?" closed":"");
  $("p-close").innerHTML = closed
    ? '<span class="st">'+icon('lock',15)+' <b>'+(m+1)+'월 마감됨</b> · '+(when.getMonth()+1)+'/'+when.getDate()+' '+String(when.getHours()).padStart(2,"0")+':'+String(when.getMinutes()).padStart(2,"0")+(closed.by?' '+esc(closed.by):'')+
      '<br><small>마감할 때의 금액이 그대로 보여요. 이 달 배정은 잠겨 있어요.</small></span>'+
      '<button type="button" class="btn" data-xlsx>엑셀 내려받기</button><button type="button" class="btn sub" data-reopen>마감 취소</button>'
    : '<span class="st"><b>'+(m+1)+'월 마감 전</b><br><small>배정·일당이 바뀌면 금액도 바뀌어요. 정산이 끝나면 마감해 주세요.</small></span>'+
      '<button type="button" class="btn sub" data-xlsx>엑셀 내려받기</button><button type="button" class="btn" data-close>이 달 마감하기</button>';
  PAY.rows = rows; PAY.ym = ym; PAY.closed = closed; PAY.mem = mem;
  $("p-table").innerHTML = '<thead><tr><th>이름</th><th class="r">근무일</th><th class="r">전시</th><th class="r">외부</th><th class="r">시간제</th><th class="r hide-m">일당 전시 / 외부 · 시급</th><th class="r">월급</th></tr></thead><tbody>'+
    rows.map(r=>'<tr class="'+(r.total?'':'idle')+'"><td>'+esc(r.n)+(noCert.has(r.n)?' <span class="miss">미이수</span>':'')+(r.s.night?'<small class="sub">야간 '+r.s.night+'회</small>':'')+'</td>'+
      '<td class="r">'+r.s.days.size+'일</td><td class="r">'+r.s.exh+'회</td><td class="r">'+r.s.out+'회'+(r.s.etc?'<small class="sub">기타 '+r.s.etc+'</small>':'')+'</td>'+
      '<td class="r">'+(r.s.hr?hrs(r.s.hours)+'<small class="sub">'+r.s.hr+'회</small>':'-')+'</td>'+
      '<td class="r hide-m">'+won(r.mb.rateExh)+' / '+won(r.mb.rateOut)+'<small class="sub">시급 '+won(r.mb.rateHour)+'</small></td>'+
      '<td class="r"><b>'+won(r.pay)+'</b>'+(r.miss.length?'<small class="sub warn">'+r.miss.join("·")+' 미입력</small>':'')+'</td></tr>').join("")+
    '</tbody><tfoot><tr><td>합계</td><td class="r"></td><td class="r">'+sum.exh+'회</td><td class="r">'+sum.out+'회</td><td class="r">'+(sum.hr?hrs(sum.hours):'-')+'</td><td class="r hide-m"></td><td class="r"><b>'+won(sum.pay)+'</b></td></tr></tfoot>';
}

// ---------- 급여 마감 · 엑셀 ----------
const PAY = {};
$("p-close").addEventListener("click", e=>{
  const ym = PAY.ym; if(!ym) return;
  const mo = Number(ym.slice(5,7));
  if(e.target.closest("[data-close]")){
    const t = (PAY.rows||[]).reduce((a,r)=>a+r.pay,0), miss = (PAY.rows||[]).filter(r=>r.miss.length).length;
    if(!confirm(mo+"월을 마감할까요?\n총 급여 "+Math.round(t).toLocaleString("ko-KR")+"원"+(miss?"\n(일당/시급이 비어 있는 사람 "+miss+"명은 0원으로 저장돼요)":"")+
      "\n\n마감하면 이 금액이 그대로 저장되고, "+mo+"월 배정은 바꿀 수 없게 잠겨요. (마감 취소로 풀 수 있어요)")) return;
    busy(true);
    api.closeMonth(ym).then(r=>{ busy(false); admApply(r.data); toast(mo+"월을 마감했어요. 총 "+r.total.toLocaleString("ko-KR")+"원"); }, admFail);
  }
  if(e.target.closest("[data-reopen]")){
    if(!confirm(mo+"월 마감을 취소할까요?\n저장된 금액이 지워지고, 지금 배정·일당 기준으로 다시 계산돼요. 배정 잠금도 풀려요.")) return;
    busy(true);
    api.reopenMonth(ym).then(r=>{ busy(false); admApply(r.data); toast(mo+"월 마감을 취소했어요."); }, admFail);
  }
  if(e.target.closest("[data-xlsx]")) downloadPayXlsx().catch(err=>{ busy(false); toast("엑셀을 만들지 못했어요: "+err.message, true); });
});
function loadXlsxLib(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((ok,bad)=>{ const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload=ok; s.onerror=()=>bad(new Error("엑셀 도구를 불러오지 못했어요")); document.head.appendChild(s); });
}
async function downloadPayXlsx(){
  busy(true);
  await loadXlsxLib();
  const {ym, rows, closed, mem} = PAY, mo = Number(ym.slice(5,7));
  const rate = n => { if(closed){ const l = closed.lines.find(x=>x.name===n); if(l) return l; } return mem.get(n)||{}; };
  const summary = [["이름","근무일","전시(회)","외부(회)","기타(회)","야간 시간제(회)","야간 시간","야간(회)","일당 전시","일당 외부","시급","월급","비고"]];
  rows.filter(r=>r.total).forEach(r=>summary.push([r.n, r.s.days.size, r.s.exh, r.s.out, r.s.etc, r.s.hr, r.s.hours, r.s.night,
    r.mb.rateExh??"", r.mb.rateOut??"", r.mb.rateHour??"", Math.round(r.pay), r.miss.length?r.miss.join("·")+" 미입력":""]));
  const tot = rows.reduce((a,r)=>a+r.pay,0);
  summary.push([]); summary.push(["합계","","","","","","","","","","",Math.round(tot), closed?"마감됨":"마감 전 (금액이 바뀔 수 있음)"]);
  const NH = DATA.nightHours||{};
  const detail = [["날짜","요일","이름","근무","행사","종류","야간 시간","단가","금액"]];
  DATA.assign.filter(a=>a.date.slice(0,7)===ym).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)).forEach(a=>{
    const ev = evMap.get(a.event)||{}, t = String(ev.type||"").trim(), rt = rate(a.name);
    const h = a.shift==="야간" ? NH[a.date+"|"+a.event] : 0;
    const unit = h ? (rt.rateHour??"") : t==="전시" ? (rt.rateExh??"") : t==="외부" ? (rt.rateOut??"") : "";
    const amt = unit==="" ? "" : Math.round(h ? h*unit : unit);
    const [yy,mm,dd] = a.date.split("-").map(Number);
    detail.push([a.date, DOW[new Date(yy,mm-1,dd).getDay()], a.name, a.shift, a.event, t||"-", h||"", unit, amt]);
  });
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary); ws1["!cols"] = [{wch:10},{wch:7},{wch:8},{wch:8},{wch:8},{wch:12},{wch:9},{wch:8},{wch:10},{wch:10},{wch:8},{wch:12},{wch:24}];
  const ws2 = XLSX.utils.aoa_to_sheet(detail); ws2["!cols"] = [{wch:11},{wch:5},{wch:10},{wch:6},{wch:34},{wch:6},{wch:9},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws1, mo+"월 급여");
  XLSX.utils.book_append_sheet(wb, ws2, "근무 내역");
  XLSX.writeFile(wb, "급여_"+ym+(closed?"_마감":"_마감전")+".xlsx");
  busy(false);
}
