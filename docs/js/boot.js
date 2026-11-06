/* 로그인 화면 · 시작 */
async function doLogout(){ try{ await Backend.logout(); }catch(e){} try{ localStorage.removeItem("teamCalPerson"); }catch(e){} location.reload(); }
$("logout").addEventListener("click", ()=>{ if(confirm("로그아웃할까요?")) doLogout(); });
function gate(html){ $("g-body").innerHTML = html; document.body.classList.remove("ready"); }
async function boot(){
  let st;
  try { st = await Backend.whoAmI(); }
  catch(e){ return gate('<p>연결하지 못했어요.<br>'+esc(e.message||e)+'</p><button class="btn" onclick="location.reload()">다시 시도</button>'); }
  if(st.state==="out"){
    gate('<p>카카오 계정으로 로그인하면<br>내 근무 일정을 볼 수 있어요.</p><button type="button" class="kakao" id="g-login">'+icon('chat',20)+' 카카오로 로그인</button>');
    $("g-login").onclick = ()=>Backend.login().catch(e=>toast(e.message,true));
    return;
  }
  if(st.state==="pending"){
    const sent = st.request;
    gate((sent
      ? '<p><b>연결 요청을 보냈어요.</b><br>관리자가 확인하면 바로 일정이 보여요.</p><p class="gnote">요청한 이름: <b>'+esc(sent.claimed_name||"-")+'</b></p><button class="btn" onclick="location.reload()">다시 확인</button><button class="sub2" id="g-edit">이름을 잘못 적었어요 (다시 적기)</button>'
      : '<p>처음 로그인했어요.<br>팀원 명단의 <b>본인 이름</b>을 적어 주세요.<br>관리자가 확인한 뒤 일정이 보여요.</p><input id="g-name" placeholder="실명 (예: 홍길동)" maxlength="30" autocomplete="name"><button class="btn" id="g-send">연결 요청 보내기</button>')
      + '<button class="sub2" id="g-out">다른 계정으로 로그인</button>');
    if($("g-send")) $("g-send").onclick = async ()=>{ const v=$("g-name").value.trim(); if(!v) return toast("이름을 적어 주세요.", true);
      try{ await Backend.requestLink(v); boot(); }catch(e){ toast(e.message,true); } };
    $("g-out").onclick = doLogout;
    if($("g-edit")) $("g-edit").onclick = ()=>{
      gate('<p>본인 <b>실명</b>을 다시 적어 주세요.</p><input id="g-name" placeholder="실명 (예: 홍길동)" maxlength="30" autocomplete="name" value="'+esc(sent.claimed_name||"")+'"><button class="btn" id="g-send">요청 고치기</button><button class="sub2" onclick="boot()">취소</button>');
      $("g-send").onclick = async ()=>{ const v=$("g-name").value.trim(); if(!v) return toast("이름을 적어 주세요.", true);
        try{ await Backend.requestLink(v); toast("요청을 고쳤어요."); boot(); }catch(e){ toast(e.message,true); } };
    };
    return;
  }
  try{
    const d = await Backend.getData();
    document.body.classList.add("ready");
    if(st.state==="admin"){
      ADM.admin = true; document.body.classList.add("admin");
      try { person = localStorage.getItem("teamCalPerson") || ""; } catch(e){}
      admApply(d); admTab("cal"); setPerson(person, true);
    } else {
      document.body.classList.add("member");
      document.querySelector('.who label').textContent = (d.me||"")+"님 일정";
      setData(d); fillPeople(); setPerson(d.me||"", true); showUpdated();
    }
  }catch(e){ gate('<p>일정을 불러오지 못했어요.<br>'+esc(e.message||e)+'</p><button class="btn" onclick="location.reload()">다시 시도</button><button class="sub2" onclick="doLogout()">로그아웃</button>'); }
}
setInterval(()=>{ if(!document.hidden && document.body.classList.contains("ready")) load(false); }, 5*60*1000);
boot();
