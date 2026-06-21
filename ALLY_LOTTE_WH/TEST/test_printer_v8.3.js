/* ALLY LOTTE QR Printer v8.3 — Simple validation without jsdom */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'ALLY_LOTTE_QR_PRINTER_v8.3.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra != null ? '→ ' + JSON.stringify(extra) : ''); }
}

console.log('\n=== Typo Fix Validation ===');

// Check that FIELDS array has correct labels
ok('destlbl has "「上架儲位」標題"', html.includes('{key:\'destlbl\', label:\'「上架儲位」標題\''));
ok('dest has "上架儲位"', html.includes('{key:\'dest\',    label:\'上架儲位\''));
ok('destbar has "上架儲位條碼"', html.includes('{key:\'destbar\', label:\'上架儲位條碼\''));
ok('HTML template has "上架儲位"', html.includes('<div class="fk sk-destlbl" data-fk="destlbl">上架儲位</div>'));

// Verify NO typo instances remain
ok('No typo "傻位" in labels', !html.includes('label:\'「上架傻位'));
ok('No typo "儍位" in labels', !html.includes('label:\'上架儍位\''));

console.log('\n=== BI Code Format Validation ===');

// Count BI codes
const bi012Matches = (html.match(/"destLoc":"BI012"/g) || []).length;
const bi013Matches = (html.match(/"destLoc":"BI013"/g) || []).length;

console.log(`  ℹ️ BI012 count: ${bi012Matches}`);
console.log(`  ℹ️ BI013 count: ${bi013Matches}`);

ok('BI012 codes exist', bi012Matches > 0, `Found: ${bi012Matches}`);
ok('BI013 codes exist', bi013Matches > 0, `Found: ${bi013Matches}`);

// Verify NO hyphenated BI codes remain
const biHyphenated = (html.match(/"destLoc":"BI\d{3}-\d+"/g) || []);
ok('No hyphenated BI codes (should be 0)', biHyphenated.length === 0, `Found: ${biHyphenated.join(',')}`);

console.log('\n=== Total Count Validation ===');
const totalBi = bi012Matches + bi013Matches;
console.log(`  ℹ️ Total BI-assigned pallets: ${totalBi}`);
ok('Total BI codes = 133 (99 BI012 + 34 BI013)', totalBi === 133, `Got: ${totalBi}`);

console.log('\n=== Layout Structure Validation ===');

// Check key HTML elements exist
ok('stickerContainer element exists', html.includes('id="stickerContainer"'));
ok('generate() function exists', html.includes('function generate('));
ok('defaultLayout() function exists', html.includes('function defaultLayout('));
ok('PALLET_DATA array exists', html.includes('const PALLET_DATA = ['));

console.log('\n========================================');
console.log(`結果：${pass} 通過 / ${fail} 失敗`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
