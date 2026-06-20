# ALLY × LOTTE 移倉對點系統 v7.1 完整開發規格書

**版本**：v7.1  
**日期**：2026-06-18  
**部署帳號**：hill7218@gmail.com  
**試算表 ID**：1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4

---

## 目錄

1. [系統總覽](#系統總覽)
2. [核心功能規格](#核心功能規格)
3. [技術架構](#技術架構)
4. [API 規範](#api-規範)
5. [資料結構](#資料結構)
6. [部署清單](#部署清單)
7. [測試計畫](#測試計畫)
8. [已知限制](#已知限制)

---

## 系統總覽

### 功能定位

ALLY × LOTTE 移倉對點系統是一套完整的**跨地點物流樂天棧板管理系統**，用於樂天鶯歌配送中心至瑞芳倉庫的棧板移倉、驗收上架工作流。

**核心業務流程**：
```
移出端（鶯歌）                運送                收貨端（瑞芳）
──────────────────────────────────────────────────────
S0 開工設定
  ↓
H1 貼紙預配（列印器）
  ↓
S1 掃商品 + 貼紙
  ↓
S3 封板（軟驗證儲位）
  ↓
S4 關單 + 關鍵數據上傳
              ↓ 運送
                     S8 收貨驗收（刷QR + 刷儲位）
                     ↓
                     完成上架 + 軟驗證覆寫記錄
```

### 用戶角色

| 角色 | 所在地 | 主要操作 |
|------|--------|----------|
| 移出操作員 | 鶯歌 | S0～S4：開工、掃描、封板、關單 |
| 收貨驗收員 | 瑞芳 | S8：卸貨驗收、儲位刷碼、上架確認 |
| 行政/管理 | 辦公室 | H1：預配貼紙列印；生成報表；操作日誌查詢 |

### 雙條碼體系（v7.0 核心創新）

**來源單號 QR 碼（碼A）**
```
格式：ALLY-YYYYMMDD-[AB]-[1-3]-[001-192]
示例：ALLY-20260612-A-1-001
含義：
  - ALLY：廠商識別
  - YYYYMMDD：日期（如 20260612）
  - A|B：車型（A=趟1-3，B=趟4-6）
  - 1-3：該日該車型的第1～3趟
  - 001-192：該趟內的第1～192板
```

**儲位 Code128 條碼（碼B，v7.0 新增）**
```
格式：BA012 / BA013 / BA034 / ... / BP072
含義：走道(BA~BP) + 層級(第1-4層) + 格位(第1-18格)
預配來源：儲位清單分頁（先讀 AVAILABLE，順序對齊列印板序）
```

---

## 核心功能規格

### S0 — 開工設定（移出端）

**入口**：APP 首頁「⚙️ 開工設定」按鈕

**流程**：
1. 選擇司機（車號下拉，已完成趟次顯示提示）
2. 選擇主走道（BA～BP，秒級計算剩餘可用格位）
3. （條件式）選擇溢出走道（當主走道可用 < 預期量）
4. 選擇趟次（第1/2/3趟；已完成禁用）
5. 確認開工 → 進入 S1

**狀態管理**：
```javascript
ST = {
  truck: "BBB-2262",          // 司機車號
  aisle: "BA",                // 主走道
  overflow: null,             // 溢出走道（可空）
  trip: 1,                    // 趟次 1-3
  workflow: "inspect",        // 工作流模式（inspect|fast）
  pallets: {},                // 棧板庫
  closed: false               // 該趟是否已關單
}

CLOSED_TRIPS = {
  "BBB-2262": [1, 3],         // 已完成趟次
  "BXC-3351": [1, 2, 3]
}

ST.usedCells = {
  "BA": 25,                   // BA 已用 25 格（共 72）
  "BB": 0,
  "BC": 12,
  ...
}
```

**關鍵計算**：
- 可用格位 = 72 - usedCells[aisle]
- 預期板數（預配時） = 32 板
- 若溢出走道被選，自動在 overflow 分配後續板

### S1 — 掃商品 + 雙碼綁板（移出端）

**入口**：S0 開工後自動進入 S1

**核心操作**：

#### 掃來源 QR（碼A）
```javascript
scanPalletLabel() {
  // 驗證格式：ALLY-YYYYMMDD-[AB]-[1-3]-[001-192]
  if (!regex.test(scannedValue)) {
    toast('格式不符', true);
    return;
  }
  
  // 新建/選取棧板
  pallet = ST.pallets[value] || {
    id: value,
    location: null,
    suggestedLoc: null,  // v7.0 新增：貼紙建議儲位
    items: {},
    status: null,
    scanned: Date.now()
  };
}
```

#### 掃儲位 Code128（碼B，v7.0 新增）
```javascript
scanPalletLocation() {
  // 驗證格式：^[A-Z]{2}\d{3}$（如 BA012）
  if (!regex.test(code128)) {
    toast('儲位碼格式錯誤', true);
    return;
  }
  
  // 存入貼紙建議儲位
  pallet.suggestedLoc = code128;
  showLocationInputField();  // 自動顯示儲位確認區
}
```

#### 商品掃碼 & 數量調整
```javascript
scanProduct(barcode) {
  // 按序查商品清單，支援箱/包/片掃碼
  product = lookupProduct(barcode);
  
  if (!product) {
    toast('商品未找到', true);
    return;
  }
  
  // 新增/更新數量
  if (!pallet.items[product.code]) {
    pallet.items[product.code] = {
      code: product.code,
      name: product.name,
      qty: 1,
      unit: product.unit
    };
  } else {
    pallet.items[product.code].qty += 1;
  }
}
```

**UI 狀態**：
- 當前棧板展示：來源 QR 值 + 品項數 + 總件數
- 工作流選擇：「🔍 核查模式」（S3 多驗證）vs 「⚡ 快速模式」（直接封板）

### S3 — 封板 + 儲位軟驗證（移出端）

**入口**：S1 掃完後進入 S3

**核心流程**：

#### 選擇異常狀態
```javascript
sealStatus: {
  "ok": "正常",        // 預設
  "diff": "數量差異",
  "dmg": "破損/QA-HOLD",
  "mrg": "混雜",
  "oth": "其他"
}
```

#### 儲位預配與覆寫
```javascript
confirmAndSealPallet() {
  // 優先序（已定案）：
  pallet.loc = pallet.loc              // 1. 已覆寫
             || pallet.suggestedLoc    // 2. 貼紙建議（v7.0）
             || ST._pendingLoc         // 3. S1 臨時待定位置
             || assignLoc();           // 4. 自動分配（fallback）
  
  // assignLoc() 只在無預配儲位時觸發
  // 若破損 QA-HOLD → 自動隔離到 A18 理賠區
  
  // 記錄覆寫（若實際 ≠ 建議）
  if (pallet.loc !== pallet.suggestedLoc) {
    pallet.isOverwrite = true;
    pallet.overwriteReason = userInputReason;  // UI 提示填原因
  }
  
  // 更新已用格位
  ST.usedCells[pallet.aisle] += 1;
  
  // 記錄操作日誌
  addLog('確認封板', {
    pallet: pallet.id,
    location: pallet.loc,
    isOverwrite: pallet.isOverwrite
  });
}
```

**儲位軟驗證邏輯（S8 收貨端用）**：
```javascript
s8ScanLocation(realLoc) {
  // 查入庫單該板的 suggestedLoc
  bookLoc = lookupInvoice(pallet.sourceId).location;
  
  if (realLoc === bookLoc) {
    // 綠燈：實刷 = 建議位，可直接上架
    light = 'green';
  } else if (isValidLocation(realLoc)) {
    // 黃燈：實刷 ≠ 建議位，需二次確認
    light = 'yellow';
    s8ConfirmOverwrite();  // 追問覆寫原因
  } else {
    // 紅燈：無效儲位，要求改刷
    light = 'red';
    toast('儲位代碼不存在', true);
  }
}
```

### S4 — 關單 & 上傳（移出端）

**入口**：S3 封板全部板材後進入 S4

**核心操作**：
1. 彙總顯示：32 板封板狀態 + 異常棧板列表（數量差異、破損、混雜）
2. 確認無誤 → 點「關單」按鈕
3. 批量上傳：
   - 依板明細→入庫單分頁（23 欄）
   - 操作日誌→操作記錄分頁（7 欄）
   - 移倉記錄→移倉記錄分頁（12 欄）

**上傳數據格式**：
```javascript
// 入庫單（依板明細，多SKU多列）
row = [
  timestamp,           // 時間戳
  truck,              // 車號
  sourceId,           // 來源單號（ALLY-…-A1-001）
  productCode,        // 商品貨號
  productName,        // 商品名稱
  qty,                // 數量
  mfgDate,            // 製造日期
  expDate,            // 有效日期
  batch,              // 批號
  barcode,            // 商品條碼
  warehouse,          // 虛擬倉（A47/A49/…）
  level,              // 庫存等級屬性
  version,            // 版本號
  reason,             // 原因代碼
  location,           // 儲位（v7.0 新增）
  ...                 // 23 欄完整對應
];
```

**Email 寄 xlsx**：
```javascript
sendMail() {
  // 讀「發送人員清單」→抽取信箱（跳表頭、含@）
  recipients = readSheet('發送人員清單').filter(has('@'));
  
  // 組 CSV → xlsx 轉換
  sendMail({
    to: recipients.join(','),
    subject: '樂天移倉入庫單｜' + truck + ' 趟' + trip,
    body: '請見附件，感謝。',
    csv: buildCSV(wmsRows),
    format: 'xlsx',  // 觸發後端 xlsx 轉換
    filename: 'LOTTE_' + truck + '_' + trip + '.xlsx'
  });
}
```

### S8 — 收貨驗收（收貨端，v7.0 新增）

**入口**：APP 標籤頁「S8」或快捷按鈕

**核心流程**：

#### 步驟 1：刷來源 QR（碼A）
```javascript
s8ScanSourceId(qr) {
  // ALLY-20260612-A-1-001 → 查入庫單
  invoice = queryInvoice('來源單號', qr);
  
  if (!invoice) {
    toast('查無該棧板', true);
    return;
  }
  
  // 顯示該板全部品項 + 建議儲位
  showPalletDetail(invoice);
}
```

#### 步驟 2：刷儲位 Code128（碼B）
```javascript
s8ScanLocation(code128) {
  bookLoc = invoice.location;  // 建議儲位
  
  if (code128 === bookLoc) {
    // 綠燈：符合建議
    light = 'green';
    s8ConfirmReceiving('match', null);
  } else if (isValidLocation(code128)) {
    // 黃燈：不符但有效，需確認覆寫
    light = 'yellow';
    showOverwriteDialog(code128);  // UI 提示填覆寫原因
  } else {
    // 紅燈：無效儲位
    light = 'red';
    toast('儲位不存在', true);
  }
}
```

#### 步驟 3：確認收貨（記錄覆寫）
```javascript
s8ConfirmReceiving(status, overwriteReason) {
  // 寫入「收貨狀態」分頁
  row = [
    timestamp,        // 時間戳
    truck,           // 車號
    sourceId,        // 來源單號
    operator,        // 收貨人（登入者）
    suggestedLoc,    // 建議儲位
    actualLoc,       // 實際儲位
    isOverwrite,     // 是否覆寫（Y/N）
    overwriteReason, // 覆寫原因（若有）
    status           // 狀態（綠/黃/紅燈）
  ];
  
  // 追加 Google Sheet「收貨狀態」
  append('收貨狀態', [row]);
  
  // 去重檢查（M2 機制）：
  // 若同一「來源單號 + 實際儲位」已存在 → 提示「已收貨」
}
```

### H1 — 貼紙預配列印器（事前）

**工具位置**：ALLY_LOTTE_QR_PRINTER_v7.0.html（獨立 HTML）

**核心功能**：
1. 讀「儲位清單」分頁（免金鑰 CSV 讀取）
2. 按走道順序篩選 AVAILABLE 儲位
3. 依板序配發儲位建議（第1板→該走道第1個可用）
4. 每張貼紙 = 10cm×10cm（瀏覽器列印）
   - **上半部**：來源 QR（ALLY-20260612-A-1-001）+ 純文字
   - **下半部**：儲位 Code128（BA012）+ 純文字「BA 012」

**列印配置**：
```javascript
// 每趟 32 板 × 6 趟 = 192 張貼紙
// CSS 設定：寬 284px × 高 284px（10cm）
// QR 高度：220px（55mm 視覺對焦）
// Code128 高度：48px（25mm）
```

**去重機制**：
- 列印器記錄已列印板號 → 防止重複列印同一板

### H4 — 操作日誌（批量上傳）

**觸發時機**：S4 關單時自動上傳

**日誌欄位**：
```
時間戳 | 車號 | 趟次 | 動作 | 明細 | 棧板數 | 已掃箱數
```

**日誌類型**：
```javascript
operationLog = [
  {
    timestamp: "2026-06-12 10:30:45",
    action: "開工",
    details: "A趟1",
    palletCount: 0,
    scannedQty: 0
  },
  {
    timestamp: "2026-06-12 10:35:12",
    action: "掃描",
    details: "ALLY-20260612-A-1-001",
    palletCount: 1,
    scannedQty: 48
  },
  {
    timestamp: "2026-06-12 12:15:00",
    action: "確認封板",
    details: "BA025（正常）",
    palletCount: 32,
    scannedQty: 156
  },
  {
    timestamp: "2026-06-12 12:16:30",
    action: "關單",
    details: "趟1 完成，異常板 2 件",
    palletCount: 32,
    scannedQty: 156
  }
];
```

---

## 技術架構

### 分層架構圖

```
┌──────────────────────────────────────────────────────┐
│           📱 前端層：HTML5 / CSS3 / Vanilla JS        │
│        無框架、PDA WebView 相容（390×844px）          │
├──────────────────────────────────────────────────────┤
│  S0 S1 S2 S3 S4 S6 S7 S8 | H1 列印器 | H4 日誌       │
│  localStorag: ST / CLOSED_TRIPS / operationLog       │
├──────────────────────────────────────────────────────┤
│   🔌 API 層（Google Apps Script 後端）              │
│   RESTful 調用（GET/POST）                          │
├──────────────────────────────────────────────────────┤
│   ☁️ 資料層：Google Sheets + Google Drive            │
│   7 個 Sheet 分頁 + 照片存儲                         │
└──────────────────────────────────────────────────────┘
```

### 前端技術棧

| 層級 | 框架 | 用途 |
|------|------|------|
| 容器 | HTML | 單檔應用（~1500 行代碼） |
| 樣式 | CSS3 | Design Token + Flexbox 版面 |
| 邏輯 | Vanilla JS | 無外部依賴（QRCode、Barcode 走 CDN） |
| 儲存 | localStorage | 離線狀態保存 |
| 網路 | fetch API | JSON/multipart 通訊 |

### 後端 — Google Apps Script (GAS)

**檔案名**：Code.gs（Google Sheet 內建編輯器）

**導出函式**：
- `doGet(e)` — 讀操作（GET 請求）
- `doPost(e)` — 寫/上傳/寄信操作（POST 請求）

**部署方式**：網頁應用程式（Web App）
- 執行身分：hill7218@gmail.com（必須個人帳號，寄信用）
- 具存取權者：任何人（允許免登入 APP 調用）

### 資料流向

```
APP (ST.pallets)
  ↓
buildWmsRows() → CSV 格式
  ↓
fetch(webAppUrl, {
  method: 'POST',
  body: JSON.stringify({
    action: 'append',
    tab: '入庫單',
    rows: wmsRows
  })
})
  ↓
GAS doPost() → SpreadsheetApp.append()
  ↓
Google Sheet「入庫單」新增列
```

---

## API 規範

### GET 讀操作（doGet）

**端點**：`{webAppUrl}?action=read&tab={tab_name}`

**支援分頁**：
- `司機清單` — 車號、司機姓名、電話
- `商品清單` — 品號、品名、箱條碼、箱入數、…
- `儲位清單` — 走道、儲位代碼、狀態
- `發送人員清單` — 姓名、信箱
- `倉別清單` — 代碼、名稱、WMS 對應

**範例**：
```bash
curl "https://script.google.com/.../exec?action=read&tab=儲位清單"
```

**回應格式**：
```json
{
  "ok": true,
  "values": [
    ["走道", "儲位", "狀態"],
    ["BA", "BA001", "AVAILABLE"],
    ["BA", "BA002", "AVAILABLE"],
    ...
  ]
}
```

### POST 寫操作（doPost）

#### 追加列 — append

```javascript
fetch(webAppUrl, {
  method: 'POST',
  body: JSON.stringify({
    action: 'append',
    tab: '入庫單',      // 分頁名稱
    rows: [             // 2D 數組
      ["廠商統編", "廠商聯絡人", ..., "儲位"],
      ["123456789", "王小明", ..., "BA025"],
      ["123456789", "王小明", ..., "BA025"]
    ]
  })
});
```

**回應**：
```json
{ "ok": true, "appended": 2 }
```

#### 照片上傳 — uploadPhoto

```javascript
fetch(webAppUrl, {
  method: 'POST',
  body: JSON.stringify({
    action: 'uploadPhoto',
    imageData: "data:image/jpeg;base64,...",  // dataURL 或純 base64
    filename: "LOTTE_BBB2262_A1_001_photo1.jpg",
    folderId: null  // 可空，自動創建 ALLY_LOTTE_WH 資料夾
  })
});
```

**回應**：
```json
{
  "ok": true,
  "url": "https://drive.google.com/file/d/ABC.../view?usp=sharing"
}
```

#### 寄 Email — sendMail

```javascript
fetch(webAppUrl, {
  method: 'POST',
  body: JSON.stringify({
    action: 'sendMail',
    to: "hill.tsai@allyls.com.tw,emma.wu@allyls.com.tw",
    subject: "樂天移倉入庫單｜BBB-2262 趟1",
    body: "如附件。",
    csv: "品號,品名,數量\n...",
    format: "xlsx",  // "csv" 或 "xlsx"（v7.1 支援兩者）
    filename: "LOTTE_BBB2262_趟1.xlsx"
  })
});
```

**回應**：
```json
{ "ok": true, "sent": "hill.tsai@allyls.com.tw,..." }
```

**GAS 內部邏輯**：
- xlsx 模式：臨時建 Sheet → 填資料 → 轉 xlsx → 刪暫存
- csv 模式：直接編碼 CSV（加 BOM）→ 寄出

---

## 資料結構

### Sheet 分頁配置（7 個）

#### A. 司機清單（手維護）
| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| A | 車號 | 文字 | 如 BBB-2262 |
| B | 司機姓名 | 文字 | 如 王大明 |
| C | 電話 | 文字 | 如 0912345678 |

**範例**：
```
A             | B      | C
──────────────────────────────
BBB-2262      | 王大明 | 0912345678
BXC-3351      | 李小華 | 0923456789
```

#### B. 商品清單（手維護）
| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| A | 品號 | 文字 | 如 BJ9321 |
| B | 品名 | 文字 | 如 LOTTE 巧克力派 |
| C | 箱條碼 | 文字 | EAN-13 |
| D | 箱入數 | 數字 | 如 10 |
| E | 包條碼 | 文字 | 可空 |
| F | 包入數 | 數字 | 可空 |
| G | 最小單位 | 文字 | 如「片」 |
| H | 預期箱數 | 數字 | 用途：S6 容量提示 |
| I | 溫層 | 文字 | 如「常溫」 |

#### C. 儲位清單（手維護 — 關鍵預配源）
| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| A | 走道 | 文字 | BA ~ BP（共 16 走道） |
| B | 儲位代碼 | 文字 | 如 BA001 ~ BA072（每走道 72 格） |
| C | 狀態 | 文字 | AVAILABLE 或其他（只配 AVAILABLE） |

**範例**：
```
走道 | 儲位代碼 | 狀態
──────────────────────────
BA   | BA001   | AVAILABLE
BA   | BA002   | AVAILABLE
BA   | BA003   | AVAILABLE
BA   | BA004   | HOLD
...
```

**關鍵邏輯**：
- 列印器 H1 讀此分頁 → 每走道按序抽 AVAILABLE → 配發為貼紙建議位
- S0 開工時讀此分頁 → 計算剩餘可用格位
- S1 / S3 也會讀此 → 軟驗證儲位是否存在

#### D. 發送人員清單（手維護 — Email 收件人）
| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| A | 姓名 | 文字 | 如 hill |
| B | 信箱 | 文字 | 如 hill.tsai@allyls.com.tw |

**範例**：
```
姓名    | 信箱
──────────────────────────────
hill    | hill.tsai@allyls.com.tw
Emma    | emma.wu@allyls.com.tw
Evonne  | evonne.lee@allyls.com.tw
嘉純    | jiachun.wu@allyls.com.tw
Frank   | frank.zeng@allyls.com.tw
```

#### E. 入庫單（APP 寫 — v7.0 改「依板明細」，v7.1 新增儲位欄）
**23 欄位**，順序固定：

| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| 1 | 廠商統編 | 文字 | |
| 2 | 廠商聯絡人 | 文字 | |
| 3 | 聯絡人電話 | 文字 | |
| 4 | 日期 | 日期 | YYYY-MM-DD |
| 5 | 時段 | 文字 | 上/中/下午 |
| 6 | 採購單號 | 文字 | |
| 7 | 來源單號 | 文字 | **ALLY-20260612-A-1-001** |
| 8 | 主檔備註 | 文字 | |
| 9 | 商品貨號 | 文字 | 如 BJ9321 |
| 10 | 商品名稱 | 文字 | |
| 11 | 數量 | 數字 | |
| 12 | 製造日期 | 日期 | 可空 |
| 13 | 有效日期 | 日期 | 可空 |
| 14 | 批號 | 文字 | 可空 |
| 15 | 商品條碼 | 文字 | EAN-13 |
| 16 | 群品 | 文字 | 可空 |
| 17 | 明細備註 | 文字 | 可空 |
| 18 | 入倉單號 | 文字 | 可空 |
| 19 | 虛擬倉 | 文字 | A47 / A49 / A35 / ... |
| 20 | 庫存等級屬性 | 文字 | 可空 |
| 21 | 版本號 | 文字 | 可空 |
| 22 | 原因代碼 | 文字 | 可空 |
| **23** | **儲位** | **文字** | **v7.0 新增；如 BA025（軟驗證用）** |

**關鍵說明**：
- 同一板、多 SKU → 多列共用同「來源單號」
- 每行代表一個 SKU 在該板上的數量
- 儲位欄（第23）應填該板最終儲位（可被覆寫）

#### F. 收貨狀態（APP 寫 — S8 新增，v7.1 強化）
**9 欄位**：

| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| 1 | 時間戳 | 時間 | YYYY-MM-DD HH:MM:SS |
| 2 | 車號 | 文字 | 如 BBB-2262 |
| 3 | 來源單號 | 文字 | ALLY-… （去重關鍵） |
| 4 | 收貨人 | 文字 | 登入者帳號 |
| 5 | 建議儲位 | 文字 | 入庫單第 23 欄 |
| 6 | 實際儲位 | 文字 | 現場刷碼結果 |
| 7 | 是否覆寫 | 文字 | Y / N |
| 8 | 覆寫原因 | 文字 | 如「原位被占」 |
| 9 | 狀態 | 文字 | 綠 / 黃 / 紅 |

**去重機制**（M2 防重覆）：
```
WHERE 來源單號 = ? AND 實際儲位 = ?
  IF EXISTS → 提示「已收貨」
  ELSE → 正常寫入
```

#### G. 操作記錄（APP 寫 — v7.1 新增分頁，H4 日誌）
**7 欄位**：

| 欄 | 欄位名 | 型別 | 說明 |
|----|--------|------|------|
| 1 | 時間戳 | 時間 | YYYY-MM-DD HH:MM:SS |
| 2 | 車號 | 文字 | |
| 3 | 趟次 | 數字 | 1 / 2 / 3 |
| 4 | 動作 | 文字 | 開工 / 掃描 / 確認封板 / 關單 |
| 5 | 明細 | 文字 | 如 ALLY-…-A1-001 |
| 6 | 棧板數 | 數字 | 當時已封板數 |
| 7 | 已掃箱數 | 數字 | 當時已掃商品箱數 |

---

## 部署清單

### 【A】Sheet 初始化（10 分鐘）

1. 打開試算表 ID：`1krZGpN4fCvTCgzCJLPjQPtE7eyo1vsR-gsChGTKWOM4`
2. 確認 7 個分頁存在（缺則新建）：
   - 司機清單
   - 商品清單
   - 儲位清單
   - 發送人員清單
   - 入庫單（若既有版本缺第 23 欄「儲位」→ **手動補欄**）
   - 收貨狀態
   - 操作記錄（若無 → 新建，GAS 會自動補表頭）
3. 填入示例資料（至少各 1 列）

### 【B】GAS 後端部署（5 分鐘）

1. Sheet → 擴充功能 → Apps Script
2. 清空既有 Code.gs，全文覆寫（見《GAS 完整部署清單》v7.1 版 Code.gs）
3. 存檔（Ctrl+S）

### 【C】授權（3 分鐘）

1. Code.gs 編輯器 → 函式下拉選 `doPost` → 執行 ▶
2. 跳授權提示 → 檢閱權限 → 選 hill7218@gmail.com
3. 「Google 尚未驗證」→ 進階 → 前往（不安全）
4. 勾選同意以下範圍：
   - 以你的名義傳送電子郵件
   - 查看、編輯、建立、刪除 Google 試算表
   - 查看、建立、刪除 Google Drive 檔案
   - 連線至外部服務
5. 授權完成

### 【D】部署為 Web App（5 分鐘）

1. Apps Script 右上 **部署 → 新增部署作業**
2. 類型 → **網頁應用程式**
3. 設定：
   - 說明：`ALLY LOTTE v7.1`
   - **執行身分**：hill7218@gmail.com
   - **具存取權者**：任何人
4. **部署** → 複製 Web App URL（形如 `https://script.google.com/macros/s/AKfyc.../exec`）
5. 貼到兩個 HTML：
   - `ALLY_LOTTE_WAREHOUSE_v7.0.html`：搜尋 `webAppUrl:` → 換新 URL
   - `ALLY_LOTTE_QR_PRINTER_v7.0.html`：填「Google Sheet ID」欄
6. 每次改 Code.gs → **部署 → 管理部署作業 → 編輯(鉛筆) → 版本選「新版本」→ 部署**

### 【E】PDA WebView 部署（10 分鐘）

**Android 範例**：
```java
// MainActivity.java
WebView webView = findViewById(R.id.webview);
webView.getSettings().setJavaScriptEnabled(true);
webView.getSettings().setDomStorageEnabled(true);  // 支援 localStorage
webView.loadUrl("file:///android_asset/ALLY_LOTTE_WAREHOUSE_v7.0.html");
```

**iOS Safari 或 Web 版本**：
```
https://your-domain.com/ALLY_LOTTE_WAREHOUSE_v7.0.html
```

---

## 測試計畫

### 冒煙測試（Smoke Test，發版前必過）

| # | 測試名稱 | 操作 | 預期結果 |
|----|---------|------|---------|
| E-1 | 讀取儲位清單 | 瀏覽器開 `{webAppUrl}?action=read&tab=儲位清單` | 回傳 JSON，values 含 AVAILABLE 儲位 |
| E-2 | 讀取發送人員 | 同上 `?action=read&tab=發送人員清單` | 回傳人員列表，信箱含 @ |
| E-3 | 寫入測試 | APP S0 開工 → S1 掃 1 板 → S3 確認封板 → S4 關單 | 「入庫單」新增列；「操作記錄」新增日誌列 |
| E-4 | Email + xlsx | 關單後檢查收件箱 | 5 位窗口收到主旨「樂天移倉入庫單｜…」，附件 .xlsx 可開啟 |
| E-5 | 軟驗證（S8） | 掃 S8 QR → 刷儲位 | 綠/黃/紅燈正確顯示；黃燈記錄覆寫原因 |

### 端到端流程驗證（CROSS_VALIDATION）

#### 場景 A：列印貼紙 → APP 掃描一致性
```
1. H1 列印器讀儲位清單 → 配發 BA012 給第 1 板
2. 列印 ALLY-20260612-A-1-001 QR + BA012 Code128
3. APP S1 掃該 QR → 掃該 Code128
4. 驗證：pallet.suggestedLoc === "BA012"
5. 預期：貼紙 + APP 儲位預配數值完全一致 ✓
```

#### 場景 B：預配儲位生效
```
1. S3 封板時不主動覆寫 → 取 pallet.suggestedLoc = "BA012"
2. buildWmsRows 第 23 欄儲位填 "BA012"
3. S4 關單上傳到「入庫單」分頁
4. S8 收貨刷該 QR → 查入庫單，建議位 = "BA012"
5. 預期：預配儲位真正出現在入庫單，非 assignLoc 重算 ✓
```

#### 場景 C：覆寫記錄
```
1. S3 原建議位 = "BA012"，現場被占
2. 使用者改為 "BA025"
3. pallet.loc = "BA025"；pallet.isOverwrite = true
4. 入庫單第 23 欄填 "BA025"
5. S8 刷儲位 "BA025" 時自動查出覆寫原因
6. 預期：覆寫在兩端（移出 + 收貨）完整記錄 ✓
```

#### 場景 D：黃燈軟驗證 + 去重
```
1. S8 掃 QR → 建議位 "BA012"
2. 現場刷 "BA025" → 黃燈亮起
3. 確認覆寫 → 寫「收貨狀態」：建議"BA012"，實際"BA025"，覆寫=Y
4. 再掃同一 QR，同一實位 "BA025" → 系統提示「已收貨」
5. 預期：去重生效，防重覆記錄 ✓
```

#### 場景 E：儲位不足兜底
```
1. H1 列印器配發 32 板儲位，但某走道只有 20 個 AVAILABLE
2. 第 21 板貼紙儲位欄印「—」（符號代表不足）
3. S1 掃該板 QR，無 suggestedLoc（因為「—」）
4. S3 封板時觸發 assignLoc() → 自動選下一走道
5. 預期：graceful fallback，無人為手寫錯誤 ✓
```

### 邊界條件測試

| 條件 | 測試操作 | 預期 |
|------|---------|------|
| 同板多 SKU | S1 掃同一 QR 但不同商品 ×3 | 入庫單 3 列共用同「來源單號」 |
| 數量差異異常 | S3 選「數量差異」狀態 → 關單 | 操作記錄記錄異常狀態；入庫單有標記 |
| 破損隔離 | S3 選「破損/QA-HOLD」 → S3 確認 | assignLoc 自動隔離到 A18 理賠區 |
| 網路中斷 | 關單過程中斷網 | localStorage 保留 ST，重連後自動重試上傳 |
| 儲位碼掃誤 | S8 掃入無效儲位碼 | 紅燈亮起，要求重掃 |

---

## 已知限制

### v7.1 現階段限制

| 項目 | 限制 | 建議 v7.2+ 改進 |
|------|------|-----------------|
| 列印器起始板號 | v7.1 固定從板號 1 開始預配 | 新增「起始板號」設定，支援斷檔續印 |
| 多趟同走道 | 同走道多趟會 usedCells 累加 | 按日期+走道分離統計，支援多日運營 |
| 照片無過期策略 | Google Drive 長期存儲 | 自動 30 日清理舊照片 |
| 無離線模式 | 完全依賴網路連線 | Service Worker + IndexedDB 本地快取 |
| 無使用者認證 | 任何人可操作 | OAuth 登入 + 角色權限管理 |
| 手機相機存取 | 需 HTML5 File API | 原生 App 包裝以支援實時相機拍照 |

### 已確認工作方式

- **QR Code 生成**：Google Charts API（無離線支援，但實際操作環境有網路）
- **Barcode 生成**：JsBarcode CDN（v7.1 已整合）
- **Firebase 已移除**：v7.0+ 用 Google Drive + GAS 替代
- **CSV vs xlsx**：GAS 後端支援兩種格式，APP 可選

---

## 附錄

### 快速參考：常用 API

```bash
# 讀儲位清單
curl "https://script.google.com/macros/s/AKfyc.../exec?action=read&tab=儲位清單"

# 寫入庫單
curl -X POST "https://script.google.com/macros/s/AKfyc.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "append",
    "tab": "入庫單",
    "rows": [["…23欄…"]]
  }'

# 寄 Email
curl -X POST "https://script.google.com/macros/s/AKfyc.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "sendMail",
    "to": "hill.tsai@allyls.com.tw",
    "subject": "樂天移倉",
    "csv": "品號,品名\n…",
    "format": "xlsx"
  }'
```

### 關鍵概念詞彙表

| 詞彙 | 定義 |
|------|------|
| **來源單號** | ALLY-YYYYMMDD-[AB]-[1-3]-[001-192]，唯一識別每一板 |
| **儲位** | BA012 等，實體位置代碼（走道+層級+格位） |
| **軟驗證** | 收貨端刷儲位時自動對比建議位，綠/黃/紅燈反饋 |
| **覆寫** | 實際儲位 ≠ 建議儲位，操作員確認並記錄原因 |
| **去重** | 防止同一板同一儲位被重覆記錄（M2 機制） |
| **貼紙預配** | H1 事前配發每板的儲位建議，印在貼紙上 |
| **工作流** | 核查模式（S3 多驗證）vs 快速模式（直接封板） |

---

**編輯者**：Claude Code  
**版本日期**：2026-06-18  
**部署帳號**：hill7218@gmail.com
