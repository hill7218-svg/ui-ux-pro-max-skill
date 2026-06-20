# ALLY × LOTTE — 入庫單 Email 發送 GAS 後端設定 (v7.1)

> 關單發車後，APP 會把入庫單 CSV 透過 Apps Script Web App 以 **hill7218@gmail.com** 寄給「發送人員清單」名單。
> 本文件說明 Apps Script 需新增的 `sendMail` 動作處理。

---

## 一、收件清單來源

Google Sheet 分頁 **「發送人員清單」**：

| A欄 姓名 | B欄 信箱 |
|---------|---------|
| hill | hill.tsai@allyls.com.tw |
| Emma | emma.wu@allyls.com.tw |
| Evonne | evonne.lee@allyls.com.tw |
| 嘉純 | jiachun.wu@allyls.com.tw |
| Frank | frank.zeng@allyls.com.tw |

- APP 讀 B 欄（跳過表頭），取含「@」的 email。
- 要增減收件人 → 直接改這個分頁，APP 無須改程式。

---

## 〇、前置依賴：doGet `read` 分支（必須已存在）

APP 讀「發送人員清單」靠既有的 **GET** 介面：`?action=read&tab=發送人員清單`，
由 Apps Script 的 `doGet(e)` 回傳 `{ values: [...] }`。

> ⚠️ 若你的 Web App 後端尚未實作 `action=read` 的 doGet，`getMailList()` 會回空陣列，
> Email 會靜默略過（APP 顯示「無發送人員清單」但不報錯）。發信前請先確認此分支存在。

`doGet` 參考（若已有讀分頁功能可略過）：

```javascript
function doGet(e) {
  var p = e.parameter || {};
  if (p.action === 'read') {
    var ss = SpreadsheetApp.openById('1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4');
    var sh = ss.getSheetByName(p.tab);
    var values = sh ? sh.getDataRange().getValues() : [];
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, values: values }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // ... 其餘 doGet 分支 ...
}
```

---

## 二、Apps Script 需新增的處理（doPost）

在現有 Web App 的 `doPost(e)` 內，加入 `action === 'sendMail'` 分支：

```javascript
function doPost(e) {
  var req = JSON.parse(e.postData.contents);

  // ... 既有的 append / uploadPhoto 分支 ...

  // 【v7.1】寄送入庫單 Email（附件：format='xlsx' → 原生 Excel；否則 CSV）
  if (req.action === 'sendMail') {
    try {
      var to       = req.to || '';              // 逗號分隔收件人
      var subject  = req.subject || '樂天移倉入庫單';
      var body     = req.body || '';
      var csvText  = req.csv || '';
      var filename = req.filename || '入庫單.xlsx';
      var format   = req.format || 'csv';

      var blob;
      if (format === 'xlsx') {
        // CSV → 暫存 Google Sheet → 匯出原生 .xlsx → 刪暫存檔
        var tmp = SpreadsheetApp.create('TMP_入庫單_' + Date.now());
        var sheet = tmp.getSheets()[0];
        // 解析 CSV（Utilities.parseCsv 處理引號跳脫）
        var data = Utilities.parseCsv(csvText);
        if (data && data.length) {
          sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
        }
        SpreadsheetApp.flush();
        var fileId = tmp.getId();
        // 透過 export URL 取 xlsx blob
        var url = 'https://docs.google.com/spreadsheets/d/' + fileId +
                  '/export?format=xlsx';
        var resp = UrlFetchApp.fetch(url, {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
        });
        blob = resp.getBlob().setName(filename);
        DriveApp.getFileById(fileId).setTrashed(true);   // 清除暫存檔
      } else {
        // CSV 加 UTF-8 BOM，Excel 開啟不亂碼
        blob = Utilities.newBlob('﻿' + csvText, 'text/csv', filename);
      }

      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: body,
        attachments: [blob]
        // name: '樂天移倉系統'   // 可選：寄件者顯示名
      });

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, sent: to }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ... 其餘 ...
}
```

---

## 三、部署注意事項

1. **發送帳號**：以「部署這支 Apps Script 的 Google 帳號」名義寄出 → 必須用 **hill7218@gmail.com** 登入並部署。
2. **授權**：首次執行 `MailApp.sendEmail` 會跳授權視窗，需同意「以你的名義傳送電子郵件」。
3. **Web App 部署設定**：
   - 執行身分：**我（hill7218@gmail.com）**
   - 具存取權者：**任何人**（APP 才能免登入呼叫）
4. **每日寄信額度**：一般 Gmail 帳號 `MailApp` 約 100 封/日；移倉一天數趟，遠低於上限，無虞。
   - 若改用 `GmailApp.sendEmail`（可進寄件備份）額度相同。
5. **【v7.1 XLS】xlsx 轉檔授權**：`format='xlsx'` 分支會用 `SpreadsheetApp.create` + `UrlFetchApp.fetch(export)` + `DriveApp`，
   首次執行需額外授權 **Google Drive / Sheets** 範圍。export URL 用 `ScriptApp.getOAuthToken()` 帶權杖。
   轉檔後會自動把暫存 Sheet 丟到垃圾桶（`setTrashed(true)`），不殘留。
6. **【v7.1 操作記錄】** APP 會 append 到「操作記錄」分頁（封板/關單時批次）。
   確認 `doPost` 的 `append` 分支在分頁不存在時會自動建立（或預先手動建好「操作記錄」分頁），
   欄位順序：時間戳 | 車號 | 趟次 | 動作 | 明細 | 棧板數 | 已掃箱數。
7. 改動 Apps Script 後，務必 **重新部署**（管理部署 → 編輯 → 新版本），否則 Web App 仍跑舊碼。

---

## 四、APP 端對應（已實裝，無須改）

| 項目 | 位置 |
|------|------|
| 收件清單分頁名 | `CONFIG.sheets.tabs.mailList = "發送人員清單"` |
| 讀清單 | `Backend.getMailList()` |
| 發信 | `Backend.sendWmsEmail(...)`，POST 帶 `format:'xlsx'` 請 GAS 轉原生 Excel |
| 關單觸發 | `doClose()` → `emailWmsToMailList()`（附件 `入庫單_車號_日期.xlsx`） |
| 操作日誌 | `flushLogToSheet()` → append「操作記錄」分頁（封板/關單批次） |
| 備援 | Email 失敗不影響關單；S4「下載入庫單 CSV」可手動備援 |

---

## 五、測試方式

1. 確認 Apps Script 已加 `sendMail` 分支並重新部署。
   - 並確認 doGet `action=read` 分支存在：瀏覽器開
     `{webAppUrl}?action=read&tab=發送人員清單` 應回傳含 5 位窗口的 `values`。
2. APP 開工 → 掃商品 → 封板 → S4「確認車輛裝滿 關單發車」。
3. 檢查：
   - [ ] 5 位窗口收到主旨「樂天移倉入庫單｜…」的信
   - [ ] 附件為 `.xlsx`（原生 Excel），開啟欄位正確、中文不亂碼、含「儲位」欄
   - [ ] 「操作記錄」分頁出現本趟封板/關單的日誌列
   - [ ] 附件 CSV 用 Excel 開啟無亂碼、欄位正確（含「儲位」欄）
   - [ ] APP toast 顯示「✅ 入庫單已 Email 給 5 位窗口」
4. 若收件清單為空 → APP 顯示「⚠️ 無發送人員清單」，僅下載備援。

---

**版本**：v7.1
**發送帳號**：hill7218@gmail.com
**Sheet ID**：1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4
