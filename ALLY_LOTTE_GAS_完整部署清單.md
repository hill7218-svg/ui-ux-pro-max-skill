# ALLY × LOTTE 移倉系統 — GAS 後端完整部署清單 (v7.1)

> 一份到底：把這份做完，APP 的讀清單 / 寫入庫單 / 上傳照片 / 寄 Excel 信 / 操作日誌全部會通。
> 發送帳號、部署帳號：**hill7218@gmail.com**
> 試算表 ID：**1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4**

---

## ✅ 總覽：待辦 5 大項

| # | 項目 | 做什麼 | 約時間 |
|---|------|--------|--------|
| **A** | 建立/確認 Sheet 分頁 | 7 個分頁 + 欄位表頭 | 10 分 |
| **B** | 貼上 Code.gs 後端程式 | 一份整合腳本（讀/寫/照片/寄信） | 5 分 |
| **C** | 授權 | Gmail + Drive + Sheets 權限 | 3 分 |
| **D** | 部署為 Web App | 取得 webAppUrl，填回兩個 HTML | 5 分 |
| **E** | 測試驗收 | 5 條 smoke test | 10 分 |

---

## 【A】建立 / 確認 Sheet 分頁

開啟試算表 `ASC Lotte wh`（ID 同上），確認以下 **7 個分頁**存在，分頁名與表頭**完全一致**（APP 靠分頁名抓資料）。

### A-1　司機清單（你維護）
| A 車號 | B 司機姓名 | C 電話 |
|--------|-----------|--------|
| BBB-2262 | 王大明 | 0912... |

### A-2　商品清單（你維護）
| A 品號 | B 品名 | C 箱條碼 | D 箱入數 | E 包條碼 | F 包入數 | G 最小單位 | H 預期箱數 | I 溫層 |
|--------|--------|---------|---------|---------|---------|-----------|-----------|--------|
| BJ9321 | LOTTE 巧克力派(9) | 74903... | 10 | 84903... | 5 | 片 | 32 | 常溫 |

### A-3　儲位清單（你維護）★H1 預配關鍵
| A 走道 | B 儲位 | C 狀態 |
|--------|--------|--------|
| BA | BA012 | AVAILABLE |
| BA | BA013 | AVAILABLE |

- **只有狀態 = `AVAILABLE` 會被配發**；順序＝列印器與 APP 預配的板序（第1板→該走道第1個 AVAILABLE）。
- 列印器與 APP 都讀這張 → 「貼紙建議儲位 = 入庫單最終儲位」由此成立。

### A-4　發送人員清單（你維護）★Email 收件人
| A 姓名 | B 信箱 |
|--------|--------|
| hill | hill.tsai@allyls.com.tw |
| Emma | emma.wu@allyls.com.tw |
| Evonne | evonne.lee@allyls.com.tw |
| 嘉純 | jiachun.wu@allyls.com.tw |
| Frank | frank.zeng@allyls.com.tw |

- APP 讀 **B 欄**、跳表頭、取含 `@` 者。增減收件人直接改這張，APP 無須改。

### A-5　入庫單（APP 寫）★需有「儲位」欄
表頭 **23 欄**，順序固定：
```
廠商統編 廠商聯絡人 聯絡人電話 日期 時段 採購單號 來源單號 主檔備註
商品貨號 商品名稱 數量 製造日期 有效日期 批號 商品條碼
群品 明細備註 入倉單號 虛擬倉 庫存等級屬性 版本號 原因代碼 儲位
```
- ⚠️ 第 23 欄「**儲位**」是 v7.0 新增，**既有分頁要手動補這欄**（S8 收貨軟驗證靠它）。

### A-6　收貨狀態（APP 寫）★S8 + 去重
表頭 **9 欄**：
```
時間戳 車號 來源單號 收貨人 建議儲位 實際儲位 是否覆寫 覆寫原因 狀態
```
- M2 跨裝置去重會讀「來源單號(C欄)」「實際儲位(F欄)」。

