# 📷 拍照驗收系統完整指南（photo.html v2）

**用途**：移倉現場拍照驗收、自動上傳雲端、操作日誌追蹤  
**適用場景**：倉儲驗收、棧板入庫驗證、品質檢驗、交付驗證  
**部署平台**：GitHub Pages + Google Drive + Google Sheets  
**開發時間參考**：3-5 天（含 GAS 後端配置）

---

## 🎯 核心流程（STATE MACHINE）

```
STATE: "scan"
   ↓ 掃描 QR Code (QR 自動偵測)
   ↓ 或手動輸入板號
   ↓
STATE: "confirm"
   ↓ 系統自動帶出商品資訊 (SKU/品名/數量)
   ↓ 操作員目視確認
   ↓ 按「確認」
   ↓
STATE: "photo"
   ↓ 相機啟動
   ↓ 拍照 4 張 (可重拍)
   ↓ 按「上傳」
   ↓
STATE: "done"
   ↓ 照片上傳 Google Drive
   ↓ 操作記錄寫入 Google Sheet
   ↓ 返回 "scan" (處理下一板)
```

---

## 📱 UI 設計

### 版面（手機屏幕 390px × 844px）

```
┌─────────────────────────────┐
│ 📷 照相驗收           🔍 掃描中 │  ← Header (status)
├─────────────────────────────┤
│                             │
│    【相機視訊區域】          │  ← Video element
│    (480×360px, aspect 4/3)  │  ← QR 掃描框自動偵測
│                             │
├─────────────────────────────┤
│  板號   LOTTE-...-001       │
│  商品   BK9275              │  ← Info panel
│  名稱   LOTTE Pepero ...    │     (自動填充)
│  數量   80 箱 / 3200 件     │
├─────────────────────────────┤
│                             │
│  ✅ QR Code 已辨識          │  ← Message (Toast)
│  確認後拍照                  │
│                             │
├─────────────────────────────┤
│  ↩ 重新掃描  📷 確認拍照     │  ← Buttons (dynamic)
└─────────────────────────────┘
```

### CSS 關鍵配置

```css
/* 手機容器 */
body {
  max-width: 390px;
  margin: 0 auto;
  background: #f0f0f0;
  overflow-y: auto;  /* ⚠️ 重要：允許滾動，避免按鈕被裁剪 */
}

/* 相機區域 */
#video {
  width: 100%;
  max-height: 280px;  /* ⚠️ 限制高度，給其他元素空間 */
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 8px;
}

/* QR 掃描框 */
.scanbox {
  position: absolute;
  width: 240px;
  aspect-ratio: 1;
  border: 3px solid #00e676;
  border-radius: 8px;
  box-shadow: 0 0 0 600px rgba(0,0,0,.45);
}

/* 商品資訊面板 */
.info {
  background: rgba(255,255,255,.96);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 11px;
  transition: all .3s;
}

.info.on {
  border: 2px solid #007B6F;
  box-shadow: 0 0 12px rgba(0,123,111,.3);
}

/* Toast 通知 */
.msg {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  transition: all .3s;
}

.msg.info { background: #d1ecf1; color: #0c5460; }
.msg.ok { background: #d4edda; color: #155724; }
.msg.error { background: #f8d7da; color: #721c24; }

/* 按鈕 */
.button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 9px;
  font-weight: 700;
  color: #fff;
  transition: all .2s;
}

.button.primary { background: #007B6F; }
.button.secondary { background: #6B7A99; }
.button:active { transform: scale(.95); }
```

---

## 🔧 核心代碼結構

### 1️⃣ 初始化配置

```javascript
// ⚙️ 配置檔（必須修改）
const CONFIG = {
  // Google Apps Script Web App URL
  webAppUrl: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  
  // 使用的 Sheet 分頁名稱
  palletTab: '棧板資訊',        // 需包含: sourceId, sku, name, qtyBox, qtyPcs
  logTab: '照相記錄',            // 自動建立，記錄每次掃描/上傳
  
  // Google Drive 資料夾 ID
  photoFolder: 'YOUR_FOLDER_ID',  // 存放照片的資料夾
  
  // 應用程式名稱（用於日誌和錯誤信息）
  appName: '照相驗收',
  appVersion: '2.0'
};

// 狀態機
let STATE = 'scan';  // 'scan' | 'confirm' | 'photo' | 'done'

// 當前棧板資訊
let currentPallet = null;

// 本機快取（減少 API 呼叫）
let palletCache = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000;  // 5 分鐘
```

