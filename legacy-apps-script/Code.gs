/**
 * 팀 스케줄 — 웹 앱 서버 코드 (배정목록 버전)
 *
 * 시트 구조
 *  - 행사      : A 행사명 | B 종류 | C 시작일 | D 종료일 | E 기간(수식) | F 연인원(수식) | G 메모 | H 색상 | I 적용 색(수식) | J 장소 | K 담당자 | L 연락처 | M 필요(주간) | N 필요(야간)
 *  - 배정목록  : A 날짜 | B 팀원 | C 근무(주간/야간) | D 행사      ← 배정 1건 = 1줄 (기간·인원 제한 없음)
 *  - 팀원      : A 이름 | B 이수증(있음/없음/빈칸) | C 비고 | D 일당(외부) | E 일당(전시) | F 시급(야간)
 *  - 야간시간  : A 날짜 | B 행사명 | C 야간 시간(비우면 일당) | D 메모
 *  - 필요인원  : A 날짜 | B 행사명 | C 주간 필요 | D 야간 필요 | E 메모
 *
 * 관리자 코드는 [프로젝트 설정 → 스크립트 속성]의 ADMIN_CODE 값입니다.
 * E·F·I열(행사)은 수식이 자동으로 채우므로 코드에서 절대 쓰지 않습니다.
 */

const SH = {
  EVENTS: '행사',
  LIST: '배정목록',
  MEMBERS: '팀원',
  NIGHT: '야간시간',
  NEED: '필요인원'
};
const SHIFT_NAMES = ['주간', '야간'];
const DEFAULT_RATE = { exh: 100000, out: 90000, hour: 10000 };
const CACHE_KEY = 'pub_v2';
const CACHE_SEC = 21600;       // 6시간 (시트를 고치면 onEdit가 지움)
const TOKEN_SEC = 21600;       // 관리자 열쇠 6시간
const CHUNK = 90000;

/* ============================== 웹 페이지 ============================== */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.dataJson = JSON.stringify(getData()).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('팀 스케줄')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 팀원용 데이터 (저장본이 있으면 바로) */
function getData() {
  const hit = cacheGet_(CACHE_KEY);
  if (hit) return hit;
  return refreshData();
}

/** ↻ 버튼: 시트에서 새로 읽어 저장본을 갈아 끼움 */
function refreshData() {
  const pub = stripPrivate_(buildData());
  cachePut_(CACHE_KEY, pub);
  return pub;
}

/** 시트 전체를 읽어 웹에서 쓰는 모양으로 만듭니다 (관리자용 전체 정보 포함) */
function buildData() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();

  // 팀원
  const members = [];
  rows_(ss.getSheetByName(SH.MEMBERS), 6).forEach(r => {
    const name = str_(r[0]);
    if (!name) return;
    const certRaw = str_(r[1]);
    members.push({
      name: name,
      cert: certRaw !== '없음',
      certRaw: certRaw,
      note: str_(r[2]),
      rateOut: num_(r[3]),
      rateExh: num_(r[4]),
      rateHour: num_(r[5])
    });
  });

  // 행사
  const events = [];
  rows_(ss.getSheetByName(SH.EVENTS), 14).forEach(r => {
    const name = str_(r[0]);
    if (!name) return;
    const start = day_(r[2], tz), end = day_(r[3], tz) || start;
    if (!start) return;
    events.push({
      name: name, type: str_(r[1]), start: start, end: end < start ? start : end,
      memo: str_(r[6]), place: str_(r[9]), manager: str_(r[10]), contact: str_(r[11]),
      needDay: num_(r[12]), needNight: num_(r[13])
    });
  });

  // 배정목록 → [날짜, 이름, 0/1, 행사]
  const assign = readList_(ss).rows.map(a => [a.date, a.name, a.shift === '야간' ? 1 : 0, a.event]);

  // 야간 시간 (날짜|행사 → 시간, 비우면 null = 일당)
  const nightHours = {};
  const nsh = ss.getSheetByName(SH.NIGHT);
  if (nsh) rows_(nsh, 3).forEach(r => {
    const d = day_(r[0], tz), ev = str_(r[1]);
    if (!d || !ev) return;
    nightHours[d + '|' + ev] = num_(r[2]);
  });

  // 날짜별 필요 인원 (날짜|행사 → [주간, 야간])
  const needOv = {};
  const dsh = ss.getSheetByName(SH.NEED);
  if (dsh) rows_(dsh, 4).forEach(r => {
    const d = day_(r[0], tz), ev = str_(r[1]);
    if (!d || !ev) return;
    const a = num_(r[2]), b = num_(r[3]);
    if (a == null && b == null) return;
    needOv[d + '|' + ev] = [a, b];
  });

  return {
    updated: Utilities.formatDate(new Date(), tz, 'M/d HH:mm'),
    members: members, events: events, assign: assign,
    nightHours: nightHours, needOv: needOv
  };
}

