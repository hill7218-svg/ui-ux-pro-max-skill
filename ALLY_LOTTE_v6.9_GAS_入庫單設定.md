# ALLY LOTTE v6.9 — GAS 後端 + 入庫單匯出設定

> 這份取代舊的 v6.8 GAS 程式碼。**必須更新**，否則「入庫單」分頁無法自動建立。
> 新增：① 入庫單分頁自動建表頭 ② 行政在 Sheet 上的「📤 入庫單」匯出選單按鈕。

---

## 🔄 資料流

```
APP 關單
  ├─ 移倉記錄分頁  ← 原始流水（誰、何時、刷了哪板、幾片、狀態）
  └─ 入庫單分頁    ← WMS 格式（依貨號+倉別加總成最小單位）
                      行政在此核對 → 點選單匯出 CSV → 匯入 WMS
```

**數量換算已在 APP 內完成**：刷 20 箱 × 入數 25 = 自動存成 500 片（最小單位）。
入庫單分頁的「數量」欄就是同貨號跨棧板加總的最小單位數，行政不必再換算。

---

## ① 試算表分頁（名稱需一致）

| 分頁 | 用途 | 誰寫 |
|------|------|------|
| `移倉記錄` | 操作流水 | APP 寫 |
| `司機清單` | 車號↔司機 | 你維護，APP 讀 |
| `商品清單` | 主檔/入數 | 你維護，APP 讀 |
| `儲位清單` | 可用儲位 | 你維護，APP 讀 |
| `入庫單` | **WMS 匯入格式** | APP 寫（不存在會自動建立 + 表頭）|

`入庫單` 分頁不用手動建，APP 第一次上傳時會自動建立並寫入 22 欄表頭。

### 司機清單欄位
| 車號 | 司機姓名 | 電話 |
|------|---------|------|
| BBB-2262 | 王小明 | 090-1234567 |

### 商品清單欄位（9 欄，多層條碼）
| 品號 | 品名 | 外箱條碼 | 箱入數 | 中盒條碼 | 中盒入數 | 最小單位條碼 | 標準棧板量 | 溫層 |
|------|------|---------|-------|---------|---------|------------|----------|------|

### 儲位清單欄位
| 走道 | 儲位 | 狀態 |
|------|------|------|
| BA | BA012 | AVAILABLE |

---

## ② 入庫單 22 欄格式（APP 自動產生）

| # | 欄位 | 來源 |
|---|------|------|
| 1 | 廠商統編 | 固定 `27712880` |
| 2 | 廠商聯絡人 | 固定 `林家霏` |
| 3 | 聯絡人電話 | 固定 `02-25788183` |
| 4 | 日期 | 關單當天 |
| 5 | 時段 | 固定 `9` |
| 6 | 採購單號 | **留空，行政補** |
| 7 | 來源單號 | 車號 + 趟次 |
| 8 | 主檔備註 | 空 |
| 9 | 商品貨號 | 掃描帶出 |
| 10 | 商品名稱 | 掃描帶出 |
| 11 | **數量** | **同貨號加總（最小單位）** |
| 12-14 | 製造/有效/批號 | 空（行政補）|
| 15 | 商品條碼 | 掃描帶出 |
| 16 | 群品 | 固定 `良品` |
| 17 | 明細備註 | 空 |
| 18 | 入倉單號 | 空 |
| 19 | 虛擬倉 | S1 選的倉別（預設 A47）|
| 20-22 | 庫存等級/版本/原因 | 空 |

> 想改固定值（統編、聯絡人、預設倉別、時段），在 HTML 的 `CONFIG.wms` 區塊改即可。

---

## ③ 更新 Apps Script 程式碼

試算表 → **擴充功能 → Apps Script** → 把下面整段覆蓋貼上 → 存檔 → **重新部署**
（部署 → 管理部署作業 → 編輯 ✏️ → 版本選「新增版本」→ 部署，URL 不變）