### 2️⃣ QR 掃描引擎（jsQR）

```javascript
// ✅ QR 自動偵測（requestAnimationFrame 循環）
async function startQRScanning() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  
  // 要求攝影機權限
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = stream;
  } catch (err) {
    toast('無法存取攝影機', true);
    return;
  }
  
  let scanLocked = false;  // 防止短時間內重複掃描
  
  function scan() {
    // 將 video frame 捕捉到 canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 用 jsQR 庫進行二維碼識別
    const qr = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    
    if (qr && qr.data && !scanLocked) {
      scanLocked = true;
      
      // 防止 100ms 內重複觸發
      setTimeout(() => { scanLocked = false; }, 100);
      
      // 辨識成功回調
      onQRFound(qr.data);
    }
    
    // 持續掃描
    requestAnimationFrame(scan);
  }
  
  scan();
}

// 🎯 QR 碼辨識成功
async function onQRFound(qrContent) {
  // QR 內容可能是：
  // 1. 純文本 sourceId: "LOTTE-20260622-Air_con622_1-001"
  // 2. JSON: {"s":"LOTTE-...", "o":"20260622-001", "k":"BK9275", "d":"BA012"}
  
  let sourceId = qrContent;
  
  try {
    const json = JSON.parse(qrContent);
    sourceId = json.s || json.sourceId;
  } catch (e) {
    // 不是 JSON，當作純文本處理
  }
  
  // 狀態轉移：scan → confirm
  await transitionToConfirm(sourceId);
}
```

### 3️⃣ 商品資訊自動帶出

```javascript
// 📦 從 Google Sheet 取得棧板資訊
async function fetchPalletInfo(sourceId) {
  // 先查本機快取
  if (palletCache && Date.now() - cacheTime < CACHE_DURATION) {
    const cached = palletCache.find(p => p[0] === sourceId);
    if (cached) return parsePalletRow(cached);
  }
  
  // 快取過期，重新從 Google Sheet 取
  try {
    const res = await fetch(CONFIG.webAppUrl + '?tab=' + encodeURIComponent(CONFIG.palletTab));
    const json = await res.json();
    
    if (json.ok && Array.isArray(json.values)) {
      palletCache = json.values;
      cacheTime = Date.now();
      
      const row = json.values.find(p => p[0] === sourceId);
      if (row) return parsePalletRow(row);
    }
  } catch (err) {
    console.error('取得棧板資訊失敗', err);
  }
  
  return null;
}

// 解析 Sheet 行資料
function parsePalletRow(row) {
  return {
    sourceId: row[0],
    sku: row[1],
    name: row[2],
    qtyBox: row[3],
    qtyPcs: row[4],
    destLocation: row[5]
  };
}

// 🔄 狀態轉移：scan → confirm
async function transitionToConfirm(sourceId) {
  // 取得商品資訊
  const pallet = await fetchPalletInfo(sourceId);
  
  if (!pallet) {
    toast('找不到棧板資訊，請手動輸入或檢查 QR Code', true);
    return;
  }
  
  currentPallet = pallet;
  STATE = 'confirm';
  
  // 更新 UI
  document.getElementById('v-id').textContent = pallet.sourceId;
  document.getElementById('v-sku').textContent = pallet.sku;
  document.getElementById('v-name').textContent = pallet.name;
  document.getElementById('v-qty').textContent = `${pallet.qtyBox} 箱 / ${pallet.qtyPcs} 件`;
  
  document.getElementById('info').classList.add('on');
  document.getElementById('scanbox').style.opacity = '0';
  
  toast('✅ QR Code 已辨識，確認後拍照', 'ok');
  
  // 更新按鈕：「重新掃描」+ 「確認拍照」
  updateButtons('confirm');
}
```

### 4️⃣ 拍照功能