/** 팀원 화면에는 급여·연락처 같은 정보를 보내지 않습니다 */
function stripPrivate_(d) {
  return {
    updated: d.updated,
    members: d.members.map(m => ({ name: m.name, cert: m.cert })),
    events: d.events.map(e => ({ name: e.name, type: e.type, start: e.start, end: e.end, place: e.place })),
    assign: d.assign
  };
}

/* ============================== 저장본(캐시) ============================== */

function cachePut_(key, obj) {
  const c = CacheService.getScriptCache();
  const s = JSON.stringify(obj);
  const n = Math.ceil(s.length / CHUNK) || 1;
  const kv = {};
  for (let i = 0; i < n; i++) kv[key + '_' + i] = s.slice(i * CHUNK, (i + 1) * CHUNK);
  kv[key + '_n'] = String(n);
  try { c.putAll(kv, CACHE_SEC); } catch (e) { /* 너무 크면 저장하지 않음 */ }
}
function cacheGet_(key) {
  const c = CacheService.getScriptCache();
  const n = Number(c.get(key + '_n'));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = c.getAll(keys);
  let s = '';
  for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return null; s += got[keys[i]]; }
  try { return JSON.parse(s); } catch (e) { return null; }
}
function clearCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY + '_n');
}

/** 시트를 직접 고치면 저장본을 지워서 다음 접속 때 새로 읽게 함 (단순 트리거) */
function onEdit(e) {
  clearCache_();
}
/** 시간 트리거: 저장본을 미리 만들어 둠 (첫 접속이 빨라짐) */
function warmCache() {
  refreshData();
}
/** 한 번만 실행: 10분마다 warmCache 트리거 설치 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'warmCache') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('warmCache').timeBased().everyMinutes(10).create();
}
/** 편집기에서 실행해 보는 점검용 */
function testGetData() {
  const d = buildData();
  Logger.log('팀원 %s명 · 행사 %s개 · 배정 %s건 · 야간 %s · 날짜별 인원 %s',
    d.members.length, d.events.length, d.assign.length,
    Object.keys(d.nightHours).length, Object.keys(d.needOv).length);
}

/* ============================== 관리자: 로그인 ============================== */

