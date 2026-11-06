/* 미리보기 도구 막대: 누구로 볼지 · 밝게/어둡게 · 휴대폰 크기 */
(function(){
  const P = window.__PREVIEW || {};
  // 밝게/어둡게 강제: 다크 모드 @media 블록을 켜거나 끔 (기기 설정과 상관없이)
  function applyTheme(){
    if(!P.theme) return;
    for(const sh of document.styleSheets){
      let rules; try { rules = sh.cssRules; } catch(e){ continue; }
      for(const r of rules) if(r.media && /prefers-color-scheme:\s*dark/.test(r.conditionText || r.media.mediaText)){
        try { r.media.mediaText = P.theme === "dark" ? "all" : "not all"; } catch(e){}
      }
    }
    document.documentElement.style.colorScheme = P.theme;
  }
  function link(k, v){ const q = new URLSearchParams(location.search); if(v) q.set(k, v); else q.delete(k); return "preview.html?" + q.toString(); }
  function bar(){
    if(window.top !== window) return;   // 휴대폰 틀 안에서는 막대를 안 그림
    const b = document.createElement("div");
    b.className = "pv-bar";
    const opt = (k, v, label) => '<a href="'+link(k, v)+'"'+(((P[k]||"") === v) ? ' aria-current="true"' : '')+'>'+label+'</a>';
    b.innerHTML =
      '<b>미리보기</b>'+
      '<span>'+opt("as","member","팀원")+opt("as","admin","관리자")+opt("as","new","처음 로그인")+opt("as","guest","로그인 전")+'</span>'+
      '<span>'+opt("theme","","기기 설정")+opt("theme","light","밝게")+opt("theme","dark","어둡게")+'</span>'+
      '<span>'+opt("frame","","그대로")+opt("frame","phone","휴대폰 틀")+'</span>'+
      '<button type="button" aria-label="미리보기 막대 숨기기">×</button>';
    b.querySelector("button").onclick = () => b.remove();
    const st = document.createElement("style");
    st.textContent = '.pv-bar{position:fixed;left:12px;right:12px;bottom:12px;width:max-content;margin:0 auto;justify-content:center;z-index:9999;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;max-width:calc(100vw - 24px);padding:8px 10px 8px 14px;border-radius:14px;background:#0f172a;color:#e2e8f0;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)}'+
      '.pv-bar span{display:flex;gap:2px;background:#1e293b;border-radius:8px;padding:2px}'+
      '.pv-bar a{white-space:nowrap;color:#cbd5e1;text-decoration:none;padding:5px 8px;border-radius:6px}'+
      '.pv-bar a[aria-current]{background:#e2e8f0;color:#0f172a}'+
      '.pv-bar button{background:none;border:0;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 6px}';
    document.head.appendChild(st); document.body.appendChild(b);
  }
  if(document.readyState === "complete") { applyTheme(); bar(); }
  else window.addEventListener("load", () => { applyTheme(); bar(); });
})();
