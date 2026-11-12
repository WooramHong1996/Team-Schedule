/* 팀원 관리: 추가 · 이수증 · 이름 · 카카오 연결 · 간부 · 퇴사 */
// ---------- 팀원 관리 ----------
// 금액 칸: 숫자만 남기고 천 단위 쉼표
document.querySelectorAll("input.won").forEach(inp=>inp.addEventListener("input", ()=>{
  const d = inp.value.replace(/[^0-9]/g,""); inp.value = d ? Number(d).toLocaleString("ko-KR") : ""; }));
function admRenderMembers(){
  const q = $("m-q").value.trim();
  const cnt = {}; DATA.assign.forEach(a=>cnt[a.name]=(cnt[a.name]||0)+1);
  $("m-cnt").textContent = DATA.members.length+"명";
  const reqs = DATA.linkRequests||[];
  const free = DATA.members.filter(m=>!m.linked);
  $("m-reqs").innerHTML = reqs.length ? '<h2>로그인 연결 요청 <small>'+reqs.length+'건</small></h2>'+reqs.map(r=>
    '<div class="mrow" data-uid="'+esc(r.userId)+'">'+(r.avatar?'<img class="kav" src="'+esc(r.avatar)+'" alt="" referrerpolicy="no-referrer">':'<span class="kav">'+esc((r.nickname||"?").slice(0,1))+'</span>')+
    '<span class="mn">'+esc(r.claimed||"(이름 안 적음)")+'</span>'+
    '<span class="ma">카카오 닉네임 <b>'+esc(r.nickname||"-")+'</b> · 요청 '+(r.at?mdhm(r.at):"")+'</span>'+
    '<select data-lsel aria-label="연결할 팀원"><option value="">팀원 고르기</option>'+free.map(m=>'<option'+(m.name===r.claimed?' selected':'')+'>'+esc(m.name)+'</option>').join("")+'</select>'+
    '<button type="button" class="lnk" data-link><b>연결</b></button><button type="button" class="danger" data-ldis>거절</button></div>').join("")+'<hr class="sep">' : '';
  const list = DATA.members.filter(m=>matchName(m.name,q));
  $("m-list").innerHTML = list.map(m=>{ const c = m.certRaw||"";
    return '<div class="mrow" data-n="'+esc(m.name)+'"><span class="mn">'+hl(m.name,q)+'</span>'+
      '<span class="ma">배정 '+(cnt[m.name]||0)+'칸</span>'+
      (m.linked ? '<button type="button" class="lnk klink on" data-unlink title="카카오 연결 해제">카카오 연결됨 ×</button>'+
        '<button type="button" class="lnk klink'+(m.isAdmin?' adm':'')+'" data-admin="'+(m.isAdmin?0:1)+'">'+(m.isAdmin?'간부(관리자) '+icon('check',13):'간부 지정')+'</button>' : '<span class="klink">카카오 미연결</span>')+
      '<label><span class="sr">이수증 </span><select data-cert aria-label="'+esc(m.name)+' 이수증">'+
        [["","이수증 모름"],["있음","이수증 있음"],["없음","이수증 없음"]].map(([v,t])=>'<option value="'+v+'"'+(v===c?' selected':'')+'>'+t+'</option>').join("")+'</select></label>'+
      '<button type="button" class="lnk" data-rename>이름 고치기</button>'+
      '<button type="button" class="danger" data-retire>퇴사 처리</button></div>'; }).join("")
    || '<p class="empty">'+(q?'맞는 이름이 없어요.':'팀원이 없어요.')+'</p>';
  const former = (DATA.formerMembers||[]).filter(m=>matchName(m.name,q));
  $("m-former").hidden = !(DATA.formerMembers||[]).length;
  $("m-fcnt").textContent = (DATA.formerMembers||[]).length+"명";
  $("m-flist").innerHTML = former.map(m=>'<div class="mrow" data-n="'+esc(m.name)+'"><span class="mn">'+hl(m.name,q)+'</span>'+
      '<span class="ma">근무 기록 '+(cnt[m.name]||0)+'칸'+(m.retiredAt?' · 퇴사 '+esc(m.retiredAt):'')+'</span>'+
      '<button type="button" class="lnk" data-restore>복귀</button>'+
      (cnt[m.name] ? '' : '<button type="button" class="danger" data-hdel>완전 삭제</button>')+'</div>').join("")
    || '<p class="empty">맞는 이름이 없어요.</p>';
}
$("m-q").addEventListener("input", admRenderMembers);
$("m-form").addEventListener("submit", ev=>{
  ev.preventDefault();
  const f = Object.fromEntries(new FormData($("m-form")).entries());
  busy(true);
  api.adminAddMember(f).then(r=>{ busy(false); $("m-form").reset(); admApply(r.data);
      toast(f.name.trim()+" 님을 추가했어요."); $("m-form").elements.name.focus(); }, admFail);
});
$("m-list").addEventListener("change", e=>{
  const sel = e.target.closest("[data-cert]"); if(!sel) return;
  const n = sel.closest(".mrow").dataset.n;
  busy(true);
  api.adminSetCert(n, sel.value).then(r=>{ busy(false); admApply(r.data); toast(n+" 이수증: "+(sel.value||"모름")); }, admFail);
});
$("m-list").addEventListener("click", e=>{
  const row = e.target.closest(".mrow"); if(!row) return;
  const n = row.dataset.n;
  const ad = e.target.closest("[data-admin]");
  if(ad){
    const on = ad.dataset.admin==="1", mb = DATA.members.find(x=>x.name===n)||{};
    if(on && !confirm(n+" 님을 간부(관리자)로 지정할까요?\n모든 일정·팀원 정보를 보고 고칠 수 있게 돼요.")) return;
    if(!on && !confirm(n+" 님의 간부(관리자) 권한을 해제할까요?"+(mb.isMe?"\n본인 권한이라 해제하면 바로 관리자 화면이 닫혀요.":""))) return;
    busy(true);
    api.adminSetAdmin(n, on).then(r=>{ busy(false); if(!on && mb.isMe) return location.reload(); admApply(r.data); toast(n+(on?" 님을 간부로 지정했어요.":" 님 간부 권한을 해제했어요.")); }, admFail);
    return;
  }
  if(e.target.closest("[data-unlink]")){
    if(!confirm(n+" 님의 카카오 연결을 해제할까요?\n해제한 카카오 계정은 위 '연결 요청'으로 돌아가서, 맞는 사람으로 다시 연결할 수 있어요.")) return;
    busy(true);
    api.adminUnlinkMember(n).then(r=>{ busy(false); admApply(r.data); toast(n+" 님 연결을 해제했어요. 위 연결 요청에서 맞는 사람으로 다시 연결하세요."); }, admFail);
    return;
  }
  if(e.target.closest("[data-rename]")){
    const nn = prompt("새 이름", n); if(!nn || nn.trim()===n) return;
    busy(true);
    api.adminRenameMember(n, nn.trim()).then(r=>{ busy(false); if(person===n) person=nn.trim(); admApply(r.data); toast(n+" → "+nn.trim()); }, admFail);
    return;
  }
  if(e.target.closest("[data-retire]")){
    if(!confirm(n+" 님을 퇴사 처리할까요?\n지난 근무 기록은 그대로 남고, 명단·배정 목록·로그인에서만 빠져요. 나중에 복귀시킬 수 있어요.")) return;
    const go = ok => api.adminRetireMember(n, ok).then(r=>{
        if(!r.ok && r.future){ busy(false);
          if(confirm(n+" 님은 오늘 이후 배정이 "+r.future+"칸 남아 있어요.\n그 배정은 빼고 퇴사 처리할까요?")){ busy(true); go(true); }
          return; }
        busy(false); admApply(r.data); toast(n+" 님을 퇴사 처리했어요."+(r.cleared?" (앞으로의 배정 "+r.cleared+"칸 뺌)":""));
      }, admFail);
    busy(true); go(false);
  }
});
$("m-flist").addEventListener("click", e=>{
  const row = e.target.closest(".mrow"); if(!row) return;
  const n = row.dataset.n;
  if(e.target.closest("[data-restore]")){
    busy(true);
    api.adminRestoreMember(n).then(r=>{ busy(false); admApply(r.data); toast(n+" 님을 복귀시켰어요. 카카오 연결은 다시 해 주세요."); }, admFail);
  }
  if(e.target.closest("[data-hdel]")){
    if(!confirm(n+" 님을 완전히 삭제할까요? (근무 기록이 없어서 지울 수 있어요)")) return;
    busy(true);
    api.adminDeleteMember(n).then(r=>{ busy(false); admApply(r.data); toast(n+" 님을 삭제했어요."); }, admFail);
  }
});

// 로그인 연결 요청: 연결 · 거절
$("m-reqs").addEventListener("click", e=>{
  const row = e.target.closest("[data-uid]"); if(!row) return;
  const uid = row.dataset.uid;
  if(e.target.closest("[data-link]")){
    const name = row.querySelector("[data-lsel]").value;
    if(!name) return toast("연결할 팀원을 골라 주세요.", true);
    busy(true);
    api.adminLinkMember(uid, name).then(r=>{ busy(false); admApply(r.data); toast(name+" 님과 연결했어요."); }, admFail);
  }
  if(e.target.closest("[data-ldis]")){
    if(!confirm("이 연결 요청을 거절(삭제)할까요?")) return;
    busy(true);
    api.adminDismissRequest(uid).then(r=>{ busy(false); admApply(r.data); toast("요청을 지웠어요."); }, admFail);
  }
});