function adminLogin(code) {
  const c = CacheService.getScriptCache();
  const fails = Number(c.get('adm_fail') || 0);
  if (fails >= 8) return { ok: false, locked: true };
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_CODE');
  if (!real || String(code || '').trim() !== String(real).trim()) {
    c.put('adm_fail', String(fails + 1), 600);
    return { ok: false };
  }
  c.remove('adm_fail');
  const token = Utilities.getUuid();
  c.put('adm_' + token, '1', TOKEN_SEC);
  return { ok: true, token: token, data: buildAdminData_() };
}
function adminLogout(token) {
  CacheService.getScriptCache().remove('adm_' + token);
  return true;
}
function adminGetData(token) {
  auth_(token);
  return buildAdminData_();
}
function auth_(token) {
  const c = CacheService.getScriptCache();
  if (!token || !c.get('adm_' + token)) throw new Error('관리자 접속이 만료됐어요. 코드를 다시 넣어 주세요.');
  c.put('adm_' + token, '1', TOKEN_SEC);   // 쓰는 동안은 연장
}
function buildAdminData_() {
  return buildData();
}
/** 고친 뒤: 저장본 새로 만들고 관리자 데이터 돌려줌 */
function done_(extra) {
  SpreadsheetApp.flush();
  const full = buildData();
  cachePut_(CACHE_KEY, stripPrivate_(full));
  return Object.assign({ ok: true, data: full }, extra || {});
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('다른 사람이 저장 중이에요. 잠시 후 다시 해 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================== 관리자: 배정 ============================== */

/**
 * p = {dates:[yyyy-MM-dd], names:[이름], shift:0|1, event:"넣을 행사"(빼기면 ""), onlyEvent:"뺄 행사", overwrite:bool, nightHours:""}
 * 한 사람은 같은 날 같은 근무(주간/야간)에 행사 하나만 가집니다.
 */
function adminSetAssign(token, p) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const shiftName = SHIFT_NAMES[Number(p.shift) ? 1 : 0];
    const dates = (p.dates || []).map(String).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const memberSet = new Set(memberNames_(ss));
    const names = (p.names || []).map(n => String(n).trim()).filter(Boolean);
    const missing = names.filter(n => !memberSet.has(n));
    const okNames = names.filter(n => memberSet.has(n));
    const ev = String(p.event || '').trim();
    const only = String(p.onlyEvent || '').trim();
    if (ev && eventNames_(ss).indexOf(ev) < 0) throw new Error('행사 탭에 없는 행사예요: ' + ev);

    const L = readList_(ss);
    const idx = new Map();   // 날짜|이름|근무 → 줄 번호(rows 배열)
    L.rows.forEach((r, i) => idx.set(r.date + '|' + r.name + '|' + r.shift, i));
    let changed = 0;

    if (!ev) {   // 빼기
      const drop = new Set();
      dates.forEach(d => okNames.forEach(n => {
        const i = idx.get(d + '|' + n + '|' + shiftName);
        if (i != null && (!only || L.rows[i].event === only)) drop.add(i);
      }));
      if (drop.size) { writeList_(ss, L.rows.filter((r, i) => !drop.has(i))); changed = drop.size; }
      return done_({ changed: changed, missing: missing });
    }

    const conflicts = [];
    dates.forEach(d => okNames.forEach(n => {
      const i = idx.get(d + '|' + n + '|' + shiftName);
      if (i != null && L.rows[i].event !== ev) conflicts.push({ date: d, name: n, current: L.rows[i].event });
    }));
    if (conflicts.length && !p.overwrite) return { ok: false, conflicts: conflicts };

    dates.forEach(d => okNames.forEach(n => {
      const k = d + '|' + n + '|' + shiftName, i = idx.get(k);
      if (i == null) { L.rows.push({ date: d, name: n, shift: shiftName, event: ev }); idx.set(k, L.rows.length - 1); changed++; }
      else if (L.rows[i].event !== ev) { L.rows[i].event = ev; changed++; }
    }));
    if (changed) writeList_(ss, L.rows);

    // (예전 배정 입력 화면) 야간 시간을 같이 적은 경우
    if (shiftName === '야간' && p.nightHours !== undefined && String(p.nightHours).trim() !== '') {
      const h = num_(p.nightHours);
      const tz = ss.getSpreadsheetTimeZone();
      const nsh = ss.getSheetByName(SH.NIGHT);
      const have = new Map();
      rows_(nsh, 3).forEach((r, i) => { const d = day_(r[0], tz); if (d) have.set(d + '|' + str_(r[1]), i + 2); });
      const add = [];
      dates.forEach(d => {
        const row = have.get(d + '|' + ev);
        if (row) nsh.getRange(row, 3).setValue(h == null ? '' : h);
        else add.push([d, ev, h == null ? '' : h, '']);
      });
      appendRows_(nsh, add, 4);
    }
    return done_({ changed: changed, missing: missing });
  });
}

/* ============================== 관리자: 행사 ============================== */

function adminAddEvent(token, f) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.EVENTS);
    const name = String(f.name || '').trim();
    if (!name) throw new Error('행사명을 적어 주세요.');
    if (eventNames_(ss).indexOf(name) >= 0) throw new Error('같은 이름의 행사가 이미 있어요: ' + name);
    checkDates_(f.start, f.end);
    const row = firstEmptyRow_(sh);
    writeEventRow_(sh, row, name, f);
    setNights_(ss, name, f.nights || []);
    return done_();
  });
}

