/* WMS 入庫單全流程測試 — jsdom 載入真實 HTML，驅動真實函式 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'ALLY_LOTTE_WAREHOUSE_v6.9.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra != null ? '→ ' + JSON.stringify(extra) : ''); }
}
function eq(name, got, want) {
  ok(name + ' (=' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want), got);
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    // 攔截網路 / 不需要的 API
    window.fetch = () => Promise.reject(new Error('no-net-in-test'));
    window.alert = () => {};
    window.confirm = () => true;
    window.scrollTo = () => {};
    // Blob/URL stub（jsdom 對 createObjectURL 未實作）
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
  }
});
const w = dom.window;

// 等待同步腳本執行完
setTimeout(runTests, 300);

function runTests() {
  try {
    // 強制 demo 模式，避免任何網路（const Backend 須用 eval 存取全域詞法綁定）
    w.eval("Backend.mode='demo'; Backend.sheetsReady=false;");

    console.log('\n=== 環境檢查 ===');
    ok('buildWmsRows 存在', typeof w.buildWmsRows === 'function');
    ok('wmsRowsToCsv 存在', typeof w.wmsRowsToCsv === 'function');
    ok('doLookup 存在', typeof w.doLookup === 'function');
    ok('addItem 存在', typeof w.addItem === 'function');
    ok('confirmAndSealPallet 存在', typeof w.confirmAndSealPallet === 'function');
    ok('ST 存在', !!w.ST);

    // ───────────────────────────────────────────────
    console.log('\n=== 測試 1：buildWmsRows 聚合 + 格式（直接建構 ST）===');
    const ST = w.ST;
    ST.truck = 'BBB-2262';
    ST.trip = 1;
    ST.driverName = '王小明';
    ST.pallets = {
      'PA1': { id:'PA1', status:'locked', loc:'BA012', items:[
        { item_code:'BJ9277', name:'樂天卡士逹派(6顆裝)', ean:'64903333064368', qty:500, warehouse:'A47' },
        { item_code:'BJ9321', name:'LOTTE 原味巧克力派分享包', ean:'74903333264239', qty:30, warehouse:'A47' }
      ]},
      'PA2': { id:'PA2', status:'locked', loc:'BA013', items:[
        { item_code:'BJ9277', name:'樂天卡士逹派(6顆裝)', ean:'64903333064368', qty:250, warehouse:'A47' }
      ]},
      'PA3': { id:'PA3', status:'locked', loc:'BA014', items:[
        { item_code:'BJ9321', name:'LOTTE 原味巧克力派分享包', ean:'74903333264239', qty:20, warehouse:'B99' }
      ]},
      'PA4_open': { id:'PA4_open', status:'open', loc:'', items:[
        { item_code:'BJ9999', name:'未封板不應計入', ean:'x', qty:9999, warehouse:'A47' }
      ]}
    };

    const rows = w.buildWmsRows();
    // 期望 3 列：BJ9277@A47=750, BJ9321@A47=30, BJ9321@B99=20
    eq('產生列數=3（未封板排除）', rows.length, 3);

    // 索引欄位：8=貨號 10=數量 18=虛擬倉 15=群品 0=統編
    const byKey = {};
    rows.forEach(r => byKey[r[8] + '@' + r[18]] = r);

    ok('BJ9277@A47 存在', !!byKey['BJ9277@A47']);
    eq('BJ9277@A47 數量加總 500+250', byKey['BJ9277@A47'] && byKey['BJ9277@A47'][10], 750);
    eq('BJ9321@A47 數量', byKey['BJ9321@A47'] && byKey['BJ9321@A47'][10], 30);
    eq('BJ9321@B99 數量（不同倉別分開）', byKey['BJ9321@B99'] && byKey['BJ9321@B99'][10], 20);

    const r0 = byKey['BJ9277@A47'];
    eq('固定欄-廠商統編', r0[0], '27712880');
    eq('固定欄-聯絡人', r0[1], '林家霏');
    eq('固定欄-電話', r0[2], '02-25788183');
    eq('固定欄-時段', r0[4], '9');
    eq('來源單號=車號+趟次', r0[6], 'BBB-2262 趟1');
    eq('商品名稱', r0[9], '樂天卡士逹派(6顆裝)');
    eq('商品條碼', r0[14], '64903333064368');
    eq('群品=良品', r0[15], '良品');
    eq('虛擬倉', r0[18], 'A47');
    ok('採購單號留空（行政補）', r0[5] === '');
    const today = new Date();
    const wantDate = today.getFullYear() + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + String(today.getDate()).padStart(2,'0');
    eq('日期=今天', r0[3], wantDate);
    eq('欄位數=22', r0.length, 22);

    // ───────────────────────────────────────────────
    console.log('\n=== 測試 2：CSV 格式（表頭 + BOM 相容 + 逗號跳脫）===');
    const csv = w.wmsRowsToCsv(rows);
    const lines = csv.split('\r\n');
    eq('CSV 行數 = 1表頭 + 3資料', lines.length, 4);
    ok('表頭含「商品貨號」', lines[0].includes('商品貨號'));
    ok('表頭含「數量」', lines[0].includes('數量'));
    ok('表頭含「虛擬倉」', lines[0].includes('虛擬倉'));
    eq('表頭欄位數=22', lines[0].split(',').length, 22);
    // 名稱含逗號的跳脫測試
    const csvEsc = w.wmsRowsToCsv([['a,b','c"d','e\nf']]);
    ok('逗號欄位被引號包住', csvEsc.includes('"a,b"'));
    ok('雙引號被跳脫為兩個', csvEsc.includes('"c""d"'));

    // ───────────────────────────────────────────────
    console.log('\n=== 測試 3：整合 — 掃描換算（箱×入數 → 最小單位）===');
    // 重置棧板，走真實掃描流程
    ST.pallets = {};
    ST.curPallet = null;
    ST.curSKU = null;
    ST.closed = false;
    ST.warehouse = 'A47';
    ST.truck = 'BBB-2262';
    ST.trip = 1;

    function scan(code, qty) {
      w.document.getElementById('ean-in').value = code;
      w.doLookup();
      w.document.getElementById('qty-v').value = String(qty);
      w.addItem();
    }

    // BJ9277 外箱條碼 uq=25，刷 20 箱 → 500 片
    scan('64903333064368', 20);
    let cur = ST.curPallet;
    let item = ST.pallets[cur].items.find(x => x.item_code === 'BJ9277');
    ok('掃描後棧板有 BJ9277', !!item, item);
    eq('20箱 × 入數25 = 500 片', item && item.qty, 500);
    eq('記錄倉別 A47', item && item.warehouse, 'A47');

    // BJ9277 最小單位條碼 uq=1，刷 12 → 加 12 片，總 512
    scan('4903333064366', 12);
    item = ST.pallets[cur].items.find(x => x.item_code === 'BJ9277');
    eq('混合最小單位後加總 500+12 = 512 片', item && item.qty, 512);

    // ───────────────────────────────────────────────
    console.log('\n=== 測試 4：整合 — 封板 → buildWmsRows 串接 ===');
    // 封板目前棧板
    w.openSeal(cur);
    w.pickSt('ok', 0);
    w.confirmAndSealPallet();
    eq('棧板已鎖定', ST.pallets[cur].status, 'locked');

    const rows4 = w.buildWmsRows();
    const r4 = rows4.find(r => r[8] === 'BJ9277');
    ok('封板後入庫單含 BJ9277', !!r4, rows4);
    eq('入庫單數量 = 512（最小單位）', r4 && r4[10], 512);

    // ───────────────────────────────────────────────
    console.log('\n=== 測試 5：空資料保護 ===');
    ST.pallets = {};
    eq('無棧板時 buildWmsRows = []', w.buildWmsRows().length, 0);

  } catch (e) {
    fail++;
    console.log('  ❌ 測試執行例外：', e.stack || e.message);
  }

  console.log('\n========================================');
  console.log(`結果：${pass} 通過 / ${fail} 失敗`);
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}