```javascript
// ===== ALLY LOTTE v6.9 後端 Web App + 入庫單匯出 =====
var WMS_TAB = '入庫單';
var WMS_HEADER = ['廠商統編','廠商聯絡人','聯絡人電話','日期','時段','採購單號','來源單號',
  '主檔備註','商品貨號','商品名稱','數量','製造日期','有效日期','批號','商品條碼',
  '群品','明細備註','入倉單號','虛擬倉','庫存等級屬性','版本號','原因代碼'];

function doGet(e) {
  try {
    var tab = (e && e.parameter && e.parameter.tab) ? e.parameter.tab.toString() : '';
    if (!tab) return _json({ ok:false, error:'no_tab_param', values:[] });
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
    if (!sheet) return _json({ ok:false, error:'no_tab', values:[] });
    return _json({ ok:true, values: sheet.getDataRange().getValues() });
  } catch (err) {
    return _json({ ok:false, error:String(err), values:[] });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 照片上傳 → Google Drive
    if (body.action === 'uploadPhoto') return _json(_uploadPhoto(body));

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(body.tab);
    if (!sheet) sheet = ss.insertSheet(body.tab);   // 分頁不存在 → 自動建立

    if (body.action === 'append' && Array.isArray(body.rows)) {
      // 入庫單分頁：若空先寫 22 欄表頭並凍結
      if (body.tab === WMS_TAB && sheet.getLastRow() === 0) {
        sheet.appendRow(WMS_HEADER);
        sheet.setFrozenRows(1);
      }
      body.rows.forEach(function(row){ sheet.appendRow(row); });
      return _json({ ok:true, appended: body.rows.length });
    }
    return _json({ ok:false, error:'bad_action' });
  } catch (err) {
    return _json({ ok:false, error:String(err) });
  }
}

function _uploadPhoto(body) {
  try {
    var parts = body.imageData.split(',');
    var contentType = parts[0].match(/:(.*?);/)[1];
    var bytes = Utilities.base64Decode(parts[1]);
    var blob = Utilities.newBlob(bytes, contentType, body.filename || 'photo.jpg');
    var folder;
    if (body.folderId) folder = DriveApp.getFolderById(body.folderId);
    else {
      var it = DriveApp.getFoldersByName('ALLY_LOTTE_WH');
      folder = it.hasNext() ? it.next() : DriveApp.createFolder('ALLY_LOTTE_WH');
    }
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok:true, url:file.getUrl(), id:file.getId() };
  } catch (err) {
    return { ok:false, error:String(err) };
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 行政匯出按鈕（自訂選單，開啟試算表時出現）=====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📤 入庫單')
    .addItem('✅ 核對無誤 → 匯出 CSV', 'exportWmsCsv')
    .addItem('🗑️ 清空入庫單（保留表頭）', 'clearWms')
    .addToUi();
}

function exportWmsCsv() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WMS_TAB);
  if (!sheet || sheet.getLastRow() < 2) { ui.alert('入庫單沒有資料可匯出'); return; }

  var values = sheet.getDataRange().getValues();
  var csv = values.map(function(row){
    return row.map(function(cell){
      var s = (cell == null ? '' : String(cell));
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',');
  }).join('\r\n');

  var fileName = '入庫單_' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmm') + '.csv';
  var it = DriveApp.getFoldersByName('ALLY_LOTTE_WH');
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder('ALLY_LOTTE_WH');
  var file = folder.createFile(fileName, '﻿' + csv, 'text/csv');  // BOM 防 Excel 亂碼

  ui.alert('✅ 入庫單已匯出\n\n檔名：' + fileName +
    '\n位置：Google Drive / ALLY_LOTTE_WH\n\n下載連結：\n' + file.getUrl());
}

function clearWms() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WMS_TAB);
  if (!sheet) { ui.alert('找不到入庫單分頁'); return; }
  if (ui.alert('確定清空入庫單？（表頭保留）', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  ui.alert('已清空，可開始下一批');
}
```

---

## ④ 行政操作流程

1. 鶯歌倉刷讀 → APP 關單 → `入庫單` 分頁自動進資料
2. 行政打開試算表，上方多一個 **「📤 入庫單」** 選單
3. 核對數量無誤（必要時補採購單號/批號）
4. 點 **「✅ 核對無誤 → 匯出 CSV」** → 跳出下載連結
5. 下載 CSV → 匯入 WMS
6. 匯完點 **「🗑️ 清空入庫單」** 準備下一批

> 第一次點選單會要求授權（存取試算表 + Drive），點允許即可。

---

## ⑤ 驗收清單

```
[ ] 貼上新 GAS 程式碼並「新增版本」重新部署
[ ] 關單後「入庫單」分頁自動出現 + 22 欄表頭
[ ] 數量欄 = 刷的箱數 × 入數（最小單位加總）
[ ] 同貨號跨棧板合併成一列
[ ] 不同倉別分開列
[ ] 重新整理試算表 → 出現「📤 入庫單」選單
[ ] 點匯出 → Drive/ALLY_LOTTE_WH 出現 CSV + 下載連結
[ ] CSV 用 Excel 開不亂碼（含 BOM）
[ ] APP S4 頁「📋 下載入庫單 CSV」備援按鈕可離線下載
```
