# ALLY × LOTTE 移倉對點 APP v5 - 集成完整指南

## 📱 改造說明

基於原始HTML架構的完整功能升級，添加了：

✅ **Firebase Storage** - 照片上傳到雲端  
✅ **Google Sheets 同步** - 操作日誌和棧板記錄  
✅ **QR Code SVG生成** - 每個棧板對應的入庫二維碼  
✅ **實時拍照功能** - 支持4張照片記錄  
✅ **操作日誌面板** - 完整的時間戳操作記錄  

---

## 🔧 配置步驟

### 第1步：Firebase 配置

#### 1.1 建立 Firebase 項目
1. 打開 [Firebase Console](https://console.firebase.google.com)
2. 新建項目或使用現有項目
3. 啟用 **Cloud Storage**

#### 1.2 設定 Storage 規則
在 Firebase Console → Storage → 規則，設定：

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /warehouse/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

#### 1.3 複製配置到 HTML
在 `ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html` 中找到：

```javascript
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET.appspot.com",
  appId: "YOUR_APP_ID"
};
```

替換為你的實際配置（在 Firebase Console → 項目設定 → 應用程式中獲取）

---

### 第2步：Google Sheets 配置

#### 2.1 建立 Google Sheet
1. 打開 [Google Sheets](https://sheets.google.com)
2. 新建表格，命名為「ALLY LOTTE 對點系統」
3. 建立以下列：

```
| 時間戳 | 車號 | 棧板ID | 位置 | 商品數 | 狀態 | 操作時間 |
| A | B | C | D | E | F | G |
```

#### 2.2 啟用 Google Sheets API
1. 打開 [Google Cloud Console](https://console.cloud.google.com)
2. 啟用「Google Sheets API」
3. 建立「服務帳號」或「API 金鑰」

#### 2.3 複製配置到 HTML
在 HTML 中找到：

```javascript
const GOOGLE_SHEETS_API_KEY = "YOUR_GOOGLE_SHEETS_API_KEY";
const GOOGLE_SHEETS_ID = "YOUR_SHEET_ID";
```

**取得 SHEET_ID**:
- 打開 Google Sheet
- URL 中 `/d/` 後面的文本就是 SHEET_ID
- 例：`https://docs.google.com/spreadsheets/d/1X2Y3Z/edit` → ID = `1X2Y3Z`

---

## 🚀 功能使用指南

### 1. 掃描棧板 (S1 屏幕)

#### 拍照功能
```
1. 在「拍照記錄」區點擊任意照片格 (📷)
2. 選擇照片 → 自動上傳到 Firebase
3. 照片網格會實時顯示已上傳的圖片
4. 系統會記錄上傳時間戳到操作日誌
```

**支持拍照：**
- 開箱狀態照片
- 貨物狀態
- 標籤確認
- 其他檢查記錄

### 2. QR Code 生成

#### 生成 QR Code
```
1. 選擇一個棧板 (自動調用 displayPalletQRCode)
2. 在「🔳 顯示 QR Code 面板」點擊展開
3. 系統自動生成包含以下信息的二維碼：
   - 車號 (truck)
   - 棧板ID (pallet)
   - 位置 (location)
   - 時間戳 (timestamp)
```

#### 下載 QR Code
```
1. 點擊「⬇️ 下載 SVG」按鈕
2. 自動下載 PNG 格式 QR Code
3. 文件名格式: QRCode_{棧板ID}_{時間戳}.png
4. 可打印或用於標籤
```

#### QR Code 內容（JSON 格式）
```json
{
  "truck": "BBB-2262",
  "pallet": "PA0001",
  "location": "BA-001-01",
  "timestamp": "2026-06-12T10:30:00Z"
}
```

### 3. 操作日誌

#### 日誌功能
```
自動記錄：
- ⏰ 時間戳 (完整時間: 年-月-日 時:分:秒)
- 📋 操作類型 (掃描、拍照、QR Code等)
- 📊 棧板數量
- 📦 掃描物品數

手動查看：
1. 點擊「📋 操作日誌」按鈕展開
2. 顯示最近20條操作記錄
3. 可向上滾動查看更多歷史
```

#### 日誌記錄示例
```
[2026-06-12 10:30:45] 系統啟動 - 應用程式載入完成
[2026-06-12 10:31:12] 照片上傳 - 索引 0
[2026-06-12 10:31:25] QR Code 生成 - 棧板 PA0001
[2026-06-12 10:32:10] Google Sheets 同步 - 已上傳 5 筆棧板記錄
```

### 4. Google Sheets 同步

#### 同步數據
```
1. 點擊「☁️ 同步 Google Sheets」按鈕
2. 應用會上傳：
   - 所有棧板信息 (ID、位置、狀態)
   - 當前操作時間
   - 車號信息
3. 成功時顯示 ✅ 提示
4. 日誌自動記錄同步事件
```

#### 同步內容
```
每一行記錄包含：
- 時間戳 (最新同步時間)
- 車號
- 棧板ID
- 位置
- 商品數量
- 狀態 (locked/unlocked)
- 操作時間
```

---

## 🔐 安全建議

### Firebase Security
- **生產環境**：修改 Storage 規則，只允許認證用戶
- **原型測試**：可保持 `allow read, write: if true`

### Google Sheets Security
- **API 金鑰**：不要在客戶端代碼暴露（應使用後端代理）
- **服務帳號**：建議使用服務帳號而非 API 金鑰

### 生產部署建議
```
1. Firebase Rules → 改為要求認證
2. Google Sheets → 使用 OAuth 2.0
3. 照片 → 添加訪問控制和有效期設定
4. 日誌 → 定期備份到冷存儲
```

---

## 📊 數據流程

```
┌─────────────────────────────────────────────┐
│ 用戶在應用中進行操作                          │
│ (掃描、拍照、生成QR Code)                    │
└────────┬────────────────────────────────────┘
         │
         ├─→ 📷 照片 → Firebase Storage
         │   (warehouse/{truck}/{timestamp}/)
         │
         ├─→ 📋 日誌 → 本地存儲
         │   (operationLog[])
         │
         ├─→ 🔳 QR Code → Google Chart API
         │   (JSON data → PNG)
         │
         └─→ ☁️  同步 → Google Sheets
             (API v4 append)
```

---

## 🧪 測試流程

### 完整測試 (5分鐘)

1. **系統啟動**
   ```
   打開 ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html
   檢查狀態欄 (左上角應顯示時間)
   檢查網絡指示器 (綠點表示在線)
   ```

2. **拍照測試**
   ```
   進入 S1 屏幕 (掃描棧板)
   點擊任意 📷 照片格
   選擇本地照片上傳
   確認照片顯示在網格中
   檢查日誌記錄「照片上傳」事件
   ```

3. **QR Code 測試**
   ```
   創建或選擇一個棧板
   點擊「🔳 顯示 QR Code 面板」
   確認 QR Code 圖片顯示
   點擊「⬇️ 下載 SVG」
   確認 PNG 文件下載
   ```

4. **Google Sheets 同步**
   ```
   配置好 API 金鑰和 Sheet ID
   點擊「☁️ 同步 Google Sheets」
   檢查 Google Sheet 是否收到數據
   確認行數增加
   ```

5. **日誌檢查**
   ```
   點擊「📋 操作日誌」展開
   確認所有操作都被記錄
   檢查時間戳格式正確
   ```

---

## ⚙️ 常見問題

| 問題 | 解決方案 |
|------|--------|
| Firebase 配置警告 | 檢查 API Key 是否正確，確保 Storage 已啟用 |
| 照片上傳失敗 | 檢查網絡連接，確保 Firebase 規則允許上傳 |
| QR Code 不顯示 | Google Chart API 可能被限制，檢查網絡 |
| Google Sheets 同步失敗 | 檢查 API Key、Sheet ID、列名是否正確 |
| 日誌無法記錄 | 刷新頁面，檢查瀏覽器控制台錯誤信息 |

---

## 🎨 UI 說明

### 新增功能區域 (S1 屏幕末尾)
- **「🆕 集成功能」** - 深色卡片，金色邊框
- **「📷 拍照記錄」** - 2×2 網格，支持預覽
- **「🔳 QR Code 面板」** - 可展開/隱藏
- **「📋 操作日誌」** - 可展開/隱藏，最多顯示20條
- **「☁️ 同步」按鈕** - 綠色主題

### 色彩方案
```css
--gold: #FFD700    /* QR Code 按鈕 */
--green: #00C896   /* 成功/同步 */
--red: #C00000     /* 錯誤 */
--amber: #D4820A   /* 警告 */
```

---

## 📦 文件清單

```
ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html
  - 主應用文件 (~1100 行)
  - 包含完整的 HTML + CSS + JavaScript
  - 無外部依賴（除了 CDN 資源）

ALLY_LOTTE_v5_INTEGRATION_GUIDE.md
  - 本配置指南
```

---

## 🚀 部署選項

### 選項 1: 本地測試
```bash
# 直接在瀏覽器打開
open ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html
```

### 選項 2: 簡單 HTTP 服務器
```bash
# Python
python3 -m http.server 8000

# Node.js
npx http-server
```

### 選項 3: Android PDA 部署
```java
// WebView 方式（推薦）
WebView webView = findViewById(R.id.webview);
webView.getSettings().setJavaScriptEnabled(true);
webView.loadUrl("file:///android_asset/ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html");
```

---

## 📈 後續優化建議

1. **後端服務** - 建立後端 API 代理 Google Sheets（避免暴露 API Key）
2. **身份驗證** - 添加登陸和操作員管理
3. **實時同步** - 改用 Firebase Realtime Database
4. **離線支持** - 添加 Service Worker 支持
5. **數據分析** - 整合數據看板和統計報表
6. **批量操作** - 支持批量上傳照片和批量生成 QR Code

---

## 📞 技術支持

### 檢查清單
- [ ] Firebase 配置正確
- [ ] Google Sheets API 已啟用
- [ ] Sheet ID 正確複製
- [ ] 網絡連接正常
- [ ] 瀏覽器允許照片上傳權限

### Debug 模式
在瀏覽器控制台 (F12) 執行：
```javascript
// 查看完整操作日誌
console.log(operationLog);

// 查看應用狀態
console.log(ST);

// 手動同步測試
syncToGoogleSheets();
```

---

**Happy Warehousing! 🎉**

版本: v5 Integrated  
最後更新: 2026-06-12  