### A-7　操作記錄（APP 寫）★H4 新增分頁
表頭 **7 欄**：
```
時間戳 車號 趟次 動作 明細 棧板數 已掃箱數
```
- 封板 / 關單時批次寫入。下方 Code.gs 的 append 會在分頁不存在時自動建立，但建議先手動建好並填表頭。

### A-8　移倉記錄（APP 寫）
表頭 **12 欄**：
```
時間戳 車號 司機 棧板ID 儲位 品項數 總片數 狀態 異常類型 說明 照片數 照片路徑
```

---

## 【B】貼上 Code.gs 後端程式

試算表 → 擴充功能 → Apps Script → 把 `Code.gs` 全部內容換成下面這份（已整合全部 action）：

```javascript
// ═══════════════════════════════════════════════════════════
//  ALLY × LOTTE 移倉系統 GAS 後端 v7.1
//  支援：read(GET) / append / uploadPhoto / sendMail(xlsx)
// ═══════════════════════════════════════════════════════════
var SHEET_ID = '1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4';

// ── 讀分頁（APP: Backend.readTab，?action=read&tab=分頁名）──
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'read') {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sh = ss.getSheetByName(p.tab);
      var values = sh ? sh.getDataRange().getValues() : [];
      return _json({ ok: true, values: values });
    }
    return _json({ ok: false, error: 'unknown_get_action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── 寫入 / 照片 / 寄信（APP: append / uploadPhoto / sendMail）──
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return _json({ ok: false, error: 'bad_json' }); }

  try {
    // 1) 追加列（入庫單 / 移倉記錄 / 收貨狀態 / 操作記錄）
    if (req.action === 'append') {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sh = ss.getSheetByName(req.tab);
      if (!sh) sh = ss.insertSheet(req.tab);          // 分頁不存在自動建立
      var rows = req.rows || [];
      if (rows.length) {
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
      return _json({ ok: true, appended: rows.length });
    }

    // 2) 照片上傳到 Google Drive
    if (req.action === 'uploadPhoto') {
      var folder = req.folderId ? DriveApp.getFolderById(req.folderId)
                                : _ensureFolder('ALLY_LOTTE_WH');
      var data = req.imageData.split(',')[1] || req.imageData;   // 去掉 dataURL 前綴
      var blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', req.filename);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return _json({ ok: true, url: file.getUrl() });
    }

    // 3) 寄送入庫單 Email（format=xlsx → 原生 Excel；否則 CSV）
    if (req.action === 'sendMail') {
      var to       = req.to || '';
      var subject  = req.subject || '樂天移倉入庫單';
      var body     = req.body || '';
      var csvText  = req.csv || '';
      var filename = req.filename || '入庫單.xlsx';
      var format   = req.format || 'csv';
      var blob;

      if (format === 'xlsx') {
        var tmp = SpreadsheetApp.create('TMP_入庫單_' + Date.now());
        var data = Utilities.parseCsv(csvText);
        if (data && data.length) {
          tmp.getSheets()[0].getRange(1, 1, data.length, data[0].length).setValues(data);
        }
        SpreadsheetApp.flush();
        var id = tmp.getId();
        var resp = UrlFetchApp.fetch(
          'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
          { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
        blob = resp.getBlob().setName(filename);
        DriveApp.getFileById(id).setTrashed(true);     // 刪暫存檔
      } else {
        blob = Utilities.newBlob('﻿' + csvText, 'text/csv', filename);  // CSV 加 BOM
      }

      MailApp.sendEmail({ to: to, subject: subject, body: body, attachments: [blob] });
      return _json({ ok: true, sent: to });
    }

    return _json({ ok: false, error: 'unknown_post_action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── helpers ──
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function _ensureFolder(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
```

> 存檔（Ctrl+S）。

---

## 【C】授權（首次必做）

