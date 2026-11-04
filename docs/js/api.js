/*
 * 팀 스케줄 — 수퍼베이스 연결부
 *
 * 화면(index.html)은 api.함수이름(...) 을 부르고, 결과는 Promise로 받습니다.
 * 관리자 함수는 { ok, data(새 전체 데이터), ... } 를 돌려줍니다.
 * 권한(관리자 / 본인만)은 DB의 RLS가 다시 확인하므로 화면을 고쳐도 우회할 수 없습니다.
 */
(function () {
  const SUPABASE_URL = 'https://wnqssbtqbaisgtmpitve.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0R29XxwnzFC93FrTeROjNA_EAhYGkbs';
  const DEFAULT_RATE = { exh: 100000, out: 90000, hour: 10000 };
  const SHIFT = ['주간', '야간'];

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.sb = sb;

  /* ---------------- 공용 ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const num = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/[,\s원]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  };
  const today = () => iso(new Date());
  const stamp = () => { const d = new Date(); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  function fail(error, fallback) {
    if (!error) return;
    const m = String(error.message || error);
    if (error.code === '23505') throw new Error(fallback || '이미 같은 값이 있어요.');
    if (error.code === '42501' || /row-level security|permission denied/i.test(m)) throw new Error('권한이 없어요. 관리자 계정으로 로그인했는지 확인해 주세요.');
    if (/JWT|session/i.test(m)) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
    throw new Error(m);
  }
  /** 1000줄 제한을 넘는 표도 끝까지 읽기 */
  async function fetchAll(table, columns, build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(columns).range(from, from + 999);
      if (build) q = build(q);
      const { data, error } = await q;
      fail(error);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  /* ---------------- 로그인 상태 ---------------- */
  const S = { user: null, isAdmin: false, me: null, members: [], events: [] };

  async function whoAmI() {
    const { data: { session } } = await sb.auth.getSession();
    S.user = session ? session.user : null;
    S.isAdmin = false; S.me = null;
    if (!S.user) return { state: 'out' };
    const [adm, me] = await Promise.all([
      sb.from('admins').select('user_id').eq('user_id', S.user.id).maybeSingle(),
      sb.from('members').select('id,name,cert,active').eq('user_id', S.user.id).maybeSingle()
    ]);
    S.isAdmin = !!(adm.data);
    S.me = me.data || null;
    if (S.isAdmin) return { state: 'admin', me: S.me };
    if (S.me && S.me.active) return { state: 'member', me: S.me };
    const req = await sb.from('link_requests').select('claimed_name,requested_at').eq('user_id', S.user.id).maybeSingle();
    return { state: 'pending', request: req.data || null, nickname: nicknameOf(S.user) };
  }
  function nicknameOf(u) {
    const m = (u && u.user_metadata) || {};
    return m.name || m.full_name || m.nickname || m.preferred_username || m.user_name || '';
  }
  async function login() {
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } });
    fail(error);
  }
  async function logout() { await sb.auth.signOut(); }
  async function requestLink(claimedName) {
    const md = S.user.user_metadata || {};
    const row = { user_id: S.user.id, display_name: nicknameOf(S.user), claimed_name: String(claimedName || '').trim() || null,
      avatar_url: md.avatar_url || md.picture || null };
    const { error } = await sb.from('link_requests').upsert(row);
    fail(error);
  }

  /* ---------------- 데이터 읽기 ---------------- */
  async function buildAdmin() {
    const [members, events, assigns, nights, needs, reqs, admins, closes, lines] = await Promise.all([
      fetchAll('members', 'id,name,cert,note,rate_out,rate_exh,rate_hour,user_id,active,retired_at,sort_order', q => q.order('sort_order').order('id')),
      fetchAll('events', '*', q => q.order('start_date').order('id')),
      fetchAll('assignments', 'work_date,member_id,shift,event_id', q => q.order('work_date').order('id')),
      fetchAll('night_plans', 'work_date,event_id,hours'),
      fetchAll('need_overrides', 'work_date,event_id,need_day,need_night'),
      fetchAll('link_requests', 'user_id,display_name,claimed_name,avatar_url,requested_at', q => q.order('requested_at')),
      fetchAll('admins', 'user_id'),
      fetchAll('payroll_closings', 'month,closed_at,closed_by_name,total'),
      fetchAll('payroll_lines', '*')
    ]);
    const closings = {};
    closes.forEach(c => { closings[c.month.slice(0, 7)] = { closedAt: c.closed_at, by: c.closed_by_name || '', total: Number(c.total), lines: [] }; });
    lines.forEach(l => { const c = closings[l.month.slice(0, 7)]; if (c) c.lines.push({
      name: l.member_name, days: l.days, exh: l.exh_count, out: l.out_count, etc: l.etc_count, hr: l.hour_count, hours: Number(l.hours),
      night: l.night_count, rateExh: l.rate_exh, rateOut: l.rate_out, rateHour: l.rate_hour, pay: Number(l.pay) }); });
    const adminSet = new Set(admins.map(a => a.user_id));
    S.members = members; S.events = events;
    const mName = new Map(members.map(m => [m.id, m.name]));
    const eName = new Map(events.map(e => [e.id, e.name]));
    const nightHours = {}, needOv = {};
    nights.forEach(n => { nightHours[n.work_date + '|' + eName.get(n.event_id)] = n.hours == null ? null : Number(n.hours); });
    needs.forEach(n => { needOv[n.work_date + '|' + eName.get(n.event_id)] = [n.need_day, n.need_night]; });
    return {
      updated: stamp(), role: 'admin', me: S.me ? S.me.name : '',
      members: members.filter(m => m.active).map(m => ({
        name: m.name, cert: m.cert !== '없음', certRaw: m.cert || '', note: m.note || '',
        rateOut: m.rate_out, rateExh: m.rate_exh, rateHour: m.rate_hour, linked: !!m.user_id,
        isAdmin: !!(m.user_id && adminSet.has(m.user_id)), isMe: !!(S.user && m.user_id === S.user.id)
      })),
      formerMembers: members.filter(m => !m.active).map(m => ({
        name: m.name, cert: m.cert !== '없음', certRaw: m.cert || '', rateOut: m.rate_out, rateExh: m.rate_exh, rateHour: m.rate_hour,
        retiredAt: m.retired_at ? String(m.retired_at).slice(0, 10) : ''
      })),
      events: events.map(e => ({
        name: e.name, type: e.type || '', start: e.start_date, end: e.end_date, place: e.place || '',
        manager: e.manager || '', contact: e.contact || '', memo: e.memo || '', needDay: e.need_day, needNight: e.need_night
      })),
      assign: assigns.map(a => [a.work_date, mName.get(a.member_id), a.shift === '야간' ? 1 : 0, eName.get(a.event_id)]),
      nightHours, needOv, closings,
      linkRequests: reqs.map(r => ({ userId: r.user_id, nickname: r.display_name || '', claimed: r.claimed_name || '', avatar: r.avatar_url || '', at: r.requested_at }))
    };
  }

  async function buildMember() {
    const t = new Date();
    const from = iso(new Date(t.getFullYear() - 1, t.getMonth(), 1));
    const to = iso(new Date(t.getFullYear() + 1, t.getMonth() + 1, 0));
    const { data, error } = await sb.rpc('my_schedule', { p_from: from, p_to: to });
    fail(error);
    const members = new Map(), events = new Map(), assign = [];
    if (S.me) members.set(S.me.name, { name: S.me.name, cert: S.me.cert !== '없음' });
    (data || []).forEach(r => {
      if (!members.has(r.member_name)) members.set(r.member_name, { name: r.member_name, cert: r.cert !== '없음' });
      if (!events.has(r.event_name)) events.set(r.event_name, { name: r.event_name, type: r.event_type || '', start: r.start_date, end: r.end_date, place: r.place || '' });
      assign.push([r.work_date, r.member_name, r.shift === '야간' ? 1 : 0, r.event_name]);
    });
    return { updated: stamp(), role: 'member', me: S.me ? S.me.name : '', members: [...members.values()], events: [...events.values()], assign };
  }

  async function getData() { return S.isAdmin ? buildAdmin() : buildMember(); }
  async function done(extra) { return Object.assign({ ok: true, data: await buildAdmin() }, extra || {}); }

  /* 이름 → id (최신 목록 기준) */
  async function memberId(name) {
    const { data, error } = await sb.from('members').select('id').eq('name', name).maybeSingle();
    fail(error);
    if (!data) throw new Error('팀원을 찾지 못했어요: ' + name);
    return data.id;
  }
  async function eventRow(name) {
    const { data, error } = await sb.from('events').select('*').eq('name', name).maybeSingle();
    fail(error);
    if (!data) throw new Error('행사를 찾지 못했어요: ' + name);
    return data;
  }
  function checkDates(a, b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a || ''))) throw new Error('시작일을 확인해 주세요.');
    if (b && !/^\d{4}-\d{2}-\d{2}$/.test(String(b))) throw new Error('종료일을 확인해 주세요.');
    if (b && b < a) throw new Error('종료일이 시작일보다 빨라요.');
  }
  const n0 = v => num(v);

  /* ---------------- 관리자: 배정 ---------------- */
  async function adminSetAssign(p) {
    const shift = SHIFT[Number(p.shift) ? 1 : 0];
    const dates = (p.dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const names = (p.names || []).map(n => String(n).trim()).filter(Boolean);
    const { data: mem, error: me } = await sb.from('members').select('id,name').in('name', names);
    fail(me);
    const idOf = new Map(mem.map(m => [m.name, m.id]));
    const nameOf = new Map(mem.map(m => [m.id, m.name]));
    const missing = names.filter(n => !idOf.has(n));
    const ids = [...idOf.values()];
    const evName = String(p.event || '').trim(), only = String(p.onlyEvent || '').trim();
    const ev = evName ? await eventRow(evName) : null;
    const onlyEv = only ? await eventRow(only) : null;
    if (!dates.length || !ids.length) return done({ changed: 0, missing });

    const { data: cur, error: ce } = await sb.from('assignments').select('id,work_date,member_id,event_id')
      .eq('shift', shift).in('work_date', dates).in('member_id', ids);
    fail(ce);

    if (!ev) {   // 빼기
      const drop = cur.filter(r => !onlyEv || r.event_id === onlyEv.id).map(r => r.id);
      if (drop.length) { const { error } = await sb.from('assignments').delete().in('id', drop); fail(error); }
      return done({ changed: drop.length, missing });
    }
    const curKey = new Map(cur.map(r => [r.work_date + '|' + r.member_id, r]));
    const evNames = new Map(S.events.map(e => [e.id, e.name]));
    const conflicts = cur.filter(r => r.event_id !== ev.id)
      .map(r => ({ date: r.work_date, name: nameOf.get(r.member_id), current: evNames.get(r.event_id) || '다른 행사' }));
    if (conflicts.length && !p.overwrite) return { ok: false, conflicts };

    const upd = cur.filter(r => r.event_id !== ev.id).map(r => r.id);
    const add = [];
    dates.forEach(d => ids.forEach(id => { if (!curKey.has(d + '|' + id)) add.push({ work_date: d, member_id: id, shift, event_id: ev.id }); }));
    if (upd.length) { const { error } = await sb.from('assignments').update({ event_id: ev.id }).in('id', upd); fail(error); }
    for (let i = 0; i < add.length; i += 500) { const { error } = await sb.from('assignments').insert(add.slice(i, i + 500)); fail(error); }

    if (shift === '야간' && p.nightHours !== undefined && String(p.nightHours).trim() !== '') {
      const h = num(p.nightHours);
      const { error } = await sb.from('night_plans').upsert(dates.map(d => ({ work_date: d, event_id: ev.id, hours: h })), { onConflict: 'work_date,event_id' });
      fail(error);
    }
    return done({ changed: upd.length + add.length, missing });
  }

  /* ---------------- 관리자: 행사 ---------------- */
  function eventFields(f) {
    return {
      name: String(f.name || '').trim(), type: ['전시', '외부'].includes(f.type) ? f.type : null,
      start_date: f.start, end_date: f.end || f.start,
      place: (f.place || '').trim() || null, manager: (f.manager || '').trim() || null, contact: (f.contact || '').trim() || null,
      memo: (f.memo || '').trim() || null, need_day: n0(f.needDay), need_night: n0(f.needNight)
    };
  }
  async function adminAddEvent(f) {
    const row = eventFields(f);
    if (!row.name) throw new Error('행사명을 적어 주세요.');
    checkDates(row.start_date, row.end_date);
    const { data, error } = await sb.from('events').insert(row).select('id').single();
    fail(error, '같은 이름의 행사가 이미 있어요: ' + row.name);
    await replaceNights(data.id, f.nights || []);
    return done();
  }
  async function adminUpdateEvent(oldName, f) {
    const ev = await eventRow(oldName);
    const row = eventFields(f);
    if (!row.name) throw new Error('행사명을 적어 주세요.');
    checkDates(row.start_date, row.end_date);
    const { error } = await sb.from('events').update(row).eq('id', ev.id);
    fail(error, '같은 이름의 행사가 이미 있어요: ' + row.name);
    let renamed = 0;
    if (row.name !== oldName) {
      const { count } = await sb.from('assignments').select('id', { count: 'exact', head: true }).eq('event_id', ev.id);
      renamed = count || 0;
    }
    return done({ renamed });
  }
  async function adminDeleteEvent(name, clear) {
    const ev = await eventRow(name);
    const { count: past, error: pe } = await sb.from('assignments').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).lt('work_date', today());
    fail(pe);
    if (past) throw new Error('「' + name + '」에는 이미 지난 근무 기록이 ' + past + '칸 있어서 지울 수 없어요. (급여 기록 보호) 앞으로의 배정만 빼려면 인원 배정에서 빼 주세요.');
    const { count, error: ce } = await sb.from('assignments').select('id', { count: 'exact', head: true }).eq('event_id', ev.id);
    fail(ce);
    if (count && !clear) return { ok: false, assigned: count };
    const { error } = await sb.from('events').delete().eq('id', ev.id);   // 배정·야간·필요인원은 함께 지워짐
    fail(error);
    return done({ cleared: count || 0 });
  }
  async function adminSetEventNeeds(name, rows) {
    const ev = await eventRow(name);
    const { data: old } = await sb.from('need_overrides').select('work_date,memo').eq('event_id', ev.id);
    const memo = new Map((old || []).map(r => [r.work_date, r.memo]));
    const { error: de } = await sb.from('need_overrides').delete().eq('event_id', ev.id);
    fail(de);
    const add = (rows || []).map(r => ({ work_date: r.date, event_id: ev.id, need_day: num(r.day), need_night: num(r.night), memo: memo.get(r.date) || null }))
      .filter(r => r.need_day != null || r.need_night != null);
    if (add.length) { const { error } = await sb.from('need_overrides').insert(add); fail(error); }
    return done();
  }
  async function replaceNights(eventId, nights) {
    const { data: old } = await sb.from('night_plans').select('work_date,memo').eq('event_id', eventId);
    const memo = new Map((old || []).map(r => [r.work_date, r.memo]));
    const { error: de } = await sb.from('night_plans').delete().eq('event_id', eventId);
    fail(de);
    const add = (nights || []).filter(n => n && n.date).map(n => ({ work_date: n.date, event_id: eventId, hours: num(n.hours), memo: memo.get(n.date) || null }));
    if (add.length) { const { error } = await sb.from('night_plans').insert(add); fail(error); }
  }
  async function adminSetEventNights(name, nights) {
    const ev = await eventRow(name);
    await replaceNights(ev.id, nights);
    return done();
  }
  async function adminSetNightHours(date, name, hours) {
    const ev = await eventRow(name);
    if (hours === null) { const { error } = await sb.from('night_plans').delete().eq('event_id', ev.id).eq('work_date', date); fail(error); }
    else { const { error } = await sb.from('night_plans').upsert({ work_date: date, event_id: ev.id, hours: num(hours) }, { onConflict: 'work_date,event_id' }); fail(error); }
    return done();
  }

  /* ---------------- 관리자: 팀원 ---------------- */
  async function adminAddMember(f) {
    const name = String(f.name || '').trim();
    if (!name) throw new Error('이름을 적어 주세요.');
    const { data: last } = await sb.from('members').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const pick = (v, d) => { const x = num(v); return x == null ? d : x; };
    const { data: same } = await sb.from('members').select('active').eq('name', name).maybeSingle();
    if (same && !same.active) throw new Error('퇴사자 목록에 같은 이름(' + name + ')이 있어요. 같은 사람이면 퇴사자 목록에서 "복귀"를 눌러 주세요. 다른 사람이면 이름 뒤에 숫자를 붙여 주세요.');
    const { error } = await sb.from('members').insert({
      name, cert: ['있음', '없음'].includes(f.cert) ? f.cert : null,
      rate_exh: pick(f.rateExh, DEFAULT_RATE.exh), rate_out: pick(f.rateOut, DEFAULT_RATE.out), rate_hour: pick(f.rateHour, DEFAULT_RATE.hour),
      sort_order: ((last && last[0] && last[0].sort_order) || 0) + 1
    });
    fail(error, '같은 이름이 이미 있어요: ' + name + ' (동명이인이면 이름 뒤에 숫자를 붙여 주세요)');
    return done();
  }
  async function adminSetCert(name, v) {
    const { error } = await sb.from('members').update({ cert: ['있음', '없음'].includes(v) ? v : null }).eq('id', await memberId(name));
    fail(error);
    return done();
  }
  async function adminSetRates(name, out, exh, hour) {
    const { error } = await sb.from('members').update({ rate_out: num(out), rate_exh: num(exh), rate_hour: num(hour) }).eq('id', await memberId(name));
    fail(error);
    return done();
  }
  async function adminRenameMember(oldName, newName) {
    newName = String(newName || '').trim();
    if (!newName) throw new Error('새 이름을 적어 주세요.');
    const id = await memberId(oldName);
    const { error } = await sb.from('members').update({ name: newName }).eq('id', id);
    fail(error, '같은 이름이 이미 있어요: ' + newName);
    const { count } = await sb.from('assignments').select('id', { count: 'exact', head: true }).eq('member_id', id);
    return done({ renamed: count || 0 });
  }
  /* 완전 삭제는 근무 기록이 하나도 없을 때만 (잘못 만든 팀원 정리용) */
  async function adminDeleteMember(name) {
    const id = await memberId(name);
    const { count, error: ce } = await sb.from('assignments').select('id', { count: 'exact', head: true }).eq('member_id', id);
    fail(ce);
    if (count) throw new Error(name + ' 님은 근무 기록이 ' + count + '칸 있어서 완전 삭제할 수 없어요. 퇴사 처리로 충분해요.');
    const { error } = await sb.from('members').delete().eq('id', id);
    fail(error);
    return done();
  }
  /* 퇴사 처리: 지난 기록·급여는 그대로, 오늘 이후 배정만 빼고 명단·로그인에서 제외 */
  async function adminRetireMember(name, confirmFuture) {
    const { data: m, error: me } = await sb.from('members').select('id,user_id').eq('name', name).maybeSingle();
    fail(me);
    if (!m) throw new Error('팀원을 찾지 못했어요: ' + name);
    const { data: fut, error: fe } = await sb.from('assignments').select('id').eq('member_id', m.id).gte('work_date', today());
    fail(fe);
    if (fut.length && !confirmFuture) return { ok: false, future: fut.length };
    if (m.user_id) {
      const { error: ae } = await sb.from('admins').delete().eq('user_id', m.user_id);
      fail(ae);
    }
    if (fut.length) { const { error } = await sb.from('assignments').delete().in('id', fut.map(r => r.id)); fail(error); }
    const { error } = await sb.from('members').update({ active: false, retired_at: new Date().toISOString(), user_id: null }).eq('id', m.id);
    fail(error);
    return done({ cleared: fut.length });
  }
  async function adminRestoreMember(name) {
    const { error } = await sb.from('members').update({ active: true, retired_at: null }).eq('id', await memberId(name));
    fail(error);
    return done();
  }
  /* 카카오 계정 ↔ 팀원 연결 */
  async function adminLinkMember(userId, name) {
    const id = await memberId(name);
    const { data: other } = await sb.from('members').select('name').eq('user_id', userId).maybeSingle();
    if (other && other.name !== name) throw new Error('이 카카오 계정은 이미 ' + other.name + ' 님에게 연결돼 있어요.');
    const { error } = await sb.from('members').update({ user_id: userId }).eq('id', id);
    fail(error, name + ' 님은 이미 다른 카카오 계정과 연결돼 있어요. 먼저 연결을 해제해 주세요.');
    await sb.from('link_requests').delete().eq('user_id', userId);
    return done();
  }
  /* 연결 해제: 그 카카오 계정은 다시 '연결 요청'으로 돌아가서 바로 다른 사람과 다시 연결할 수 있음 */
  async function adminUnlinkMember(name) {
    const { data: m, error: me } = await sb.from('members').select('id,user_id').eq('name', name).maybeSingle();
    fail(me);
    if (!m) throw new Error('팀원을 찾지 못했어요: ' + name);
    const { error } = await sb.from('members').update({ user_id: null }).eq('id', m.id);
    fail(error);
    if (m.user_id) {
      const { error: re } = await sb.from('link_requests').upsert({ user_id: m.user_id, display_name: '(연결 해제됨: ' + name + ')', claimed_name: name });
      fail(re);
    }
    return done();
  }
  async function adminDismissRequest(userId) {
    const { error } = await sb.from('link_requests').delete().eq('user_id', userId);
    fail(error);
    return done();
  }

  /* 간부(관리자) 지정·해제 — 카카오 연결된 팀원만 */
  async function adminSetAdmin(name, on) {
    const { data: m, error: me } = await sb.from('members').select('user_id').eq('name', name).maybeSingle();
    fail(me);
    if (!m || !m.user_id) throw new Error(name + ' 님은 아직 카카오 연결이 안 돼 있어요. 먼저 연결해 주세요.');
    if (on) { const { error } = await sb.from('admins').upsert({ user_id: m.user_id }); fail(error); }
    else { const { error } = await sb.from('admins').delete().eq('user_id', m.user_id); fail(error); }
    return done();
  }

  /* 급여 월 마감: ym = 'YYYY-MM' */
  async function closeMonth(ym) {
    const { data, error } = await sb.rpc('close_month', { p_month: ym + '-01' });
    fail(error);
    return done({ total: Number(data) });
  }
  async function reopenMonth(ym) {
    const { error } = await sb.from('payroll_closings').delete().eq('month', ym + '-01');
    fail(error);
    return done();
  }

  const API = {
    getData,
    adminSetAssign, adminAddEvent, adminUpdateEvent, adminDeleteEvent, adminSetEventNeeds, adminSetEventNights, adminSetNightHours,
    adminAddMember, adminSetCert, adminSetRates, adminRenameMember, adminDeleteMember, adminRetireMember, adminRestoreMember,
    adminLinkMember, adminUnlinkMember, adminDismissRequest, adminSetAdmin, closeMonth, reopenMonth
  };

  window.api = API;
  window.Backend = { sb, whoAmI, login, logout, requestLink, getData, state: S };
})();
