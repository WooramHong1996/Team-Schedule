/**
 * 팀 스케줄 — 구글 시트 "읽기 전용 사본" 코드
 *
 * 이제 원본 데이터는 수퍼베이스(웹)에 있습니다.
 * 이 스크립트는 15분마다 웹 데이터를 받아 시트의 팀원 / 행사 / 배정목록 / 야간시간 / 필요인원 탭을 덮어씁니다.
 * 그래서 캘린더 · 인원점검 · 배정표 탭은 보고서·백업으로 계속 쓸 수 있지만,
 * 시트에서 고친 내용은 다음 동기화 때 사라집니다. 수정은 웹에서 해 주세요.
 *
 * 처음 한 번:
 *   1) 아래 EXPORT_KEY 에 받은 키를 넣거나, 프로젝트 설정 → 스크립트 속성에 SHEET_EXPORT_KEY 로 넣기
 *   2) 편집기에서 setup 함수 실행 (권한 허용) → 바로 한 번 동기화 + 15분 자동 동기화 + 보호 설정
 */

const WEB_URL = 'https://wooramhong1996.github.io/Team-Schedule/';
const SUPABASE_URL = 'https://wnqssbtqbaisgtmpitve.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0R29XxwnzFC93FrTeROjNA_EAhYGkbs';
const EXPORT_KEY = '';   // ← 비워 두면 스크립트 속성 SHEET_EXPORT_KEY 를 씀 (공개 저장소에는 키를 올리지 마세요)

const SYNC_NOTE = '웹에서 15분마다 자동으로 채워져요. 여기서 고쳐도 다음 동기화 때 덮어써지니, 수정은 웹에서 해 주세요.';

/* 예전 웹 주소로 들어오면 새 웹으로 안내 */
function doGet() {
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<div style="font-family:sans-serif;padding:32px 20px;text-align:center;line-height:1.7">' +
    '<h2>일정 페이지 주소가 바뀌었어요</h2><p>이제 카카오로 로그인해서 내 일정을 봐요.</p>' +
    '<p><a href="' + WEB_URL + '" target="_top" style="display:inline-block;padding:14px 22px;background:#FEE500;color:#191600;border-radius:12px;font-weight:700;text-decoration:none">새 일정 페이지 열기</a></p>' +
    '<p style="color:#888;font-size:14px">' + WEB_URL + '</p></div>'
  ).setTitle('팀 행사 일정 (주소 이동)').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* 처음 한 번 실행 */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncFromWeb').timeBased().everyMinutes(15).create();
  protectSheets_();
  syncFromWeb();
}

function exportKey_() {
  const k = EXPORT_KEY || PropertiesService.getScriptProperties().getProperty('SHEET_EXPORT_KEY');
  if (!k) throw new Error('EXPORT_KEY(또는 스크립트 속성 SHEET_EXPORT_KEY)가 비어 있어요.');
  return k;
}

/* 웹(수퍼베이스) → 시트 */
function syncFromWeb() {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/sheet_export', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY },
    payload: JSON.stringify({ p_key: exportKey_() })
  });
  if (res.getResponseCode() !== 200) throw new Error('웹 데이터를 받지 못했어요 (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  const d = JSON.parse(res.getContentText());
  const ss = SpreadsheetApp.getActive();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // 팀원: A 이름 | B 이수증 | C 비고 | D 일당(외부) | E 일당(전시) | F 시급 | G 상태
    const m = ss.getSheetByName('팀원');
    m.getRange(1, 7).setValue('상태');
    writeBlock_(m, 1, d.members.map(x => [x.name, x.cert || '', x.note || '', nz_(x.rate_out), nz_(x.rate_exh), nz_(x.rate_hour), x.active ? '' : '퇴사']), 7);

    // 행사: E·F·I 열은 수식이라 건드리지 않음
    const e = ss.getSheetByName('행사');
    writeBlock_(e, 1, d.events.map(x => [x.name, x.type || '', x.start, x.end]), 4);
    writeBlock_(e, 7, d.events.map(x => [x.memo || '', '']), 2);
    writeBlock_(e, 10, d.events.map(x => [x.place || '', x.manager || '', x.contact || '', nz_(x.need_day), nz_(x.need_night)]), 5);

    writeBlock_(ss.getSheetByName('배정목록'), 1, d.assignments, 4);
    writeBlock_(ss.getSheetByName('야간시간'), 1, d.nights.map(x => [x[0], x[1], nz_(x[2]), x[3] || '']), 4);
    writeBlock_(ss.getSheetByName('필요인원'), 1, d.needs.map(x => [x[0], x[1], nz_(x[2]), nz_(x[3]), x[4] || '']), 5);

    const cal = ss.getSheetByName('캘린더');
    if (cal) cal.getRange('D1').setValue('← 웹 자동 동기화: ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'M/d HH:mm') + ' (수정은 웹에서)');
  } finally {
    lock.releaseLock();
  }
}

function nz_(v) { return v === null || v === undefined ? '' : v; }

/* 2행부터 rows를 쓰고, 그 아래 남은 예전 값은 지움 */
function writeBlock_(sh, col, rows, width) {
  const old = Math.max(sh.getLastRow() - 1, 0);
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows() + 50);
  if (old > rows.length) sh.getRange(2 + rows.length, col, old - rows.length, width).clearContent();
  if (rows.length) sh.getRange(2, col, rows.length, width).setValues(rows);
}

/* 손으로 고치면 경고가 뜨게 (막지는 않음) */
function protectSheets_() {
  const ss = SpreadsheetApp.getActive();
  ['팀원', '행사', '배정목록', '야간시간', '필요인원'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (!sh) return;
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
    sh.protect().setDescription(SYNC_NOTE).setWarningOnly(true);
  });
}