```javascript
// 📸 拍照按鈕觸發
async function takePhoto(photoIndex) {
  // photoIndex: 0-3 (最多 4 張照片)
  
  // 1. 打開檔案選擇器或相機應用程式
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';  // 優先用後置相機
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 2. 壓縮圖片 (可選，減少上傳流量)
    const compressed = await compressImage(file);
    
    // 3. 儲存到本機 (localStorage)
    const reader = new FileReader();
    reader.onload = (evt) => {
      currentPhotos[photoIndex] = {
        data: evt.target.result,
        timestamp: Date.now(),
        fileName: `${currentPallet.sourceId}_${photoIndex}_${fmtStamp(Date.now())}.jpg`
      };
      
      updatePhotoPreview(photoIndex);
      toast(`✅ 照片 ${photoIndex + 1} 已保存`, 'ok');
    };
    reader.readAsDataURL(compressed);
  };
  
  input.click();
}

// 📊 圖片壓縮
async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 限制最大尺寸 1280px
        const maxSize = 1280;
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w *= ratio;
          h *= ratio;
        }
        
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        
        // 轉換為 JPEG (80% 品質)
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// 📋 更新拍照預覽
function updatePhotoPreview(photoIndex) {
  const preview = document.getElementById(`photo-preview-${photoIndex}`);
  if (preview && currentPhotos[photoIndex]) {
    preview.style.backgroundImage = `url(${currentPhotos[photoIndex].data})`;
    preview.classList.add('filled');
  }
}

// ✅ 完成此棧板
function completeCurrentPallet() {
  if (currentPhotos.filter(p => p).length === 0) {
    toast('請至少拍攝 1 張照片', true);
    return;
  }
  
  // 狀態轉移：photo → done
  STATE = 'done';
  
  // 記錄操作
  addLog({
    action: '完成棧板',
    sourceId: currentPallet.sourceId,
    photoCount: currentPhotos.filter(p => p).length,
    timestamp: new Date().toISOString()
  });
  
  // 立即上傳（或等待批量上傳）
  uploadPhotosToGoogleDrive();
}

// ☁️ 上傳照片到 Google Drive
async function uploadPhotosToGoogleDrive() {
  const toUpload = currentPhotos.filter(p => p);
  
  for (const photo of toUpload) {
    try {
      // 轉換 Data URL 為 Blob
      const response = await fetch(photo.data);
      const blob = await response.blob();
      
      // 呼叫 GAS Web App 處理上傳
      const formData = new FormData();
      formData.append('action', 'uploadPhoto');
      formData.append('sourceId', currentPallet.sourceId);
      formData.append('orderId', currentPallet.orderId || '');
      formData.append('file', blob, photo.fileName);
      formData.append('timestamp', photo.timestamp);
      
      const res = await fetch(CONFIG.webAppUrl, {
        method: 'POST',
        body: formData
      });
      
      const json = await res.json();
      
      if (json.ok) {
        toast(`✅ 照片已上傳: ${photo.fileName}`, 'ok');
      } else {
        throw new Error(json.error || '上傳失敗');
      }
    } catch (err) {
      toast(`❌ 上傳失敗: ${err.message}`, true);
    }
  }
  
  // 清空暫存，準備掃描下一板
  resetForNextPallet();
}

// 🔄 重置狀態，準備掃描下一板
function resetForNextPallet() {
  STATE = 'scan';
  currentPallet = null;
  currentPhotos = [null, null, null, null];
  
  // 清空 UI
  document.getElementById('v-id').textContent = '— 掃描後顯示 —';
  ['sku', 'name', 'qty'].forEach(k => {
    document.getElementById(`v-${k}`).textContent = '—';
  });
  
  document.getElementById('info').classList.remove('on');
  document.getElementById('scanbox').style.opacity = '1';
  
  // 重新啟動掃描
  startQRScanning();
}
```

### 5️⃣ Google Sheets 操作記錄

