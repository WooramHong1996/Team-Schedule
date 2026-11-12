const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DOCS = process.argv[2];
const MOCK = fs.readFileSync(path.join(__dirname, '..', 'docs', 'preview', 'mock.js'), 'utf8');

function seed(user) {
  const members = [
    { id: 1, name: '홍우람', cert: '있음', user_id: 'U-admin', active: true, sort_order: 1 },
    { id: 2, name: '박진원', cert: '없음', user_id: 'U-park', active: true, sort_order: 2 },
    { id: 3, name: '오한솔', cert: '있음', user_id: null, active: true, sort_order: 3 },
  ];
  const events = [
    { id: 11, name: '수원 메쎄 입주자박람회', type: '전시', start_date: '2026-11-03', end_date: '2026-11-05', place: '수원', manager: '김담당', contact: '010-1234-5678', memo: '내부메모 비밀', notice: '06:30 B게이트 집합 · 검정 정장', need_day: 2, need_night: null },
    { id: 12, name: '구리 총회', type: '외부', start_date: '2026-11-04', end_date: '2026-11-04', place: null, need_day: null, need_night: null },
  ];
  const assignments = [
    { id: 101, work_date: '2026-11-04', member_id: 1, shift: '주간', event_id: 11 },
    { id: 102, work_date: '2026-11-04', member_id: 2, shift: '주간', event_id: 11 },
    { id: 103, work_date: '2026-11-04', member_id: 3, shift: '야간', event_id: 12 },
    { id: 104, work_date: '2026-11-05', member_id: 3, shift: '주간', event_id: 11 },
    { id: 105, work_date: '2026-10-01', member_id: 2, shift: '주간', event_id: 12 },
  ];
  return { user, tables: { members, events, assignments, night_plans: [], need_overrides: [], admins: [{ user_id: 'U-admin' }],
    link_requests: [{ user_id: 'U-new', display_name: '한솔', claimed_name: '오한솔', requested_at: '2026-11-04T01:00:00Z' }] } };
}