function adminUpdateEvent(token, oldName, f) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.EVENTS);
    const row = findRow_(sh, oldName);
    if (!row) throw new Error('행사를 찾지 못했어요: ' + oldName);
    const name = String(f.name || '').trim();
    if (!name) throw new Error('행사명을 적어 주세요.');
    if (name !== oldName && eventNames_(ss).indexOf(name) >= 0) throw new Error('같은 이름의 행사가 이미 있어요: ' + name);
    checkDates_(f.start, f.end);
    writeEventRow_(sh, row, name, f);
    let renamed = 0;
    if (name !== oldName) {
      const L = readList_(ss);
      L.rows.forEach(r => { if (r.event === oldName) { r.event = name; renamed++; } });
      if (renamed) writeList_(ss, L.rows);
      renameInColumn_(ss.getSheetByName(SH.NIGHT), 2, oldName, name);
      renameInColumn_(ss.getSheetByName(SH.NEED), 2, oldName, name);
    }
    return done_({ renamed: renamed });
  });
}

function adminDeleteEvent(token, name, clear) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.EVENTS);
    const row = findRow_(sh, name);
    if (!row) throw new Error('행사를 찾지 못했어요: ' + name);
    const L = readList_(ss);
    const n = L.rows.filter(r => r.event === name).length;
    if (n && !clear) return { ok: false, assigned: n };
    if (n) writeList_(ss, L.rows.filter(r => r.event !== name));
    deleteRowsWhere_(ss.getSheetByName(SH.NIGHT), 2, name);
    deleteRowsWhere_(ss.getSheetByName(SH.NEED), 2, name);
    sh.deleteRow(row);
    return done_({ cleared: n });
  });
}

/** 날짜별 필요 인원: rows = [{date, day, night}] — 빈 칸은 행사 기본값 사용 */
function adminSetEventNeeds(token, name, rows) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const tz = ss.getSpreadsheetTimeZone();
    const sh = ss.getSheetByName(SH.NEED);
    const memo = {};
    rows_(sh, 5).forEach(r => { if (str_(r[1]) === name) memo[day_(r[0], tz)] = str_(r[4]); });
    deleteRowsWhere_(sh, 2, name);
    const add = [];
    (rows || []).forEach(r => {
      const a = num_(r.day), b = num_(r.night);
      if (a == null && b == null) return;
      add.push([r.date, name, a == null ? '' : a, b == null ? '' : b, memo[r.date] || '']);
    });
    appendRows_(sh, add, 5);
    return done_();
  });
}

/** 야간 날짜: nights = [{date, hours}] — 시간 비우면 일당 */
function adminSetEventNights(token, name, nights) {
  auth_(token);
  return withLock_(() => {
    setNights_(SpreadsheetApp.getActive(), name, nights || []);
    return done_();
  });
}

/** 한 날짜의 야간 시간만 바꾸기 (hours 가 null 이면 그 날 야간 계획 삭제) */
function adminSetNightHours(token, date, event, hours) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const tz = ss.getSpreadsheetTimeZone();
    const sh = ss.getSheetByName(SH.NIGHT);
    const vals = rows_(sh, 3);
    let row = 0;
    vals.forEach((r, i) => { if (!row && day_(r[0], tz) === date && str_(r[1]) === event) row = i + 2; });
    if (hours === null) { if (row) sh.deleteRow(row); }
    else {
      const h = num_(hours);
      if (row) sh.getRange(row, 3).setValue(h == null ? '' : h);
      else appendRows_(sh, [[date, event, h == null ? '' : h, '']], 4);
    }
    return done_();
  });
}

function setNights_(ss, name, nights) {
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(SH.NIGHT);
  const memo = {};
  rows_(sh, 4).forEach(r => { if (str_(r[1]) === name) memo[day_(r[0], tz)] = str_(r[3]); });
  deleteRowsWhere_(sh, 2, name);
  const add = nights.filter(n => n && n.date).map(n => {
    const h = num_(n.hours);
    return [n.date, name, h == null ? '' : h, memo[n.date] || ''];
  });
  appendRows_(sh, add, 4);
}