```javascript
// 📝 記錄操作到本機
let operationLog = JSON.parse(localStorage.getItem('operationLog') || '[]');

function addLog(entry) {
  entry.timestamp = entry.timestamp || new Date().toISOString();
  operationLog.push(entry);
  
  localStorage.setItem('operationLog', JSON.stringify(operationLog));
  
  // 同時嘗試同步到 Google Sheet
  syncLogsToSheet();
}

// ☁️ 同步操作記錄到 Google Sheet
async function syncLogsToSheet() {
  const unsyncedLogs = operationLog.filter(log => !log.synced);
  
  if (unsyncedLogs.length === 0) return;
  
  try {
    const res = await fetch(CONFIG.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'appendLogs',
        logs: unsyncedLogs
      })
    });
    
    const json = await res.json();
    
    if (json.ok) {
      // 標記已同步
      unsyncedLogs.forEach(log => { log.synced = true; });
      localStorage.setItem('operationLog', JSON.stringify(operationLog));
      
      toast(`✅ ${unsyncedLogs.length} 筆操作記錄已同步`, 'ok');
    }
  } catch (err) {
    console.error('同步失敗', err);
    // 失敗時保留在本機，等待重試
  }
}
```

---

## 🌐 Google Apps Script (GAS) 後端

### 必須部署的 GAS 程式碼

