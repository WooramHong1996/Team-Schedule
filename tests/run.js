const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DOCS = process.argv[2];
const MOCK = fs.readFileSync(path.join(__dirname, 'mocksb.js'), 'utf8');

function seed(user) {
  const members = [
    { id: 1, name: '홍우람', cert: '있음', rate_out: 110000, rate_exh: 115000, rate_hour: 10000, user_id: 'U-admin', active: true, sort_order: 1 },
    { id: 2, name: '박진원', cert: '없음', rate_out: null, rate_exh: null, rate_hour: 10000, user_id: 'U-park', active: true, sort_order: 2 },
    { id: 3, name: '오한솔', cert: '있음', rate_out: null, rate_exh: null, rate_hour: 10000, user_id: null, active: true, sort_order: 3 },
  ];
  const events = [
    { id: 11, name: '수원 메쎄 입주자박람회', type: '전시', start_date: '2026-11-03', end_date: '2026-11-05', place: '수원', need_day: 2, need_night: null },
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
      return route.fulfill({ contentType: f.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(f) });
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
    T('no errors (member)', errs.length === 0); if (errs.length) console.log(errs); }
  // 4) 관리자
  { const { p, errs } = await page(b, { id: 'U-admin', user_metadata: {} });
    T('admin mode', await p.evaluate(() => document.body.classList.contains('admin') && ADM.admin === true));
    T('admin sees all', await p.evaluate(() => DATA.assign.length === 5));
    // 배정 충돌 → 덮어쓰기
    await p.evaluate(() => { ADM.evM = new Date(2026, 10, 1); admTab('events'); });
    await p.click('[data-aedit="구리 총회"]'); await p.waitForTimeout(150);
    const inp = await p.$('[data-nbox="구리 총회"] [data-aadd]');
    await inp.fill('홍우람'); await inp.press('Enter'); await p.waitForTimeout(500);
    T('conflict overwrite moved 홍우람', await p.evaluate(() => DATA.assign.some(a => a.name === '홍우람' && a.event === '구리 총회' && a.date === '2026-11-04')
      && !DATA.assign.some(a => a.name === '홍우람' && a.event === '수원 메쎄 입주자박람회')));
    // 빼기
    await p.evaluate(() => assignOne('구리 총회', ['2026-11-04'], '홍우람', 0, true, false)); await p.waitForTimeout(400);
    T('remove works', await p.evaluate(() => !DATA.assign.some(a => a.name === '홍우람')));
    // 행사 추가 + 인원
    await p.evaluate(() => { $("e-adddet").open = true; const f = $("e-form").elements; f.name.value = '테스트 행사'; f.type.value = '외부'; f.start.value = '2026-11-10'; f.end.value = '2026-11-11'; });
    await p.fill('#e-pin', '오한솔'); await p.press('#e-pin', 'Enter');
    await p.click('#e-form button[type=submit]'); await p.waitForTimeout(800);
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
    // 팀원 추가 기본 일당
    await p.fill('#m-form [name=name]', '새사람'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('member add defaults', await p.evaluate(() => { const m = DATA.members.find(x => x.name === '새사람'); return m && m.rateExh === 100000 && m.rateOut === 90000 && m.rateHour === 10000; }));
    // 중복 이름
    await p.fill('#m-form [name=name]', '새사람'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('duplicate name message', (await p.textContent('#toast')).includes('같은 이름'));
    // 퇴사 처리
    await p.evaluate(() => admTab('members')); await p.waitForTimeout(150);
    await p.click('#m-list .mrow[data-n="박진원"] [data-retire]'); await p.waitForTimeout(500);
    T('retired keeps past, removes future', await p.evaluate(() => !DATA.members.some(m=>m.name==='박진원') && DATA.formerMembers.some(m=>m.name==='박진원')
      && DATA.assign.some(a=>a.name==='박진원' && a.date==='2026-10-01') && !DATA.assign.some(a=>a.name==='박진원' && a.date>='2026-11-04')));
    T('former list visible', await p.isVisible('#m-former'));
    await p.fill('#m-form [name=name]', '박진원'); await p.click('#m-form button[type=submit]'); await p.waitForTimeout(400);
    T('re-add retired name blocked', (await p.textContent('#toast')).includes('퇴사자 목록'));
    await p.evaluate(() => $('m-former').open = true);
    await p.click('#m-flist .mrow[data-n="박진원"] [data-restore]'); await p.waitForTimeout(400);
    T('restore', await p.evaluate(() => DATA.members.some(m=>m.name==='박진원') && !DATA.formerMembers.length));
    // 지난 기록 있는 행사 삭제 막기
    await p.evaluate(() => { ADM.evM = new Date(2026, 10, 1); $('e-q').value=''; admTab('events'); });
    await p.click('[data-del="구리 총회"]'); await p.waitForTimeout(400);
    T('event with past record not deleted', (await p.textContent('#toast')).includes('지울 수 없어요') && await p.evaluate(() => DATA.events.some(e=>e.name==='구리 총회')));
    // 급여 화면
    await p.evaluate(() => admTab('people')); await p.waitForTimeout(200);
    T('pay table renders', (await p.textContent('#p-table')).includes('합계'));
    await p.evaluate(() => admTab('cal'));
    await p.screenshot({ path: path.join(__dirname, 'admin.png') });
    T('no unexpected errors (admin)', errs.filter(e=>!/같은 이름|퇴사자 목록|지울 수 없어요/.test(e)).length === 0); if (errs.length) console.log(errs); }
  // 5) 폰 화면 팀원
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.close(); }
  await b.close();
})();