function writeEventRow_(sh, row, name, f) {
  const n = v => { const x = num_(v); return x == null ? '' : x; };
  sh.getRange(row, 1, 1, 4).setValues([[name, String(f.type || '').trim(), f.start, f.end || f.start]]);
  sh.getRange(row, 7).setValue(String(f.memo || ''));
  sh.getRange(row, 10, 1, 5).setValues([[String(f.place || ''), String(f.manager || ''), String(f.contact || ''), n(f.needDay), n(f.needNight)]]);
}
function checkDates_(a, b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a || ''))) throw new Error('시작일을 확인해 주세요.');
  if (b && !/^\d{4}-\d{2}-\d{2}$/.test(String(b))) throw new Error('종료일을 확인해 주세요.');
  if (b && b < a) throw new Error('종료일이 시작일보다 빨라요.');
}

/* ============================== 관리자: 팀원 ============================== */

function adminAddMember(token, f) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.MEMBERS);
    const name = String(f.name || '').trim();
    if (!name) throw new Error('이름을 적어 주세요.');
    if (memberNames_(ss).indexOf(name) >= 0) throw new Error('같은 이름이 이미 있어요: ' + name + ' (동명이인이면 이름 뒤에 숫자를 붙여 주세요)');
    const cert = ['있음', '없음'].indexOf(String(f.cert || '')) >= 0 ? f.cert : '';
    const pick = (v, d) => { const x = num_(v); return x == null ? d : x; };
    const row = firstEmptyRow_(sh);
    sh.getRange(row, 1, 1, 6).setValues([[name, cert, '', pick(f.rateOut, DEFAULT_RATE.out), pick(f.rateExh, DEFAULT_RATE.exh), pick(f.rateHour, DEFAULT_RATE.hour)]]);
    return done_();
  });
}

function adminSetCert(token, name, v) {
  auth_(token);
  return withLock_(() => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.MEMBERS);
    const row = findRow_(sh, name);
    if (!row) throw new Error('팀원을 찾지 못했어요: ' + name);
    sh.getRange(row, 2).setValue(['있음', '없음'].indexOf(v) >= 0 ? v : '');
    return done_();
  });
}

/** 호출 순서: (이름, 외부, 전시, 시급) */
function adminSetRates(token, name, out, exh, hour) {
  auth_(token);
  return withLock_(() => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.MEMBERS);
    const row = findRow_(sh, name);
    if (!row) throw new Error('팀원을 찾지 못했어요: ' + name);
    const n = v => { const x = num_(v); return x == null ? '' : x; };
    sh.getRange(row, 4, 1, 3).setValues([[n(out), n(exh), n(hour)]]);
    return done_();
  });
}

function adminRenameMember(token, oldName, newName) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.MEMBERS);
    newName = String(newName || '').trim();
    if (!newName) throw new Error('새 이름을 적어 주세요.');
    const row = findRow_(sh, oldName);
    if (!row) throw new Error('팀원을 찾지 못했어요: ' + oldName);
    if (memberNames_(ss).indexOf(newName) >= 0) throw new Error('같은 이름이 이미 있어요: ' + newName);
    sh.getRange(row, 1).setValue(newName);
    const L = readList_(ss);
    let n = 0;
    L.rows.forEach(r => { if (r.name === oldName) { r.name = newName; n++; } });
    if (n) writeList_(ss, L.rows);
    return done_({ renamed: n });
  });
}

function adminDeleteMember(token, name, clear) {
  auth_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SH.MEMBERS);
    const row = findRow_(sh, name);
    if (!row) throw new Error('팀원을 찾지 못했어요: ' + name);
    const L = readList_(ss);
    const n = L.rows.filter(r => r.name === name).length;
    if (n && !clear) return { ok: false, assigned: n };
    if (n) writeList_(ss, L.rows.filter(r => r.name !== name));
    sh.deleteRow(row);
    return done_({ cleared: n });
  });
}

/* ============================== 배정목록 읽기·쓰기 ============================== */