```javascript
// Apps Script 新建專案後貼入 Code.gs

function doGet(e) {
  const tab = e.parameter.tab;
  
  if (!tab) {
    return ContentService.createTextOutput(JSON.stringify({ 
      error: '缺少 tab 參數' 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
  
  try {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ 
        ok: false, 
        error: `Sheet "${tab}" 不存在` 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = sheet.getDataRange().getValues();
    
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      values: data 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const action = e.parameter.action || e.postData.parameters.action;
  
  const ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
  
  if (action === 'appendLogs') {
    const logs = JSON.parse(e.postData.contents).logs;
    const logSheet = getOrCreateSheet(ss, '照相記錄');
    
    // 寫入表頭
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(['時間戳', '車號', '板號', '操作', '詳情', '狀態']);
    }
    
    // 寫入日誌
    logs.forEach(log => {
      logSheet.appendRow([
        log.timestamp,
        log.truck || '—',
        log.sourceId || '—',
        log.action || '—',
        log.details || '—',
        'OK'
      ]);
    });
    
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      message: '日誌已記錄' 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'uploadPhoto') {
    const sourceId = e.parameter.sourceId;
    const file = e.parameter.file;
    
    // 上傳到 Google Drive 資料夾
    const folder = DriveApp.getFolderById('YOUR_FOLDER_ID');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${sourceId}_${timestamp}.jpg`;
    
    folder.createFile(file, fileName);
    
    // 記錄到 Sheet
    const logSheet = getOrCreateSheet(ss, '照相記錄');
    logSheet.appendRow([
      new Date().toLocaleString('zh-TW'),
      '—',
      sourceId,
      '照片上傳',
      fileName,
      'OK'
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      message: '照片已上傳',
      fileName: fileName
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    ok: false, 
    error: '未知的操作' 
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}
```

### GAS 部署步驟

```
1. 開啟 Google Apps Script: script.google.com
2. 建立新專案 → 命名為「ALLY_LOTTE_Photo_Backend」
3. 貼入上述 Code.gs 代碼
4. 修改 YOUR_SHEET_ID 和 YOUR_FOLDER_ID
5. 另存為版本 (Ctrl+S)
6. 部署 → 新增部署 → 類型: Web 應用程式
   - 執行身分: 你的帳號
   - 誰可以存取: 任何人
7. 複製 Web 應用程式 URL
8. 將 URL 貼入 photo.html 的 CONFIG.webAppUrl
```

---

## 🚀 部署檢查清單

### 前置準備

- [ ] 建立 Google Sheet（包含「棧板資訊」分頁）
- [ ] 建立 Google Drive 資料夾用於存放照片
- [ ] 建立 Google Apps Script Web App
- [ ] 取得 Web App URL 和 Script ID
- [ ] 取得 Google Drive 資料夾 ID

### HTML 檔案配置

- [ ] 修改 `CONFIG.webAppUrl`
- [ ] 修改 `CONFIG.photoFolder`
- [ ] 驗證 `CONFIG.palletTab` 名稱與 Google Sheet 一致
- [ ] 驗證必要的 JavaScript 庫已載入 (jsQR)

### Google Sheet 準備

- [ ] 「棧板資訊」分頁存在，包含欄位：sourceId, sku, name, qtyBox, qtyPcs
- [ ] 資料已導入（至少 1 筆測試資料）
- [ ] 「照相記錄」分頁自動建立（不需手動建立）

### 測試流程

```
1. 用瀏覽器開啟 photo.html
2. 允許相機權限
3. 準備測試資料：
   - QR Code (可用手機生成測試 QR)
   - 或手動輸入板號
4. 掃描 QR → 應顯示商品資訊
5. 拍照 → 應上傳到 Google Drive
6. 檢查 Google Sheet「照相記錄」是否有紀錄
```

---

## 📊 資料結構參考

### Google Sheet「棧板資訊」

```
| sourceId                       | sku    | name              | qtyBox | qtyPcs |
|:-------------------------------|:-------|:------------------|:-------|:-------|
| LOTTE-20260622-Air_con622_1-001| BK9275 | LOTTE Pepero...   | 80     | 3200   |
| LOTTE-20260622-Air_con622_1-002| BK9275 | LOTTE Pepero...   | 80     | 3200   |
```

### 操作日誌結構

```javascript
{
  timestamp: "2026-06-22T10:30:45.123Z",
  sourceId: "LOTTE-20260622-Air_con622_1-001",
  action: "拍照上傳",
  photoCount: 4,
  details: "4 張照片已上傳 Google Drive",
  synced: true
}
```

---

## 🔐 安全建議

### 開發版 (現在)
- GAS doGet/doPost 不驗證身分
- 任何人都可以存取 API
- ✅ 適合內部測試

### 生產版 (部署前必須)
1. **驗證使用者身分**
   ```javascript
   function verifyUser(e) {
     const token = e.parameter.token || e.postData.parameters.token;
     // 實現 OAuth 或 API Key 驗證
   }
   ```

2. **限制 API 存取**
   - GAS Web App 改為「所在單位的使用者」而非「任何人」
   - 搭配 OAuth 2.0 驗證

3. **加密敏感資訊**
   - 在 GAS 中設定環境變數 (不要在前端硬編碼)
   - 使用 PropertiesService 儲存 API Key

4. **紀錄審計**
   - 記錄每次上傳的使用者、時間、內容
   - 定期備份 Google Sheet

---

## 🆘 常見問題

### Q1: 相機無法啟動
A: 檢查瀏覽器權限。大多數瀏覽器需要 HTTPS (GitHub Pages 自動支援)。

### Q2: QR Code 掃不出來
A: 
- 確認 jsQR 庫已正確載入
- 測試 QR Code 質量（不要手寫、確保清晰）
- 試試手動輸入模式作為備方案

### Q3: 照片上傳失敗
A:
- 檢查 Google Apps Script Web App 是否部署正確
- 檢查 CONFIG.webAppUrl 是否正確
- 檢查 Google Drive 資料夾 ID 是否正確
- 檢查瀏覽器控制台錯誤訊息

### Q4: Google Sheet 沒有紀錄
A:
- 確認「照相記錄」分頁存在（或手動建立）
- 檢查 GAS 程式是否正確執行 (Apps Script 編輯器 → 執行日誌)
- 檢查權限：GAS Web App 要設定為「任何人」(or 指定網域)

### Q5: 離線模式可以嗎？
A: 不行。photo.html v2 需要連接 Google Sheet 取得商品資訊和 Google Drive 上傳照片。但可以先在本機存照片 (localStorage)，稍後上傳。

### Q6: 可以編輯已上傳的照片嗎？
A: 不行。系統設計是一次性上傳。若要修改，手動從 Google Drive 刪除後重新掃描。

---

## 📚 參考文件

- GitHub Pages 部署：`https://github.com/hill7218-svg/ui-ux-pro-max-skill`
- GAS 完整部署清單：`ALLY_LOTTE_GAS_完整部署清單.md`
- 操作演示動畫：`demo_動畫.html`
- 貼紙系統指南：`01_貼紙生成系統_v7-v8演進.md`

