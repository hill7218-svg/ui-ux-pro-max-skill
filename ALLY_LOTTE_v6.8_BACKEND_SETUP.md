# ALLY LOTTE v6.8 — 後端串接指南

> **架構原則**：App 內所有對外連線都集中在 `CONFIG` + `Backend` 兩個區塊。
> 你只需要填 `CONFIG`，其他程式碼一行都不用動。未填值時自動以 **Demo 模式**運作，流程照樣能測。

---

## 🎯 一張圖看懂架構

```
業務程式 (掃描/封板/拍照/同步)
        │  只呼叫 Backend.xxx()，從不直接碰網路
        ▼
   ┌─────────────────────────────┐
   │  Backend 接口層 (adapter)    │
   ├─────────────────────────────┤
   │ uploadPhoto() → Firebase     │
   │ appendRows()  → Sheets(寫)   │
   │ readTab()     → Sheets(讀)   │
   │ loadMasterData()→ 司機/商品/儲位│
   └─────────────────────────────┘
        │                    │
        ▼                    ▼
   Firebase Storage    Google Apps Script Web App
   (照片)              (一個 URL 同時讀+寫 Sheets)
```

**為什麼用 Apps Script Web App 而不是直接打 Sheets API？**
Google 規定「寫入」Sheets 一定要 OAuth2。純前端 HTML 無法安全持有 OAuth。
Apps Script Web App 用你自己的權限執行，前端只要 `fetch` 一個 URL，**免 OAuth、免 CORS、免後端伺服器**。這是純前端寫 Sheets 的業界標準作法。

---

## ① Firebase（照片存證）

從 **Firebase Console → ⚙️ 專案設定 → 一般 → 你的應用程式** 取得這幾個值，填進 `CONFIG.firebase`：

```js
firebase: {
  apiKey:        "AIza...",
  authDomain:    "你的專案.firebaseapp.com",   // 可留空，會自動帶
  projectId:     "你的專案id",
  storageBucket: "你的專案id.appspot.com",
  appId:         "1:xxxx:web:xxxx"
}
```

**Storage 規則（開發階段）** — Firebase Console → Storage → Rules：
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /warehouse/{allPaths=**} {
      allow read, write: if true;   // ⚠️ 正式上線請改為需驗證
    }
  }
}
```

照片路徑規則（程式自動產生）：
```
warehouse/{車號}/{棧板ID}/anomaly_{時間}_{索引}.jpg   ← 異常存證照
warehouse/{車號}/general/{時間}_photo_{索引}.jpg        ← 一般照片
```

---

## ② Google Sheets（資料留存 + 主檔載入）

### Step 1 — 建立試算表，開 4 個分頁（名稱要一致）

**分頁 1：`移倉記錄`**（App 寫入用，第一列放表頭）
| 時間戳 | 車號 | 司機 | 棧板ID | 儲位 | 品項數 | 箱數 | 狀態 | 異常類型 | 說明 | 照片數 |
|--------|------|------|--------|------|--------|------|------|----------|------|--------|

**分頁 2：`司機清單`**（App 讀取，對應你說要建的司機↔車號表）
| PIN | 司機姓名 | 配對車號 | 電話 |
|-----|---------|---------|------|
| 1234 | 王小明 | BBB-2262,BCK-8801 | 090-1234567 |
| 5678 | 李漢文 | BDF-3390,BXC-2262 | 090-2345678 |

> 配對車號用逗號分隔；留空代表該司機不限車號。

**分頁 3：`商品清單`**（App 讀取 → 預期箱數比對）
| 品號 | 品名 | 預期箱數 | 每箱PCS | 溫層 |
|------|------|---------|---------|------|
| BJ9321 | LOTTE原味巧克力派 | 36 | 10 | 24°~26° |

**分頁 4：`儲位清單`**（App 讀取 → 可用儲位池）
| 走道 | 儲位 | 狀態 |
|------|------|------|
| BA | BA242 | AVAILABLE |
| BA | BA243 | FULL |

> 只有 `AVAILABLE` 的儲位會被載入分配；`FULL`/其他會略過。

### Step 2 — 部署 Apps Script Web App

1. 在試算表上方選單：**擴充功能 → Apps Script**
2. 把下面整段程式碼貼上（覆蓋預設內容），存檔
3. 右上 **部署 → 新增部署作業 → 類型選「網頁應用程式」**
   - 執行身分：**我**
   - 具有存取權的人員：**所有人**
4. 複製產生的 **網頁應用程式 URL**，填進 `CONFIG.sheets.webAppUrl`

```javascript
// ===== ALLY LOTTE 後端 Web App（貼進 Apps Script）=====
function doGet(e) {
  var tab = (e.parameter.tab || '').toString();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tab);
  if (!sheet) return _json({ ok:false, error:'no_tab', values:[] });
  var values = sheet.getDataRange().getValues();
  return _json({ ok:true, values:values });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents || '{}');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(body.tab);
  if (!sheet) return _json({ ok:false, error:'no_tab' });

  if (body.action === 'append' && Array.isArray(body.rows)) {
    body.rows.forEach(function(row){ sheet.appendRow(row); });
    return _json({ ok:true, appended: body.rows.length });
  }
  return _json({ ok:false, error:'bad_action' });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Step 3 — 填進 App
```js
sheets: {
  webAppUrl: "https://script.google.com/macros/s/AKfy.../exec",
  tabs: { log:"移倉記錄", drivers:"司機清單", inventory:"商品清單", locations:"儲位清單" }
}
```

> **備援讀取**：若你只想先「讀」公開試算表，也可改填 `apiKey` + `sheetId`（直連 Sheets API，僅讀）。但「寫入」一定要走 `webAppUrl`。

---

## ③ 填完後會怎樣？（自動行為）

| 狀態 | 右上角標籤 | 行為 |
|------|-----------|------|
| 都沒填 | `💾 Demo` | 流程全可測；照片本地預覽、同步本地暫存 |
| 只填 Firebase | `☁️ Live · FB` | 照片真的上傳；Sheets 仍暫存 |
| 只填 Sheets | `☁️ Live · Sheets` | 開工自動載入司機/商品/儲位；同步真的寫入 |
| 兩個都填 | `☁️ Live · FB · Sheets` | 全功能 |

開工（進 S0）時若 Sheets 已串，會自動：
- 用 `司機清單` 覆蓋內建 PIN 表
- 用 `商品清單` 覆蓋預期箱數
- 用 `儲位清單`（AVAILABLE）重建儲位池

---

## ④ 驗收測試清單

```
[ ] 開頁右上顯示 ☁️ Live（不是 💾 Demo）
[ ] Console 看到 [Backend] mode=live | firebase=true | sheets=true
[ ] 輸入 Sheet 上的司機 PIN → 顯示正確姓名 + 車號比對
[ ] 拍異常照 → Firebase Storage 出現 warehouse/.../anomaly_*.jpg
[ ] 點「☁️ 同步 Google Sheets」→ 移倉記錄分頁新增列
[ ] 關閉網路再同步 → 顯示暫存；恢復後 retryPendingSync() 補回
```

控制台可用指令：
```js
Backend.mode                 // 'live' / 'demo'
Backend.loadMasterData()     // 手動重載主檔
retryPendingSync()           // 補送暫存的同步
window._pendingSync          // 查看待同步資料
```

---

**填完 CONFIG 就能測，程式碼零改動。** 有任何一格不確定填什麼，把該頁截圖給我。