function listSheet_(ss) {
  const sh = ss.getSheetByName(SH.LIST);
  if (!sh) throw new Error('배정목록 탭이 없어요.');
  return sh;
}
/** 빈 줄은 건너뛰고 {date,name,shift,event} 목록으로 읽음 */
function readList_(ss) {
  const sh = listSheet_(ss);
  const tz = ss.getSpreadsheetTimeZone();
  const rows = [];
  rows_(sh, 4).forEach(r => {
    const date = day_(r[0], tz), name = str_(r[1]), event = str_(r[3]);
    let shift = str_(r[2]);
    if (!date || !name || !event) return;
    if (shift !== '야간') shift = '주간';
    rows.push({ date: date, name: name, shift: shift, event: event });
  });
  return { sh: sh, rows: rows };
}
/** 날짜 → 팀원 순서 → 주간/야간 순으로 정렬해서 통째로 다시 씀 (중복 제거) */
function writeList_(ss, rows) {
  const sh = listSheet_(ss);
  const order = new Map(memberNames_(ss).map((n, i) => [n, i]));
  const seen = new Set();
  const clean = rows.filter(r => {
    const k = r.date + '|' + r.name + '|' + r.shift;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  clean.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 :
    ((order.has(a.name) ? order.get(a.name) : 1e6) - (order.has(b.name) ? order.get(b.name) : 1e6)) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.shift === b.shift ? 0 : a.shift === '주간' ? -1 : 1));
  const need = clean.length + 1;
  if (sh.getMaxRows() < need + 50) sh.insertRowsAfter(sh.getMaxRows(), need + 500 - sh.getMaxRows());
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (clean.length) sh.getRange(2, 1, clean.length, 4).setValues(clean.map(r => [r.date, r.name, r.shift, r.event]));
}

/* ============================== 공용 도우미 ============================== */

function rows_(sh, cols) {
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues();
}
function str_(v) { return v == null ? '' : String(v).trim(); }
function num_(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/[,\s원]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** 날짜 칸 → 'yyyy-MM-dd' (글자로 적힌 날짜도 받아 줌) */
function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}
function memberNames_(ss) {
  return rows_(ss.getSheetByName(SH.MEMBERS), 1).map(r => str_(r[0])).filter(Boolean);
}
function eventNames_(ss) {
  return rows_(ss.getSheetByName(SH.EVENTS), 1).map(r => str_(r[0])).filter(Boolean);
}
/** A열 값이 name 인 줄 번호 (없으면 0) */
function findRow_(sh, name) {
  const v = rows_(sh, 1);
  for (let i = 0; i < v.length; i++) if (str_(v[i][0]) === name) return i + 2;
  return 0;
}
/** A열 기준 첫 빈 줄 (수식으로 채워지는 열이 있어도 A열만 봄) */
function firstEmptyRow_(sh) {
  const v = rows_(sh, 1);
  for (let i = 0; i < v.length; i++) if (str_(v[i][0]) === '') return i + 2;
  const row = v.length + 2;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  return row;
}
function appendRows_(sh, rows, cols) {
  if (!rows.length) return;
  const v = rows_(sh, 1);
  let last = 1;
  for (let i = v.length - 1; i >= 0; i--) if (str_(v[i][0]) !== '') { last = i + 2; break; }
  if (sh.getMaxRows() < last + rows.length) sh.insertRowsAfter(sh.getMaxRows(), last + rows.length - sh.getMaxRows() + 20);
  sh.getRange(last + 1, 1, rows.length, cols).setValues(rows);
}
/** col(1부터) 값이 name 인 줄을 모두 지움 (아래부터) */
function deleteRowsWhere_(sh, col, name) {
  if (!sh) return 0;
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const v = sh.getRange(2, col, last - 1, 1).getValues();
  let n = 0;
  for (let i = v.length - 1; i >= 0; i--) if (str_(v[i][0]) === name) { sh.deleteRow(i + 2); n++; }
  return n;
}
function renameInColumn_(sh, col, oldName, newName) {
  if (!sh) return 0;
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const rg = sh.getRange(2, col, last - 1, 1), v = rg.getValues();
  let n = 0;
  v.forEach(r => { if (str_(r[0]) === oldName) { r[0] = newName; n++; } });
  if (n) rg.setValues(v);
  return n;
}