async function page(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'application/javascript', body: 'window.__MOCK=' + JSON.stringify(seed(user)) + ';\n' + MOCK });
    if (u.startsWith('http://app/')) {
      const f = path.join(DOCS, u.slice('http://app/'.length).split('?')[0] || 'index.html');
      return route.fulfill({ contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html', body: fs.readFileSync(f) });
    }
    return route.abort();
  });
  await p.goto('http://app/index.html');
  await p.waitForTimeout(600);
  return { p, errs, ctx };
}
const T = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  // 1) 로그아웃 상태
  { const { p, errs } = await page(b, null);
    T('login gate shown', await p.isVisible('#g-login'));
    await p.click('#g-login'); await p.waitForTimeout(100);
    T('oauth kakao', await p.evaluate(() => window.__oauth && window.__oauth.provider === 'kakao'));
    T('no errors (out)', errs.length === 0); if (errs.length) console.log(errs); }
  // 2) 승인 대기
  { const { p, errs } = await page(b, { id: 'U-x', user_metadata: { name: '김새내기' } });
    T('pending form', await p.isVisible('#g-name'));
    T('name input empty', (await p.inputValue('#g-name')) === '');
    await p.fill('#g-name', '김새내기'); await p.click('#g-send'); await p.waitForTimeout(300);
    T('request sent screen', (await p.textContent('#g-body')).includes('연결 요청을 보냈어요'));
    await p.click('#g-edit'); await p.fill('#g-name', '김새내기2'); await p.click('#g-send'); await p.waitForTimeout(300);
    T('request edited', (await p.textContent('#g-body')).includes('김새내기2'));
    T('no errors (pending)', errs.length === 0); if (errs.length) console.log(errs); }
  // 3) 팀원 (박진원): 본인 + 같은 행사 동료만
  { const { p, errs } = await page(b, { id: 'U-park', user_metadata: {} });
    T('member ready', await p.evaluate(() => document.body.classList.contains('ready') && document.body.classList.contains('member')));
    T('person set to me', await p.evaluate(() => person === '박진원'));
    const ev = await p.evaluate(() => DATA.assign.map(a => a.name + '@' + a.date + ':' + a.event).sort().join(','));
    T('member sees own + coworker only', ev === '박진원@2026-10-01:구리 총회,박진원@2026-11-04:수원 메쎄 입주자박람회,홍우람@2026-11-04:수원 메쎄 입주자박람회');
    T('combo hidden', !(await p.isVisible('#person')));
    T('admin bar hidden', !(await p.isVisible('.abar')));
    await p.evaluate(() => { view = new Date(2026, 10, 1); selected = '2026-11-04'; render(); });
    const day = await p.textContent('#daypanel');
    T('day panel shows coworker', day.includes('홍우람') && day.includes('수원 메쎄'));
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(100);   // 날짜 패널은 휴대폰 화면에서 보임
    await p.click('#daypanel [data-evinfo="수원 메쎄 입주자박람회"]'); await p.waitForTimeout(200);
    { const t = await p.textContent('#ei-body');
      T('member event info opens', await p.evaluate(() => $('evinfo').open));
      T('info shows notice, manager, tel, my day + coworker', t.includes('06:30 B게이트') && t.includes('김담당') && t.includes('010-1234-5678') && t.includes('11/4') && t.includes('함께: 홍우람'));
      T('internal memo hidden from member', !t.includes('내부메모') && !(await p.evaluate(() => JSON.stringify(DATA).includes('내부메모')))); }
    await p.click('#ei-close'); await p.waitForTimeout(100);
    T('info closes', await p.evaluate(() => !$('evinfo').open));
    await p.click('#evlist [data-evinfo]'); await p.waitForTimeout(150);
    T('event list opens info too', await p.evaluate(() => $('evinfo').open));
    await p.screenshot({ path: path.join(__dirname, 'member.png') }); await p.click('#ei-close');
    T('no errors (member)', errs.length === 0); if (errs.length) console.log(errs); }
  // 4) 관리자
  { const { p, errs } = await page(b, { id: 'U-admin', user_metadata: {} });
    T('admin mode', await p.evaluate(() => document.body.classList.contains('admin') && ADM.admin === true));
    T('admin sees all', await p.evaluate(() => DATA.assign.length === 5));
    // 배정 충돌 → 덮어쓰기
    await p.evaluate(() => { ADM.evM = new Date(2026, 10, 1); admTab('events'); });
    T('list is summary only (no edit buttons)', await p.evaluate(() => !document.querySelector('#e-list [data-eedit],#e-list [data-del],#e-list .nedit') && document.querySelectorAll('#e-list [data-open]').length === 2));
    await p.click('[data-open="구리 총회"]'); await p.waitForTimeout(150);
    T('detail opens alone', await p.evaluate(() => !$('e-detail').hidden && $('e-listview').hidden && $('ed-head').textContent.includes('구리 총회') && document.querySelector('[data-etab="assign"]').getAttribute('aria-selected')==='true'));
    const inp = await p.$('#ed-body [data-aadd]');
    await inp.fill('홍우람'); await inp.press('Enter'); await p.waitForTimeout(500);
    T('conflict overwrite moved 홍우람', await p.evaluate(() => DATA.assign.some(a => a.name === '홍우람' && a.event === '구리 총회' && a.date === '2026-11-04')
      && !DATA.assign.some(a => a.name === '홍우람' && a.event === '수원 메쎄 입주자박람회')));
    // 빼기
    await p.evaluate(() => assignOne('구리 총회', ['2026-11-04'], '홍우람', 0, true, false)); await p.waitForTimeout(400);
    T('remove works', await p.evaluate(() => !DATA.assign.some(a => a.name === '홍우람')));
    // 이전/다음, 탭, 목록으로
    T('prev/next buttons', await p.evaluate(() => { const o = ADM.evOrder; return o.length===2 && ($('ed-prev').disabled === (o.indexOf('구리 총회')===0)); }));
    await p.click('#ed-prev:not([disabled]), #ed-next:not([disabled])'); await p.waitForTimeout(150);
    T('moved to other event', await p.evaluate(() => ADM.evOpen === '수원 메쎄 입주자박람회' && $('ed-head').textContent.includes('수원 메쎄')));
    await p.click('[data-etab="info"]'); await p.waitForTimeout(100);
    T('info tab has form + delete', await p.evaluate(() => !!document.querySelector('#ed-body [data-esave]') && !!document.querySelector('#ed-body [data-del]')));
    await p.click('[data-etab="extra"]'); await p.waitForTimeout(100);
    T('extra tab has nights + needs', await p.evaluate(() => !!document.querySelector('#ed-body [data-nsave]') && !!document.querySelector('#ed-body [data-ndsave]')));
    await p.click('#ed-back'); await p.waitForTimeout(200);
    T('back to list', await p.evaluate(() => $('e-detail').hidden && !$('e-listview').hidden && !ADM.evOpen));
    // 달력 날짜 카드 → 그 행사 화면, 그 날짜로
    await p.evaluate(() => { admTab('cal'); jumpToEvent('수원 메쎄 입주자박람회', '2026-11-05'); }); await p.waitForTimeout(200);
    T('jump from calendar opens detail at date', await p.evaluate(() => ADM.tab==='events' && ADM.evOpen==='수원 메쎄 입주자박람회' && !!document.querySelector('#ed-body [data-day="2026-11-05"]')));
    await p.click('.atabs [data-t="events"]'); await p.waitForTimeout(200);
    T('events tab again -> list', await p.evaluate(() => !ADM.evOpen && !$('e-listview').hidden));
    // 행사 추가 + 인원
    await p.evaluate(() => { $("e-adddet").open = true; const f = $("e-form").elements; f.name.value = '테스트 행사'; f.type.value = '외부'; f.start.value = '2026-11-10'; f.end.value = '2026-11-11'; });
    await p.fill('#e-pin', '오한솔'); await p.press('#e-pin', 'Enter');
    await p.click('#e-form button[type=submit]'); await p.waitForTimeout(800);
    T('after add, detail of new event', await p.evaluate(() => ADM.evOpen === '테스트 행사' && !$('e-detail').hidden));
    T('event added with people', await p.evaluate(() => DATA.events.some(e => e.name === '테스트 행사') && DATA.assign.filter(a => a.event === '테스트 행사' && a.name === '오한솔').length === 2));
    // 행사 이름 바꾸기
    await p.evaluate(() => api.adminUpdateEvent('테스트 행사', { name: '테스트 행사2', type: '외부', start: '2026-11-10', end: '2026-11-11' }).then(r => admApply(r.data), admFail)); await p.waitForTimeout(400);
    T('event rename keeps assignments', await p.evaluate(() => DATA.assign.filter(a => a.event === '테스트 행사2').length === 2));
    // 팀원 이름 바꾸기
    await p.evaluate(() => api.adminRenameMember('오한솔', '오한솔A').then(r => admApply(r.data), admFail)); await p.waitForTimeout(400);
    T('member rename keeps assignments', await p.evaluate(() => DATA.assign.filter(a => a.name === '오한솔A').length >= 3));
    // 연결 요청
    await p.evaluate(() => admTab('members')); await p.waitForTimeout(200);
    { const t=await p.textContent('#m-reqs'); T('link request shows claimed+nickname', t.includes('오한솔') && t.includes('카카오 닉네임') && t.includes('한솔')); }
    await p.selectOption('#m-reqs [data-lsel]', '오한솔A'); await p.click('#m-reqs [data-link]'); await p.waitForTimeout(400);
    T('linked', await p.evaluate(() => DATA.members.find(m => m.name === '오한솔A').linked && !(DATA.linkRequests || []).length));
    await p.click('.mrow[data-n="오한솔A"] [data-unlink]'); await p.waitForTimeout(400);
    T('unlink returns to requests', await p.evaluate(() => !DATA.members.find(m => m.name === '오한솔A').linked && DATA.linkRequests.length === 1 && DATA.linkRequests[0].userId === 'U-new'));
    await p.selectOption('#m-reqs [data-lsel]', '오한솔A'); await p.click('#m-reqs [data-link]'); await p.waitForTimeout(400);
    T('relinked', await p.evaluate(() => DATA.members.find(m => m.name === '오한솔A').linked));
    await p.click('.mrow[data-n="오한솔A"] [data-admin="1"]'); await p.waitForTimeout(400);
    T('designated admin', await p.evaluate(() => DATA.members.find(m => m.name === '오한솔A').isAdmin));
    await p.click('.mrow[data-n="오한솔A"] [data-admin="0"]'); await p.waitForTimeout(400);
    T('revoked admin', await p.evaluate(() => !DATA.members.find(m => m.name === '오한솔A').isAdmin && DATA.members.find(m => m.name === '홍우람').isAdmin));
    // 팀원 추가 (일당 칸 없음)
    await p.fill('#m-form [name=name]', '새사람'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('member added', await p.evaluate(() => DATA.members.some(x => x.name === '새사람')));
    T('member add has no wage fields', await p.evaluate(() => !document.querySelector('#m-form [name^=rate]') && !('rateExh' in DATA.members[0])));
    // 중복 이름
    await p.fill('#m-form [name=name]', '새사람'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('duplicate name message', (await p.textContent('#toast')).includes('같은 이름'));
    // 퇴사 처리
    await p.evaluate(() => admTab('members')); await p.waitForTimeout(150);
    await p.click('#m-list .mrow[data-n="박진원"] [data-retire]'); await p.waitForTimeout(500);
    T('retired keeps past, removes future', await p.evaluate(() => !DATA.members.some(m=>m.name==='박진원') && DATA.formerMembers.some(m=>m.name==='박진원')
      && DATA.assign.some(a=>a.name==='박진원' && a.date==='2026-10-01') && (()=>{ const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()); return !DATA.assign.some(a=>a.name==='박진원' && a.date>=t); })()));
    T('former list visible', await p.isVisible('#m-former'));
    await p.fill('#m-form [name=name]', '박진원'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('re-add retired name blocked', (await p.textContent('#toast')).includes('퇴사자 목록'));
    await p.evaluate(() => $('m-former').open = true);
    await p.click('#m-flist .mrow[data-n="박진원"] [data-restore]'); await p.waitForTimeout(400);
    T('restore', await p.evaluate(() => DATA.members.some(m=>m.name==='박진원') && !DATA.formerMembers.length));
    // 지난 기록 있는 행사 삭제 막기
    await p.evaluate(() => { ADM.evM = new Date(2026, 10, 1); $('e-q').value=''; admTab('events'); if(ADM.evOpen) showEventList(); });
    await p.click('[data-open="구리 총회"]'); await p.click('[data-etab="info"]'); await p.waitForTimeout(100);
    await p.click('#ed-body [data-del]'); await p.waitForTimeout(400);
    T('event with past record not deleted', (await p.textContent('#toast')).includes('지울 수 없어요') && await p.evaluate(() => DATA.events.some(e=>e.name==='구리 총회')));
    // 근무 일수 화면 (급여 기능 삭제)
    await p.evaluate(() => { view = new Date(2026, 10, 1); admTab('people'); }); await p.waitForTimeout(200);
    T('stats table renders', (await p.textContent('#p-table')).includes('합계'));
    T('stats counts work days', await p.evaluate(() => [...document.querySelectorAll('#p-table tbody tr')].every(tr => {
      const n = tr.cells[0].firstChild.textContent.trim(), mine = DATA.assign.filter(a => a.name === n && a.date.startsWith('2026-11'));
      return tr.cells[1].textContent === new Set(mine.map(a => a.date)).size + '일' && tr.cells[2].textContent === mine.filter(a => a.shift !== '야간').length + '회'
        && tr.cells[3].textContent === mine.filter(a => a.shift === '야간').length + '회'; })));
    T('no wage anywhere in admin screens', await p.evaluate(() => { const t = ['adm-people','adm-members','adm-events','daypanel'].map(id=>document.getElementById(id).textContent).join(' ');
      return !/일당|급여|시급|월급|마감|[0-9],[0-9]{3}원/.test(t) && !document.querySelector('[data-xlsx],[data-close],[data-rate],#p-close'); }));
    T('api has no pay functions', await p.evaluate(() => !api.closeMonth && !api.reopenMonth && !api.adminSetRates));
    // 종류 없는 행사: 정보 탭에서 저장해도 '전시'로 바뀌지 않음 · 전화 링크는 숫자만
    await p.evaluate(() => api.adminAddEvent({name:'종류없는 행사', type:'', start:'2026-11-20', end:'2026-11-20', contact:'010-1234-5678'}).then(r=>admApply(r.data), admFail)); await p.waitForTimeout(300);
    await p.evaluate(() => { admTab('events'); openEvent('종류없는 행사', {tab:'info'}); }); await p.waitForTimeout(150);
    T('no-type event shows 종류 없음', await p.evaluate(() => $('ed-body').querySelector('[data-f=type]').value === ''));
    T('tel link digits only', await p.evaluate(() => $('ed-head').querySelector('a.eitel').getAttribute('href') === 'tel:01012345678'));
    await p.click('#ed-body [data-esave]'); await p.waitForTimeout(400);
    T('saving keeps no type', await p.evaluate(() => !DATA.events.find(e=>e.name==='종류없는 행사').type));
    // 화면을 켜 둔 채 자정이 지나면 '오늘'이 새 날짜로
    T('today refreshes after midnight', await p.evaluate(() => { todayKey = '2000-01-01'; selected = todayKey; const changed = refreshToday();
      return changed && todayKey === iso(new Date()) && selected === todayKey && refreshToday() === false; }));
    await p.evaluate(() => admTab('cal'));
    await p.screenshot({ path: path.join(__dirname, 'admin.png') });
    T('no unexpected errors (admin)', errs.filter(e=>!/같은 이름|퇴사자 목록|지울 수 없어요/.test(e)).length === 0); if (errs.length) console.log(errs); }
  // 5) 폰 화면 팀원
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.close(); }
  await b.close();
})();