1. Apps Script 編輯器上方，函式下拉選 **`doPost`**（或任一函式）→ 按 **執行 ▶**。
2. 跳「需要授權」→ **檢閱權限** → 選 **hill7218@gmail.com**。
3. 出現「Google 尚未驗證這個應用程式」→ **進階** → **前往「專案名稱」(不安全)**。
4. 勾選同意以下範圍（因程式用到）：
   - **以你的名義傳送電子郵件**（MailApp）
   - **查看、編輯、建立、刪除你的 Google 試算表**（SpreadsheetApp）
   - **查看、建立、刪除 Google Drive 檔案**（DriveApp / 照片 + xlsx 暫存）
   - **連線至外部服務**（UrlFetchApp / xlsx export）
5. 完成 → 回編輯器。

> 授權一次即可；之後改程式只要重新部署，不必再授權（除非新增了新的權限範圍）。

---

## 【D】部署為 Web App

1. Apps Script 右上 **部署 → 新增部署作業**。
2. 類型選 **網頁應用程式 (Web app)**。
3. 設定：
   - 說明：`ALLY LOTTE v7.1`
   - **執行身分：我（hill7218@gmail.com）** ← 必須，信才會用你的帳號寄
   - **具存取權者：任何人** ← 必須，APP 才能免登入呼叫
4. **部署** → 複製 **網頁應用程式 URL**（形如 `https://script.google.com/macros/s/AKfyc.../exec`）。
5. 把這個 URL 貼到兩個 HTML：
   - APP `ALLY_LOTTE_WAREHOUSE_v7.0.html`：搜尋 `webAppUrl:` → 換成新 URL
   - 列印器 `ALLY_LOTTE_QR_PRINTER_v7.0.html`：填「Google Sheet ID」欄即可（列印器走免金鑰 CSV 讀取，不需 webAppUrl）

> ⚠️ 每次改 Code.gs 後，要 **部署 → 管理部署作業 → 編輯(鉛筆) → 版本選「新版本」→ 部署**，否則仍跑舊碼。

---

## 【E】測試驗收（5 條 smoke test）

| # | 測試 | 方法 | 預期 |
|---|------|------|------|
| E-1 | 讀分頁 | 瀏覽器開 `{webAppUrl}?action=read&tab=發送人員清單` | 回 `{"ok":true,"values":[["姓名","信箱"],["hill","hill.tsai@..."],...]}` |
| E-2 | 儲位讀取 | 同上 `?action=read&tab=儲位清單` | 回 AVAILABLE 儲位列 |
| E-3 | 寫入測試 | APP 封 1 板 → 關單 | 「入庫單」分頁新增列、「操作記錄」分頁新增日誌列 |
| E-4 | Email + XLS | 關單後 | 5 位窗口收到主旨「樂天移倉入庫單｜…」，附件 `.xlsx` 開啟正常、含「儲位」欄 |
| E-5 | 照片（選配） | S2/S3 拍照 | Google Drive `ALLY_LOTTE_WH` 資料夾出現照片 |

全綠 → 上線。

---

## 🔧 疑難排解

| 症狀 | 原因 | 解法 |
|------|------|------|
| APP 顯示「無發送人員清單」 | doGet read 未通 / 分頁名不符 | 跑 E-1，確認回傳 values |
| 信沒寄出 | 未授權 Gmail / 執行身分非本人 | 重做【C】【D】 |
| 附件亂碼 | 用了 CSV 非 xlsx | 確認 Code.gs 有 xlsx 分支、APP 送 `format:'xlsx'` |
| S8 全綠燈比不出 | 入庫單缺「儲位」欄 | 補 A-5 第 23 欄 |
| 改了程式沒生效 | 沒重新部署新版本 | 【D】重新部署 |
| 照片上傳失敗 | 未授權 Drive | 重做【C】 |

---

**版本**：v7.1
**部署 / 發送帳號**：hill7218@gmail.com
**試算表 ID**：1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4
