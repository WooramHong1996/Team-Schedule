// 테스트용 가짜 supabase-js (메모리 DB). window.__MOCK = {user, tables} 로 초기화
(function(){
  const M = window.__MOCK;
  let seq = 1000;
  const T = M.tables;
  const uniq = { members:['name'], events:['name'], assignments:['work_date,member_id,shift'], night_plans:['work_date,event_id'], need_overrides:['work_date,event_id'], link_requests:['user_id'], admins:['user_id'] };
  const keyOf = (row, cols) => cols.split(',').map(c=>row[c]).join('|');
  function isAdmin(){ return M.user && T.admins.some(a=>a.user_id===M.user.id); }
  function myMember(){ return M.user && T.members.find(m=>m.user_id===M.user.id && m.active!==false); }
  function canRead(table,row){
    if(isAdmin()) return true;
    if(!M.user) return false;
    if(table==='members') return row.user_id===M.user.id;
    if(table==='assignments'){ const me=myMember(); return me && row.member_id===me.id; }
    if(table==='link_requests') return row.user_id===M.user.id;
    if(table==='admins') return false;
    return false;
  }
  function canWrite(table,row){ if(isAdmin()) return true; return table==='link_requests' && M.user && row.user_id===M.user.id; }
  function cascade(table, ids){
    if(table==='members'){ T.assignments = T.assignments.filter(a=>!ids.includes(a.member_id)); }
    if(table==='events'){ ['assignments','night_plans','need_overrides'].forEach(t=>T[t]=T[t].filter(a=>!ids.includes(a.event_id))); }
  }
  function Q(table){
    const st = { op:'select', filters:[], order:[], range:null, single:null, count:null, head:false, payload:null, onConflict:null, ret:false };
    const q = {
      select(cols, opt){ if(st.op==='select'||!st.op) st.op='select'; else st.ret=true; if(opt&&opt.count) st.count=true; if(opt&&opt.head) st.head=true; return q; },
      eq(c,v){ st.filters.push(r=>r[c]===v); return q; },
      in(c,vs){ st.filters.push(r=>vs.includes(r[c])); return q; },
      lt(c,v){ st.filters.push(r=>r[c]<v); return q; }, gte(c,v){ st.filters.push(r=>r[c]>=v); return q; },
      order(c,o){ st.order.push([c,!(o&&o.ascending===false)]); return q; },
      range(a,b){ st.range=[a,b]; return q; }, limit(n){ st.range=[0,n-1]; return q; },
      maybeSingle(){ st.single='maybe'; return q; }, single(){ st.single='one'; return q; },
      insert(p){ st.op='insert'; st.payload=[].concat(p); return q; },
      upsert(p,o){ st.op='upsert'; st.payload=[].concat(p); st.onConflict=o&&o.onConflict; return q; },
      update(p){ st.op='update'; st.payload=p; return q; },
      delete(){ st.op='delete'; return q; },
      then(res, rej){ return Promise.resolve().then(run).then(res, rej); }
    };
    function match(r){ return st.filters.every(f=>f(r)); }
    function run(){
      const rows = T[table];
      const err = (code,message)=>({ data:null, error:{code,message}, count:null });
      if(st.op==='select'){
        let out = rows.filter(r=>canRead(table,r) && match(r));
        st.order.slice().reverse().forEach(([c,asc])=>out.sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(asc?1:-1)));
        const count = out.length;
        if(st.range) out = out.slice(st.range[0], st.range[1]+1);
        out = out.map(r=>({...r}));
        if(st.head) return { data:null, error:null, count };
        if(st.single==='maybe') return { data: out[0]||null, error:null };
        if(st.single==='one') return out.length===1 ? { data: out[0], error:null } : err('PGRST116','no rows');
        return { data: out, error:null, count };
      }
      if(st.op==='insert'||st.op==='upsert'){
        const made=[];
        for(const p of st.payload){
          if(!canWrite(table,p)) return err('42501','new row violates row-level security policy');
          const row = {...p}; if(!('id' in row) && table!=='link_requests' && table!=='admins' && table!=='night_plans' && table!=='need_overrides') row.id=++seq;
          if(table==='members' && row.active===undefined) row.active=true;
          const cons = st.onConflict ? [st.onConflict] : (uniq[table]||[]);
          let dupe = null;
          for(const c of cons){ dupe = rows.find(r=>keyOf(r,c)===keyOf(row,c)); if(dupe) break; }
          if(dupe){ if(st.op==='upsert'){ Object.assign(dupe,p); made.push(dupe); continue; } return err('23505','duplicate key value violates unique constraint'); }
          rows.push(row); made.push(row);
        }
        if(st.single==='one') return { data: made[0], error:null };
        return { data: st.ret?made:null, error:null };
      }
      if(st.op==='update'){
        const tgt = rows.filter(r=>match(r));
        if(!isAdmin()) return err('42501','permission denied');
        for(const r of tgt){ const nr={...r,...st.payload}; for(const c of (uniq[table]||[])){ if(rows.some(o=>o!==r && keyOf(o,c)===keyOf(nr,c))) return err('23505','duplicate'); } }
        tgt.forEach(r=>Object.assign(r,st.payload));
        return { data:null, error:null };
      }
      if(st.op==='delete'){
        if(!isAdmin()) return err('42501','permission denied');
        const tgt = rows.filter(r=>match(r)); const ids = tgt.map(r=>r.id);
        const td=new Date(), today=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0')+'-'+String(td.getDate()).padStart(2,'0');
        if(table==='members' && T.assignments.some(x=>ids.includes(x.member_id) && x.work_date<today)) return err('P0001','지난 근무 기록이 있는 팀원은 삭제할 수 없어요.');
        if(table==='events' && T.assignments.some(x=>ids.includes(x.event_id) && x.work_date<today)) return err('P0001','지난 근무 기록이 있는 행사는 삭제할 수 없어요.');
        T[table] = rows.filter(r=>!match(r)); cascade(table, ids);
        return { data:null, error:null };
      }
    }
    return q;
  }
  window.supabase = { createClient(){ return {
    from: Q,
    rpc(name, args){ return Promise.resolve().then(()=>{
      const me = myMember(); if(!me) return { data:[], error:null };
      const mine = new Set(T.assignments.filter(a=>a.member_id===me.id && a.work_date>=args.p_from && a.work_date<=args.p_to).map(a=>a.work_date+'|'+a.event_id));
      const data = T.assignments.filter(a=>mine.has(a.work_date+'|'+a.event_id)).map(a=>{ const e=T.events.find(x=>x.id===a.event_id), m=T.members.find(x=>x.id===a.member_id);
        return { work_date:a.work_date, event_id:e.id, event_name:e.name, event_type:e.type, place:e.place, start_date:e.start_date, end_date:e.end_date, shift:a.shift, member_name:m.name, cert:m.cert, is_me:m.id===me.id }; });
      return { data, error:null }; }); },
    auth: {
      getSession: async()=>({ data:{ session: M.user ? { user: M.user } : null } }),
      signOut: async()=>{ M.user=null; window.__signedOut=true; return {}; },
      signInWithOAuth: async(o)=>{ window.__oauth=o; return { error:null }; }
    }
  }; } };
})();
