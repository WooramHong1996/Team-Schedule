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
    if(table==='payroll_closings'||table==='payroll_lines') return false;
    return false;
  }
  function canWrite(table,row){ if(isAdmin()) return true; return table==='link_requests' && M.user && row.user_id===M.user.id; }
  function cascade(table, ids){
    if(table==='members'){ T.assignments = T.assignments.filter(a=>!ids.includes(a.member_id)); }
    if(table==='events'){ ['assignments','night_plans','need_overrides'].forEach(t=>T[t]=T[t].filter(a=>!ids.includes(a.event_id))); }
  }
  function closedMonth(d){ return d && (T.payroll_closings||[]).some(c=>c.month===d.slice(0,7)+'-01'); }
  function lockCheck(table, rows){ if(table!=='assignments'&&table!=='night_plans') return null;
    const bad = rows.find(r=>closedMonth(r.work_date)); return bad ? {code:'P0001', message: Number(bad.work_date.slice(5,7))+'월은 급여 마감된 달이라 바꿀 수 없어요.'} : null; }
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
        { const lk = lockCheck(table, st.payload); if(lk) return { data:null, error:lk }; }
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
        { const lk = lockCheck(table, tgt.concat(tgt.map(r=>({...r,...st.payload})))); if(lk) return { data:null, error:lk }; }
        for(const r of tgt){ const nr={...r,...st.payload}; for(const c of (uniq[table]||[])){ if(rows.some(o=>o!==r && keyOf(o,c)===keyOf(nr,c))) return err('23505','duplicate'); } }
        tgt.forEach(r=>Object.assign(r,st.payload));
        return { data:null, error:null };
      }
      if(st.op==='delete'){
        if(!isAdmin()) return err('42501','permission denied');
        const tgt = rows.filter(r=>match(r)); const ids = tgt.map(r=>r.id);
        { const lk = lockCheck(table, tgt); if(lk) return { data:null, error:lk }; }
        if(table==='payroll_closings'){ const ms=tgt.map(r=>r.month); T.payroll_lines=T.payroll_lines.filter(l=>!ms.includes(l.month)); }
        const td=new Date(), today=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0')+'-'+String(td.getDate()).padStart(2,'0');
        if(table==='members' && T.assignments.some(x=>ids.includes(x.member_id) && x.work_date<today)) return err('P0001','지난 근무 기록이 있는 팀원은 삭제할 수 없어요.');
        if(table==='events' && T.assignments.some(x=>ids.includes(x.event_id) && x.work_date<today)) return err('P0001','지난 근무 기록이 있는 행사는 삭제할 수 없어요.');
        T[table] = rows.filter(r=>!match(r)); cascade(table, ids);
        return { data: st.ret ? tgt.map(r=>({...r})) : null, error:null };
      }
    }
    return q;
  }
  window.supabase = { createClient(){ return {
    from: Q,
    rpc(name, args){ if(name==='set_assignments') return Promise.resolve().then(()=>{
        if(!isAdmin()) return { data:null, error:{code:'42501',message:'관리자만'} };
        const ev=T.events.find(e=>e.name===args.p_event); if(!ev) return { data:null, error:{code:'P0001',message:'행사를 찾지 못했어요: '+args.p_event} };
        const mem=T.members.filter(m=>args.p_names.includes(m.name)&&m.active!==false), ids=mem.map(m=>m.id);
        const missing=args.p_names.filter(n=>!mem.some(m=>m.name===n));
        const cur=T.assignments.filter(a=>args.p_dates.includes(a.work_date)&&ids.includes(a.member_id)&&a.shift===args.p_shift);
        const conf=cur.filter(a=>a.event_id!==ev.id).map(a=>({date:a.work_date,name:T.members.find(m=>m.id===a.member_id).name,current:T.events.find(e=>e.id===a.event_id).name}));
        if(conf.length && !args.p_overwrite) return { data:{ok:false,conflicts:conf}, error:null };
        const touched = cur.filter(a=>a.event_id!==ev.id).concat(args.p_dates.flatMap(d=>ids.filter(id=>!cur.some(a=>a.work_date===d&&a.member_id===id)).map(id=>({work_date:d}))));
        { const lk = lockCheck('assignments', touched); if(lk) return { data:null, error:lk }; }
        let changed=0;
        cur.forEach(a=>{ if(a.event_id!==ev.id){ a.event_id=ev.id; changed++; } });
        args.p_dates.forEach(d=>ids.forEach(id=>{ if(!T.assignments.some(a=>a.work_date===d&&a.member_id===id&&a.shift===args.p_shift)){ T.assignments.push({id:++seq,work_date:d,member_id:id,shift:args.p_shift,event_id:ev.id}); changed++; } }));
        if(args.p_shift==='야간'&&args.p_night_hours!=null) args.p_dates.forEach(d=>{ const n=T.night_plans.find(x=>x.work_date===d&&x.event_id===ev.id); if(n) n.hours=args.p_night_hours; else T.night_plans.push({work_date:d,event_id:ev.id,hours:args.p_night_hours}); });
        return { data:{ok:true,changed,missing}, error:null }; });
      if(name==='close_month') return Promise.resolve().then(()=>{
        if(!isAdmin()) return { data:null, error:{code:'42501',message:'관리자만'} };
        const m0=args.p_month.slice(0,7)+'-01'; if(T.payroll_closings.some(c=>c.month===m0)) return { data:null, error:{code:'P0001',message:'이미 마감된 달이에요.'} };
        const byM={};
        T.assignments.filter(a=>a.work_date.slice(0,7)===m0.slice(0,7)).forEach(a=>{ const e=T.events.find(x=>x.id===a.event_id); const np=T.night_plans.find(n=>n.event_id===a.event_id&&n.work_date===a.work_date);
          const hourly = a.shift==='야간' && np && np.hours>0; const o=byM[a.member_id]=byM[a.member_id]||{days:new Set(),exh:0,out:0,etc:0,hr:0,hours:0,night:0};
          o.days.add(a.work_date); if(hourly){o.hr++;o.hours+=np.hours;} else if(e.type==='전시')o.exh++; else if(e.type==='외부')o.out++; else o.etc++; if(a.shift==='야간')o.night++; });
        let total=0;
        Object.entries(byM).forEach(([id,o])=>{ const m=T.members.find(x=>x.id==id); const pay=o.exh*(m.rate_exh||0)+o.out*(m.rate_out||0)+Math.round(o.hours*(m.rate_hour||0)); total+=pay;
          T.payroll_lines.push({month:m0,member_id:m.id,member_name:m.name,days:o.days.size,exh_count:o.exh,out_count:o.out,etc_count:o.etc,hour_count:o.hr,hours:o.hours,night_count:o.night,rate_exh:m.rate_exh,rate_out:m.rate_out,rate_hour:m.rate_hour,pay}); });
        T.payroll_closings.push({month:m0,closed_at:'2026-11-04T05:00:00Z',closed_by_name:'홍우람',total});
        return { data: total, error:null }; });
      return Promise.resolve().then(()=>{
      const me = myMember(); if(!me) return { data:[], error:null };
      const mine = new Set(T.assignments.filter(a=>a.member_id===me.id && a.work_date>=args.p_from && a.work_date<=args.p_to).map(a=>a.work_date+'|'+a.event_id));
      const data = T.assignments.filter(a=>mine.has(a.work_date+'|'+a.event_id)).map(a=>{ const e=T.events.find(x=>x.id===a.event_id), m=T.members.find(x=>x.id===a.member_id);
        return { work_date:a.work_date, event_id:e.id, event_name:e.name, event_type:e.type, place:e.place, start_date:e.start_date, end_date:e.end_date, shift:a.shift, member_name:m.name, cert:m.cert, is_me:m.id===me.id, manager:e.manager||null, contact:e.contact||null, notice:e.notice||null }; });
      return { data, error:null }; }); },
    auth: {
      getSession: async()=>({ data:{ session: M.user ? { user: M.user } : null } }),
      signOut: async()=>{ M.user=null; window.__signedOut=true; return {}; },
      signInWithOAuth: async(o)=>{ window.__oauth=o; return { error:null }; }
    }
  }; } };
})();
